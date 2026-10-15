/* Unplausible Profildaten reparieren (Auftrag 11, für alle). Anlass: Papa hat als Geburtsjahr „197“ eingegeben; die App hat das
   angenommen und daraus Alter 1829 und negative Pulswerte (Schwellenpuls −954) berechnet. Und die Frage „Kannst du kraulen?“
   zeigte „ja“ an, ohne es zu speichern. Läuft beim Start der App und beim Korrigieren eines Plans; ändert nur, was sicher falsch ist. */
import { withEstimates, type Profile, type ThresholdKey } from './profile';
import * as C from './core';

/* Plausible Bereiche je Schwelle; außerhalb wird der Wert neu geschätzt */
const RANGE: Partial<Record<ThresholdKey, [number, number]>> = { lthrRun: [100, 215], lthrBike: [95, 215], maxHr: [120, 230], thresholdPaceRunSec: [150, 720], thresholdSpeedBikeKmh: [10, 55], ftp: [50, 600], cssSec: [50, 300] };
export const birthYearOk = (y: any, today: string) => typeof y === 'number' && y >= 1930 && y <= +today.slice(0, 4) - 5;

export interface SanityFix { profile: Profile; changed: boolean; fixed: string[]; badBirthYear: any }
export function sanitizeProfile(p0: Profile, today: string): SanityFix {
  const p: Profile = JSON.parse(JSON.stringify(p0));
  const fixed: string[] = []; let badBirthYear: any = null;
  if (p.birthYear != null && !birthYearOk(p.birthYear, today)) { badBirthYear = p.birthYear; p.birthYear = null; fixed.push('birthYear'); }
  const th: any = p.thresholds || {}; const est = new Set<string>(th.estimated || []);
  (Object.keys(RANGE) as ThresholdKey[]).forEach(k => {
    const v = th[k], r = RANGE[k]!;
    if (typeof v === 'number' && v !== 0 && (v < r[0] || v > r[1])) { th[k] = k === 'ftp' || k === 'cssSec' || k === 'maxHr' ? null : 0; est.add(k); fixed.push(k); }
  });
  th.estimated = [...est]; p.thresholds = th;
  // „Kannst du kraulen?“ zeigte „ja“, ohne es zu speichern: wer den Fragebogen gemacht hat und die Frage nie geändert hat, sah „ja“
  const sk: any = p.skills || {};
  if ((p.sports || []).includes('swim') && sk.swimCrawl == null && p.answers && !('swimCrawl' in p.answers) && sk.swimCrawlM == null) { p.skills = { ...sk, swimCrawl: 'yes' }; fixed.push('swimCrawl'); }
  // Teamsport ohne Spieltage: auch keine Spielzeit
  if (p.teamSport && !(p.teamSport.gameDays || []).length && p.teamSport.gameMinutes) { p.teamSport = { ...p.teamSport, gameMinutes: 0 }; }
  if (!(p.weeklyHours > 0)) { p.weeklyHours = 5; fixed.push('weeklyHours'); }
  if (!(p.maxDayHours > 0)) { p.maxDayHours = 2.5; fixed.push('maxDayHours'); }
  const out = fixed.length ? withEstimates(p, today) : p;
  return { profile: out, changed: fixed.length > 0 || JSON.stringify(p.teamSport) !== JSON.stringify(p0.teamSport), fixed, badBirthYear };
}

/* Spiel-Einheiten im Plan, obwohl keine Spieltage eingetragen sind (ab heute): sie entfallen */
export function ghostGames(weeks: any[], profile: Profile | null | undefined, today: string): { id: string; date: string; title: string }[] {
  if (profile && profile.teamSport && (profile.teamSport.gameDays || []).length) return [];
  return C.planDays(weeks || []).filter((d: any) => d.date >= today).flatMap((d: any) => (d.sessions || []).filter((s: any) => s && !s.cancelled && C.isGame(s)).map((s: any) => ({ id: s.id, date: d.date, title: s.title })));
}
