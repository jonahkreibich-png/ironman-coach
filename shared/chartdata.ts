import { validDate } from './load';
/** Indexgruppen statt einer Linie über fehlende Messungen. Sieben Tage ist eine Darstellungsregel. */
export function chartSegments(pts: any[], key: string, maxGapDays = 7): number[][] {
  const groups: number[][] = []; let group: number[] = [];
  const flush = () => { if (group.length) groups.push(group); group = []; };
  pts.forEach((p, i) => {
    if (!validDate(p.date) || typeof p[key] !== 'number' || !Number.isFinite(p[key])) { flush(); return; }
    if (group.length) {
      const days = (Date.parse(p.date) - Date.parse(pts[group.at(-1)!].date)) / 86400000;
      if (days <= 0 || days > maxGapDays) flush();
    }
    group.push(i);
  });
  flush(); return groups;
}
