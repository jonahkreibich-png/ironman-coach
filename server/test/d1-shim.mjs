/* D1-Ersatz für Tests und lokale Entwicklung: dieselbe API (prepare/bind/first/all/run/batch) auf node:sqlite. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

class Stmt {
  constructor(db, sql, params) { this.db = db; this.sql = sql; this.params = params || []; }
  bind(...p) { return new Stmt(this.db, this.sql, p.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v))); }
  _st() { return this.db.prepare(this.sql); }
  async first(col) { const r = this._st().get(...this.params); if (!r) return null; const o = { ...r }; return col ? o[col] : o; }
  async all() { return { results: this._st().all(...this.params).map(r => ({ ...r })), success: true }; }
  async run() { const r = this._st().run(...this.params); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  _sync() { return this._st().run(...this.params); }
}
export class D1Shim {
  constructor(file) { this.db = new DatabaseSync(file || ':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.all().catch(async () => s.run())); this.db.exec('COMMIT'); return out; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  async exec(sql) { this.db.exec(sql); return { count: 1 }; }
  execFile(path) { this.db.exec(fs.readFileSync(path, 'utf8')); return this; }
}
