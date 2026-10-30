/* Drei-Wege-Abgleich: Nur seit dem eigenen Laden geaenderte Felder schreiben.
   Fremde Aenderungen bleiben erhalten; echte Konflikte werden im Backup bewahrt. */
const eq = (a: any,b: any) => JSON.stringify(a) === JSON.stringify(b);
const obj = (x: any) => x && typeof x === 'object' && !Array.isArray(x);
export function mergeStored(base: any, local: any, remote: any, conflicts: any[] = [], path = ''): any {
  if (path.endsWith('._storageRevision')) return Math.max(Number(local)||0,Number(remote)||0);
  if (eq(base,local)) return remote;
  if (eq(base,remote) || eq(local,remote)) return local;
  if (obj(local) && obj(remote) && (base == null || obj(base))) {
    const out: any = {};
    for (const k of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])) {
      if (['__proto__','prototype','constructor'].includes(k)) continue;
      const value = mergeStored(base?.[k],local[k],remote[k],conflicts,path+'.'+k);
      if (value !== undefined) out[k]=value;
    }
    return out;
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    const all = [...(base||[]),...local,...remote];
    const key = all.length && all.every(x=>obj(x) && typeof x.id === 'string') ? 'id'
      : all.length && all.every(x=>obj(x) && typeof x.date === 'string') ? 'date' : null;
    if(key) {
      const map = (a:any[])=>Object.fromEntries((a||[]).map(x=>[x[key],x]));
      return Object.values(mergeStored(map(base),map(local),map(remote),conflicts,path));
    }
  }
  conflicts.push({path, previous:base, local, other:remote});
  return local;
}

/* Auftrag 22: Zwei Geräte (oder Gerät und Import) ändern denselben Datensatz. Mit dem Stand, auf dem das Gerät seine Änderung gemacht hat
   (base), werden beide Änderungen feldweise zusammengeführt: was nur eine Seite geändert hat, bleibt; ändern beide dasselbe Feld,
   gewinnt die neuere Änderung. Ohne base gilt wie bisher: die neuere Änderung gewinnt. */
export const MERGE_KINDS = new Set(['session', 'custom', 'trend', 'settings', 'profile', 'goal', 'nutrition', 'weekNote']);
export function mergeVersions(base: any, incoming: any, incomingAt: number, stored: any, storedAt: number): { data: any; updatedAt: number; merged: boolean } {
  const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
  if (base === undefined || stored == null || eq(base, stored)) return { data: incoming, updatedAt: Math.max(incomingAt, storedAt + 1), merged: false };
  if (eq(incoming, stored)) return { data: stored, updatedAt: Math.max(incomingAt, storedAt), merged: false };
  const newerIncoming = incomingAt > storedAt;
  const data = newerIncoming ? mergeStored(base, incoming, stored) : mergeStored(base, stored, incoming);
  return { data, updatedAt: Math.max(incomingAt, storedAt) + 1, merged: true };
}
