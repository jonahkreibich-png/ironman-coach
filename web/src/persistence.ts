import { mergeStored } from './storage-merge';
/* Kompatibler Speicher mit bestaetigtem IndexedDB-Ausweichweg. */
export interface Journal {
  read(): Promise<[string, string | null][]>;
  write(entries: [string, string | null][]): Promise<void>;
  update?(key: string, change: (current: string | null) => string): Promise<string>;
}
export class DurableStorage {
  private fallback = new Map<string, string | null>();
  private failed = new Set<string>();
  // A failed commit never becomes the baseline for a retry.
  private failedMergeBaseline = new Map<string,string>();
  private unreadable = new Set<string>();
  private pending = 0;
  private flight: Promise<void> = Promise.resolve();
  onChange: () => void = () => {};
  changing = false;
  epoch = 0;
  beginChange() { if (this.changing) throw new Error('Wiederherstellung laeuft bereits.'); this.changing = true; this.epoch++; }
  endChange() { this.changing = false; }
  constructor(private native: () => Storage, private journal?: Journal) {}
  async initialize() {
    if (!this.journal) return;
    for (const [key, value] of await this.journal.read()) this.fallback.set(key, value);
  }
  getItem(key: string): string | null {
    if (this.fallback.has(key)) return this.fallback.get(key)!;
    try { return this.native().getItem(key); }
    catch (e) { this.unreadable.add(key); this.onChange(); throw e; }
  }
  block(key: string) { this.unreadable.add(key); this.onChange(); }
  get blocked() { return this.unreadable.size > 0; }
  get status(): 'saved' | 'pending' | 'error' | 'blocked' {
    return this.blocked ? 'blocked' : this.failed.size ? 'error' : this.pending ? 'pending' : 'saved';
  }
  keys(): string[] { return [...new Set([...Object.keys(this.native()), ...this.fallback.keys()])]; }
  setItem(key: string, value: string): boolean { return this.write(key, String(value)); }
  removeItem(key: string): boolean { return this.write(key, null); }
  setMergedItem(key: string, value: string, baseline: string): boolean {
    // Der Zustands-Snapshot hat in allen Tabs denselben atomaren Schreibpfad.
    if (!this.journal?.update) return this.setItem(key, value);
    if (this.unreadable.has(key)) return false;
    this.fallback.set(key, value); this.pending++; this.onChange();
    this.flight = this.flight.then(async () => {
      const mergeBaseline=this.failedMergeBaseline.get(key) ?? baseline;
      try {
        const written = await this.journal!.update!(key, current => {
          const conflicts: any[] = [];
          const local = JSON.parse(value);
          const merged = mergeStored(JSON.parse(mergeBaseline), local, current == null ? JSON.parse(mergeBaseline) : JSON.parse(current), conflicts);
          if (conflicts.length) merged.storageConflicts = [...(merged.storageConflicts || []), {at:Date.now(),values:conflicts}];
          return JSON.stringify(merged);
        });
        if (this.fallback.get(key) === value) this.fallback.set(key, written);
        // Kompatible Lesekopie fuer aeltere Exporte; kanonisch bleibt IndexedDB.
        try { this.native().setItem(key, written); } catch (_) {}
        this.failed.delete(key);this.failedMergeBaseline.delete(key);
      } catch (_) { this.failed.add(key);this.failedMergeBaseline.set(key,mergeBaseline); }
      finally { this.pending--; this.onChange(); }
    });
    return false;
  }
  async refresh(): Promise<void> {
    await this.flight;
    if (this.journal) {
      const entries = await this.journal.read();
      for (const [k,v] of entries) if (!this.failed.has(k)) this.fallback.set(k,v);
    }
  }
  private write(key: string, value: string | null): boolean {
    if (this.unreadable.has(key)) return false;
    if (!this.fallback.has(key)) {
      try {
        if (value == null) this.native().removeItem(key); else this.native().setItem(key, value);
        this.failed.delete(key); this.onChange(); return true;
      } catch (_) { /* alter Stand bleibt; asynchroner Ausweichspeicher */ }
    }
    this.fallback.set(key, value);
    this.enqueue([[key, value]]); return false;
  }
  private enqueue(entries: [string, string | null][]) {
    this.pending++; this.onChange();
    this.flight = this.flight.then(async () => {
      try {
        if (!this.journal) throw new Error('IndexedDB nicht verfuegbar');
        await this.journal.write(entries);
        entries.forEach(([key]) => {this.failed.delete(key);this.failedMergeBaseline.delete(key);});
      } catch (_) { entries.forEach(([key]) => this.failed.add(key)); }
      finally { this.pending--; this.onChange(); }
    });
  }
  async settled(): Promise<boolean> {
    do { const current = this.flight; await current; if (current === this.flight) break; } while (true);
    return this.status === 'saved';
  }
  async commit(entries: [string, string | null][]): Promise<void> {
    if (this.blocked) throw new Error('Vorhandene Daten konnten nicht gelesen werden. Wiederherstellung abgebrochen.');
    await this.flight;
    if (!this.journal) throw new Error('Sicheres Wiederherstellen braucht verfuegbaren Browserspeicher.');
    await this.journal.write(entries);
    entries.forEach(([k, v]) => {
      this.fallback.set(k, v); this.failed.delete(k);this.failedMergeBaseline.delete(k);
      try { if (v == null) this.native().removeItem(k); else this.native().setItem(k,v); } catch (_) {}
    });
    this.onChange();
  }
}
export const STORAGE_TAB = Math.random().toString(36).slice(2);
const commitChannel = typeof window !== 'undefined' && window === globalThis && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('stamio-storage') : null;
let database: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('stamio-durable-storage', 1);
    const timeout = setTimeout(() => reject(new Error('Browserspeicher antwortet nicht. Bitte App erneut oeffnen.')), 10000);
    request.onupgradeneeded = () => request.result.createObjectStore('values');
    request.onerror = () => { clearTimeout(timeout); reject(request.error); };
    request.onblocked = () => { clearTimeout(timeout); reject(new Error('Browserspeicher blockiert. Andere App-Tabs schliessen.')); };
    request.onsuccess = () => { clearTimeout(timeout); const d = request.result; d.onversionchange = () => d.close(); resolve(d); };
  });
}
const journal: Journal = {
  async update(key, change) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('values', 'readwrite', {durability:'strict'});
      const store = tx.objectStore('values'); const req = store.get(key); let written: string;
      req.onsuccess = () => {
        try { written = change(req.result ?? null); store.put(written,key); }
        catch (_) { tx.abort(); }
      };
      tx.oncomplete = () => { commitChannel?.postMessage({tab:STORAGE_TAB}); resolve(written); }; tx.onabort = tx.onerror = () => reject(tx.error || new Error('Speichern abgebrochen'));
    });
  },
  async read() {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('values', 'readonly'); const out: [string,string|null][] = [];
      const req = tx.objectStore('values').openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out.push([String(c.key), c.value]); c.continue(); } };
      tx.oncomplete = () => resolve(out); tx.onabort = tx.onerror = () => reject(tx.error);
    });
  },
  async write(entries) {
    const d = await db();
    return new Promise<void>((resolve, reject) => {
      const tx = d.transaction('values', 'readwrite', { durability: 'strict' });
      for (const [k,v] of entries) tx.objectStore('values').put(v, k);
      tx.oncomplete = () => { if (entries.some(([key]) => key === 'ec_state_v2' || key === 'ec_plan')) commitChannel?.postMessage({tab:STORAGE_TAB}); resolve(); }; tx.onabort = tx.onerror = () => reject(tx.error || new Error('Speichern abgebrochen'));
    });
  }
};
export const storage = new DurableStorage(() => globalThis.localStorage, typeof indexedDB === 'undefined' ? undefined : journal);
export const storageMessage = () => ({
  saved: '', pending: 'Wird gespeichert. Bitte die App noch offen lassen.',
  error: 'Nicht gespeichert: Der Browserspeicher ist voll oder blockiert. App offen lassen und Backup exportieren.',
  blocked: 'Vorhandene Daten konnten nicht gelesen werden. Automatisches Speichern und Synchronisieren sind gesperrt. Bitte erneut oeffnen; keine Browserdaten loeschen.'
}[storage.status]);
