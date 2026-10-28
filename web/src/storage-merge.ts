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
