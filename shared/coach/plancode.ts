/* Plan-Code: ein JSON-Text, den Claude im Chat erzeugt und der Nutzer über „Plan aktualisieren“ einfügt.
   Das Format steht in PLAN-FORMAT.md. Die App prüft den Code, zeigt eine Vorschau mit Fehlern in einfachen Worten
   und lässt ihn durch dieselben Sicherheitsregeln laufen. */
import { validateWeeks, type Violation } from '../rules';

export const PLAN_FORMAT_VERSION = 1;
const SPORTS = ['swim', 'bike', 'run', 'strength', 'football', 'rest'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export interface PlanCodeCheck {
  ok: boolean;
  errors: string[];           // blockieren die Übernahme
  warnings: string[];         // Hinweise (z. B. Regeln), Übernahme trotzdem möglich
  mode: 'replace' | 'merge';
  preview: { weekNumber: number; label: string; from: string; to: string; sessions: number; minutes: number; status: 'neu' | 'ersetzt' | 'gleich' }[];
  plan: any | null;           // Ergebnis nach dem Zusammenführen
  violations: Violation[];
}

/* Findet das JSON auch, wenn Claude Text oder ```json drumherum schreibt */
export function extractJson(raw: string): any {
  const s = String(raw || '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  const body = fence ? fence[1] : s;
  const a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Im Text ist kein Plan-Code (JSON in geschweiften Klammern) zu finden.');
  try { return JSON.parse(body.slice(a, b + 1)); }
  catch (e) { throw new Error('Der Plan-Code ist unvollständig oder hat einen Tippfehler (' + String((e as Error).message).replace(/ in JSON.*$/, '') + '). Kopiere ihn nochmal ganz.'); }
}

export function checkPlanCode(raw: string, current: any, ctx: { minor?: boolean; today?: string } = {}): PlanCodeCheck {
  const res: PlanCodeCheck = { ok: false, errors: [], warnings: [], mode: 'merge', preview: [], plan: null, violations: [] };
  let obj: any;
  try { obj = extractJson(raw); } catch (e) { res.errors.push((e as Error).message); return res; }
  const upd = obj.plan && !obj.weeks ? obj.plan : obj;
  if (!Array.isArray(upd.weeks)) { res.errors.push('Es fehlt die Liste "weeks" mit den Wochen.'); return res; }
  res.mode = upd.mode === 'replace' || (upd.meta && upd.replace !== false && upd.mode !== 'merge' && upd.meta.eventDate) ? 'replace' : 'merge';
  const ids = new Set<string>();
  upd.weeks.forEach((w: any, wi: number) => {
    const wl = `Woche ${w && w.weekNumber != null ? w.weekNumber : wi + 1}`;
    if (!w || typeof w !== 'object') { res.errors.push(`${wl}: ist kein gültiger Eintrag.`); return; }
    if (!Number.isInteger(w.weekNumber)) res.errors.push(`${wl}: "weekNumber" (Nummer der Woche) fehlt.`);
    if (!DATE.test(w.startDate || '')) res.errors.push(`${wl}: "startDate" fehlt oder ist kein Datum wie 2026-10-19.`);
    else if (new Date(w.startDate + 'T12:00:00Z').getUTCDay() !== 1) res.warnings.push(`${wl}: beginnt nicht an einem Montag.`);
    if (!Array.isArray(w.days) || !w.days.length) { res.errors.push(`${wl}: "days" (Tage) fehlen.`); return; }
    w.days.forEach((d: any) => {
      if (!DATE.test((d && d.date) || '')) { res.errors.push(`${wl}: ein Tag hat kein gültiges Datum.`); return; }
      if (w.startDate && (d.date < w.startDate || d.date > addDays(w.startDate, 6))) res.errors.push(`${wl}: der Tag ${d.date} liegt nicht in dieser Woche.`);
      if (!d.dow) d.dow = DOW[new Date(d.date + 'T12:00:00Z').getUTCDay()];
      if (!Array.isArray(d.sessions)) { res.errors.push(`${wl}, ${d.date}: "sessions" (Einheiten) fehlen.`); return; }
      d.sessions.forEach((s: any, si: number) => {
        const sl = `${wl}, ${d.date}`;
        if (!s || typeof s !== 'object') { res.errors.push(`${sl}: Einheit ${si + 1} ist leer.`); return; }
        if (!s.id) s.id = `pc-${d.date}-${si + 1}`;
        if (ids.has(s.id)) res.errors.push(`${sl}: die ID "${s.id}" kommt doppelt vor.`); ids.add(s.id);
        if (!SPORTS.includes(s.sport)) res.errors.push(`${sl}: unbekannter Sport "${s.sport}". Erlaubt: swim, bike, run, strength, football, rest.`);
        if (!s.title) res.errors.push(`${sl}: der Einheit fehlt ein Titel.`);
        if (s.plannedMinutes != null && !(typeof s.plannedMinutes === 'number' && s.plannedMinutes > 0 && s.plannedMinutes <= 600)) res.errors.push(`${sl}: "${s.title}" hat eine ungültige Dauer (${s.plannedMinutes}).`);
        if (s.plannedKm != null && !(typeof s.plannedKm === 'number' && s.plannedKm >= 0 && s.plannedKm <= 300)) res.errors.push(`${sl}: "${s.title}" hat ungültige Kilometer.`);
      });
    });
    if (!w.label) w.label = 'Woche ' + w.weekNumber;
    if (!w.endDate && w.startDate) w.endDate = addDays(w.startDate, 6);
  });
  if (res.errors.length) return res;
  // Zusammenführen
  const cur = current && current.weeks ? current : { meta: {}, weeks: [] };
  const merged = res.mode === 'replace' ? { ...upd } : { ...cur, meta: { ...(cur.meta || {}), ...(upd.meta || {}) }, weeks: [...cur.weeks] };
  if (res.mode === 'merge') {
    for (const w of upd.weeks) { const i = merged.weeks.findIndex((x: any) => x.weekNumber === w.weekNumber); if (i >= 0) merged.weeks[i] = w; else merged.weeks.push(w); }
    merged.weeks.sort((a: any, b: any) => String(a.startDate).localeCompare(String(b.startDate)));
    ['keyDates', 'zonePercents', 'seedMetrics'].forEach(k => { if (Array.isArray(upd[k])) merged[k] = upd[k]; });
  }
  const mins = (w: any) => (w.days || []).reduce((a: number, d: any) => a + (d.sessions || []).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
  for (const w of upd.weeks) {
    const old = (cur.weeks || []).find((x: any) => x.weekNumber === w.weekNumber);
    res.preview.push({ weekNumber: w.weekNumber, label: w.label, from: w.startDate, to: w.endDate, sessions: w.days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => s.sport !== 'rest').length, 0), minutes: mins(w), status: !old ? 'neu' : JSON.stringify(old) === JSON.stringify(w) ? 'gleich' : 'ersetzt' });
  }
  // Sicherheitsregeln: Verstöße werden gezeigt; bei harten Regeln (zwei harte Tage, Krankheit) wird die Übernahme gesperrt
  const before = (merged.weeks || []).filter((w: any) => !upd.weeks.some((u: any) => u.weekNumber === w.weekNumber) && w.startDate < upd.weeks[0].startDate).slice(-2);
  res.violations = validateWeeks(upd.weeks, { minor: ctx.minor }, before);
  res.violations.forEach(v => { if (v.rule === 'hardDays' || v.rule === 'illness' || v.rule === 'age') res.errors.push(v.msg); else res.warnings.push(v.msg); });
  res.plan = merged;
  res.ok = !res.errors.length;
  return res;
}
function addDays(s: string, n: number) { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/* Kurze Erklärung fürs Ende jeder Zusammenfassung, damit Claude gültige Codes erzeugt */
export const PLAN_FORMAT_HINT = [
  'Wenn du den Plan ändern willst, antworte zusätzlich mit einem Plan-Code im JSON-Format:',
  '{"mode":"merge","weeks":[{"weekNumber":12,"label":"Woche 12","startDate":"JJJJ-MM-TT (Montag)","isRecoveryWeek":false,"focus":"…",',
  '"days":[{"date":"JJJJ-MM-TT","sessions":[{"id":"w12-mo-1","sport":"run|bike|swim|strength|football|rest","title":"…","plannedMinutes":45,"plannedKm":7.5,"zone":"Zone 2","description":"…"}]}]}]}',
  'Regeln: höchstens +10 % Umfang pro Woche, keine zwei harten Tage hintereinander, alle 7 Tage einer Woche angeben. "merge" ersetzt nur die genannten Wochen.'
].join('\n');
