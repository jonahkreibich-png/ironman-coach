/* Einheiten tagesgenau erklären (Auftrag 7, Punkt 4). Ohne KI, für alle Sportarten:
   „Was genau soll ich heute beim Schwimmen machen?“ → Einschwimmen, Hauptteil mit Wiederholungen, Pausen und Zonen (mit den
   eigenen Puls- und Pace-Werten), Ausschwimmen, worauf achten, warum. Berücksichtigt Woche/Phase, Krankheit und Wiedereinstieg,
   Ampel mit HFV und Ruhepuls und die Schwellen der Person. Wenn nötig (Krankheit, schlechte Werte, „ich hab nur 20 min“) gibt es
   einen Änderungsvorschlag als feste Aktion, der erst nach Bestätigung gilt.
   structureOf() liefert dieselbe Struktur für die Plan-Ansicht; Einheiten ohne Bauplan (alte, von Hand geschriebene) bekommen einen. */
import * as C from '../core';
import { restDayReason } from '../trainingrules';
import * as W from '../workouts';
import type { EngineCtx } from './engine';
import { readinessFacts, readinessOf } from './engine';
import { paceCtx } from '../plangen';
import { sleepNeed, type Profile } from '../profile';
import type { Op } from './ops';
import { joinDe } from './texts';
import { SPEED_HINT } from '../bikespeed';

export interface Part { part: 'warm' | 'tech' | 'main' | 'cool'; label: string; lines: string[] }
export interface Structure { title: string; minutes: number | null; km: number | null; parts: Part[]; how: string | null; why: string | null; tip: string | null; derived: boolean;
  /** Schwimmen (Auftrag 14): Erklärung der Übungen und Summe Meter und Dauer */ drills?: string[]; sum?: string }

const LABELS: Record<string, [string, string, string]> = {
  swim: ['Einschwimmen', 'Hauptteil', 'Ausschwimmen'], run: ['Einlaufen', 'Hauptteil', 'Auslaufen'], bike: ['Einrollen', 'Hauptteil', 'Ausrollen'],
  strength: ['Aufwärmen', 'Übungen', 'Ausklang'], football: ['Aufwärmen', 'Spiel/Training', 'Ausklang']
};
const DOWL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const fmtD = (d: string) => `${DOWL[dowOf(d)].slice(0, 2)} ${d.slice(8)}.${d.slice(5, 7)}.`;
const zoneOf = (s: any, def = 2) => { const z = [...String((s && s.zone) || '').matchAll(/\d/g)].map(x => +x[0]); return z.length ? Math.max(...z) : def; };

/* Bauplan einer Einheit: vorhandener spec mit den aktuellen Schwellen der Person, sonst aus Titel, Dauer, Zone und Text abgeleitet */
export function specOf(s: any, prof: Profile, today: string): W.Spec | null {
  if (!s || s.sport === 'rest') return null;
  const indoor = !!(s.spec && s.spec.ctx && s.spec.ctx.indoor) || /rolle|trainer|indoor/i.test(s.title || '');
  const pc = paceCtx(prof, indoor, (s.spec && s.spec.ctx && s.spec.ctx.bikeName) || null, today);
  if (s.spec && Array.isArray(s.spec.steps) && s.spec.steps.length) { const sp = { ...s.spec, ctx: { ...s.spec.ctx, ...pc } }; return sp.sport === 'swim' ? W.gearFit(W.poolFit(sp)) : sp; }
  const min = s.plannedMinutes || (s.sport === 'football' ? 90 : 30);
  const z = zoneOf(s);
  const title = String(s.title || ''), desc = String(s.description || '');
  const iv = /(\d+)\s*[x×]\s*(\d+)\s*min/i.exec(title + ' ' + desc);
  const base = (spec: W.Spec) => ({ ...spec, title: s.title, why: undefined, tip: undefined } as W.Spec);
  if (s.sport === 'run' || s.sport === 'bike') {
    if (iv && C.isIntervals(s)) return base(s.sport === 'run' ? W.runIntervals(pc, +iv[1], +iv[2], 2, Math.max(3, z)) : W.bikeIntervals(pc, +iv[1], +iv[2], Math.max(3, z), 4));
    if (/test/i.test(title)) return s.sport === 'run' ? W.runTest(pc) : W.bikeTest(pc);
    if (min >= 40) return base({ sport: s.sport, kind: 'easy', ctx: pc, noDistance: s.sport === 'bike' && indoor, steps: [{ part: 'warm', min: 10, zone: 1 }, { part: 'main', min: min - 15, zone: z }, { part: 'cool', min: 5, zone: 1 }] });
    return base({ sport: s.sport, kind: 'easy', ctx: pc, noDistance: s.sport === 'bike' && indoor, steps: [{ part: 'main', min, zone: z }] });
  }
  if (s.sport === 'swim') {
    // „Warm-up 200m Brust. Drills 8x50m. Main 6x75m Kraul locker, 20s Pause. Cool-down 200m.“
    const steps: W.Step[] = [];
    for (const seg of desc.split(/[.;\n]+/)) {
      const t = seg.toLowerCase(); if (!t.trim()) continue;
      const rep = /(\d+)\s*[x×]\s*(\d+)\s*m/.exec(t); const one = /(\d{2,4})\s*m\b/.exec(t);
      if (!rep && !one) continue;
      const part: W.Step['part'] = /warm|einschwimm/.test(t) ? 'warm' : /cool|ausschwimm|locker aus/.test(t) ? 'cool' : 'main';
      const mode: W.StrokeMode = /drill|technik|abschlag|catch/.test(t) ? 'drill' : /brett|beine|kick/.test(t) ? 'kick' : /brust/.test(t) ? 'breast' : /kraul|freistil/.test(t) ? 'crawl' : part === 'main' ? 'crawl' : 'easy';
      const rest = /(\d+)\s*s(?:ek)?\b/.exec(t);
      steps.push({ part, reps: rep ? +rep[1] : 1, m: rep ? +rep[2] : +one![1], zone: part === 'main' && mode === 'crawl' ? 2 : 1, mode, ...(rest ? { restSec: +rest[1] } : {}) });
      if (/gesamt/.test(t)) steps.pop();
    }
    if (steps.some(x => x.part === 'main')) return { sport: 'swim', kind: 'technique', ctx: pc, title: s.title, steps };
    return base(W.swimSession(pc, 'technique', [{ part: 'main', reps: 6, m: 50, zone: 1, mode: 'drill', restSec: 20 }, { part: 'main', reps: Math.max(2, Math.round((min - 15) / 4)), m: 50, zone: 2, mode: 'crawl', restSec: 30 }]));
  }
  if (s.sport === 'strength') {
    // „Liegestuetz 2x10, Ruderzug 2x10, Plank 2x30s“
    const ex: W.Exercise[] = [];
    for (const m of desc.matchAll(/([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß \-]{2,30}?)\s+(\d+)\s*[x×]\s*(\d+\s*(?:s|sek|je seite|je bein)?)/g)) ex.push({ name: m[1].trim().replace(/ue/g, 'ü').replace(/oe/g, 'ö').replace(/ae/g, 'ä'), sets: +m[2], reps: m[3].trim() });
    if (ex.length) return { sport: 'strength', kind: 'strength', ctx: {}, title: s.title, exercises: ex, steps: [{ part: 'warm', min: 5 }, { part: 'main', min: Math.max(10, min - 5) }] };
    const area = /oberk/i.test(title) ? 'upper' : /unterk|beine/i.test(title) ? 'lower' : /rumpf|core/i.test(title) ? 'core' : null;
    return area ? { ...W.strengthArea(area as any, { light: /leicht/i.test(title) }), title: s.title } : { ...W.strengthSession(prof.sports, { minutes: min }), title: s.title };
  }
  if (s.sport === 'football') return { sport: 'football', kind: C.isGame(s) ? 'game' : 'team', ctx: {}, title: s.title, noDistance: true, steps: [{ part: 'main', min, note: C.isGame(s) ? 'Spieltag: zählt als harter Tag.' : 'Fester Termin, zählt als Belastung.' }] };
  return null;
}

export function structureOf(s: any, prof: Profile, today: string): Structure | null {
  const spec = specOf(s, prof, today); if (!spec) return null;
  const L: [string, string, string] = spec.sport === 'football' ? ['Aufwärmen', spec.kind === 'game' ? 'Spiel' : 'Training', 'Ausklang'] : LABELS[spec.sport] || LABELS.run;
  const parts: Part[] = [];
  if (spec.sport === 'strength') {
    const w = spec.steps.find(x => x.part === 'warm');
    if (w) parts.push({ part: 'warm', label: L[0], lines: [`${w.min || 5} min locker bewegen (Seilspringen, Kniebeugen ohne Gewicht, Armkreisen)`] });
    parts.push({ part: 'main', label: L[1], lines: [...(spec.exercises || []).map(e => `${e.name}: ${e.sets}×${e.reps}${e.note ? ` (${e.note})` : ''}`), 'Pause zwischen den Sätzen 60-90 s, saubere Technik vor Gewicht'] });
  } else if (spec.sport === 'swim') {
    for (const p of W.swimParts(spec)) parts.push({ part: p.part, label: p.label, lines: p.steps.map(x => W.stepText(spec, x)) });
  } else if (spec.sport === 'football' || spec.kind === 'race') {
    parts.push({ part: 'main', label: L[1], lines: spec.steps.map(x => x.note || `${x.min} min`).filter(Boolean) });
  } else {
    for (const [i, part] of (['warm', 'main', 'cool'] as const).entries()) {
      const st = spec.steps.filter(x => x.part === part);
      if (st.length) parts.push({ part, label: L[i], lines: st.map(x => W.stepText(spec, x)) });
    }
  }
  const t = W.totals(spec);
  const zmax = Math.max(...spec.steps.filter(x => x.part === 'main').map(x => x.zone || 2), 1);
  return { title: s.title || W.title(spec), minutes: t.min || s.plannedMinutes || null, km: t.km, parts, how: spec.sport === 'strength' || spec.sport === 'football' ? null : W.FEEL[zmax], why: spec.why || null, tip: [spec.tip, spec.sport === 'bike' && spec.ctx.bikeKmh && !spec.ctx.indoor && spec.kind !== 'race' ? SPEED_HINT : ''].filter(Boolean).join(' ') || null, derived: !(s.spec && s.spec.steps),
    ...(spec.sport === 'swim' ? { drills: W.swimDrillNotes(spec), sum: W.swimSumLine(spec) } : {}) };
}
export function structureText(x: Structure): string {
  const n = x.parts.map((p, i) => `${i + 1}. ${p.label}: ${p.lines.join('; dann ')}`);
  return [...n, ...(x.drills && x.drills.length ? ['Übungen: ' + x.drills.join(' ')] : []), x.sum || '', x.how ? `Wie hart: ${x.how}.` : '', x.tip ? `Achte auf: ${x.tip}` : '', x.why ? `Warum: ${x.why}` : ''].filter(Boolean).join('\n');
}

/* Kürzen auf eine Zeit (auch Lernstufen: weniger Wiederholungen, gleiche Stufe) */
export function fitToMinutes(spec: W.Spec, minutes: number): W.Spec {
  if (spec.sport === 'strength') {
    const ex = (spec.exercises || []).map(e => ({ ...e, sets: Math.min(e.sets, 2) }));
    const keep: W.Exercise[] = []; let used = 5;
    for (const e of ex) { if (used + e.sets * 2.5 > minutes && keep.length) break; keep.push(e); used += e.sets * 2.5; }
    return { ...spec, exercises: keep, steps: [{ part: 'warm', min: 5 }, { part: 'main', min: Math.max(10, Math.round((minutes - 5) / 5) * 5) }] };
  }
  let sp: W.Spec = { ...JSON.parse(JSON.stringify(spec)), stage: null };
  for (let k = 0; k < 8 && W.totals(sp).min > minutes; k++) sp = W.scaleSpec(sp, Math.max(0.4, minutes / Math.max(1, W.totals(sp).min)));
  // zuletzt Ein- und Ausklang kürzen
  if (W.totals(sp).min > minutes) sp.steps = sp.steps.map(x => x.part === 'main' ? x : sp.sport === 'swim' ? { ...x, m: Math.max(50, Math.round((x.m || 0) / 2 / 25) * 25) } : { ...x, min: Math.max(3, Math.round((x.min || 0) / 2)) });
  return { ...sp, stage: spec.stage || null };
}
function modifyOp(ctx: EngineCtx, s: any, date: string, spec: W.Spec, title: string | null, why: string): Op {
  const b = W.build(spec);
  const g = 'chat-' + ctx.now + '-x';
  const set = { title: title || b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, zone: b.zone || s.zone, hard: !!b.hard };
  return { op: 'adjust', adj: [{ id: `${g}-${s.id}`, group: g, type: 'modify', sessionId: s.id, set, what: `${s.title} (${fmtD(date)}) → ${set.title}, ${set.plannedMinutes} min`, reason: why }] };
}

export interface Explained { intent: string; text: string; ops?: Op[]; yes?: string; options?: { label: string; say: string }[] }
/* Erklärt die Einheit(en) eines Tages, optional nur eine Sportart, optional mit Zeitgrenze */
export function explainDay(ctx: EngineCtx, date: string, sport: string | null, limitMin: number | null = null): Explained {
  const weeks = C.applyAdjustments(ctx.baseWeeks, ctx.state.adjustments || {});
  const day = C.planDays(weeks).find((d: any) => d.date === date);
  const all = day ? day.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && !s.removed) : [];
  const list = sport ? all.filter((s: any) => s.sport === sport) : all;
  const when = date === ctx.today ? 'Heute' : date === C.addDays(ctx.today, 1) ? 'Morgen' : `Am ${DOWL[dowOf(date)]}`;
  const SP: Record<string, string> = { swim: 'Schwimmen', bike: 'Rad', run: 'Laufen', strength: 'Kraft', football: 'Fußball' };
  if (!day) return { intent: 'explain', text: `${when} (${fmtD(date)}) gibt es noch keinen Plan.` };
  // krank geht vor (auch an Ruhetagen); Ruhetag mit Begründung aus dem Plan (Auftrag 18)
  const ill0 = C.illnessAt(ctx.state.illnessPeriods, date);
  if (ill0 && !list.length) return { intent: 'explain', text: `${when} (${fmtD(date)}): Du bist krank eingetragen${ill0.note ? ` (${ill0.note})` : ''}. Heute kein Training, auch nicht locker. Wenn du 24 Stunden ohne Fieber und Symptome bist, tipp auf „Wieder gesund“, dann steigen wir in Stufen ein.`, options: [{ label: 'Wieder gesund', say: 'Ich bin wieder gesund' }] };
  if (!list.length && !sport && !all.length) { const rr = restDayReason(weeks, date, ctx.profile, ctx.goals); if (rr) return { intent: 'explain', text: rr }; }
  if (!list.length) {
    const next = C.planDays(weeks).filter((d: any) => d.date > date).flatMap((d: any) => d.sessions.filter((s: any) => s.sport === sport && !s.cancelled).map((s: any) => ({ s, date: d.date })))[0];
    return { intent: 'explain', text: `${when} (${fmtD(date)}) ist ${sport ? `kein ${SP[sport] || 'Training'}` : 'kein Training'} geplant${all.length ? `, sondern ${joinDe(all.map((s: any) => s.title))}` : ''}.${next ? ` Nächstes ${SP[sport!] || 'Training'}: ${next.s.title} am ${fmtD(next.date)}.` : ''}`,
      options: [...(all.length ? [{ label: `${when}: ${all[0].title}`, say: `Was genau soll ich ${when.toLowerCase()} machen?` }] : []), ...(next ? [{ label: `Erklär ${fmtD(next.date)}`, say: `Was genau soll ich am ${DOWL[dowOf(next.date)]} beim ${SP[sport!] || 'Training'} machen?` }] : [])] };
  }
  // Lage: Woche/Phase, Krankheit, Wiedereinstieg, Ampel mit HFV und Ruhepuls
  const w = weeks.find((x: any) => (x.days || []).some((d: any) => d.date === date));
  const PH: Record<string, string> = { base: 'Grundlage', build: 'Aufbau', specific: 'wettkampfnah', taper: 'Tapering', race: 'Wettkampfwoche', Base: 'Grundlage' };
  const weekLine = w ? `${w.label || 'Woche ' + w.weekNumber}${w.block ? ` (Block ${w.block}, Woche ${w.blockWeek})` : ''}${w.phase ? `, ${PH[w.phase] || w.phase}` : ''}${w.isRecoveryWeek ? ', Erholungswoche' : ''}` : '';
  const ill = C.illnessAt(ctx.state.illnessPeriods, date);
  const ret = !ill && C.returnStageActive(ctx.state.illnessPeriods, date);
  const R = date === ctx.today ? readinessOf(ctx, date) : null;
  const vals = R && R.point ? R.crits.filter((c: any) => c.k === 'Ruhepuls' || c.k === 'HFV').map((c: any) => `${c.k} ${c.v}${c.t && /normal/.test(c.t) ? ` (${c.t.split('·')[0].trim()})` : ''}`) : [];
  const head = `${when} (${fmtD(date)}${weekLine ? ', ' + weekLine : ''}):`;
  if (ill) return { intent: 'explain', text: `${head} Du bist krank eingetragen${ill.note ? ` (${ill.note})` : ''}. Heute kein Training, auch nicht locker. Wenn du 24 Stunden ohne Fieber und Symptome bist, tipp auf „Wieder gesund“, dann steigen wir in Stufen ein.`, options: [{ label: 'Wieder gesund', say: 'Ich bin wieder gesund' }] };

  const blocks: string[] = []; const ops: Op[] = []; let yes = '';
  const rank = (s: any) => (C.isKey(s) || /test/i.test(s.title || '') ? 0 : s.sport === 'swim' ? 1 : s.sport === 'run' || s.sport === 'bike' ? 2 : 3);
  if (limitMin && list.length > 1) {
    const open = list.filter((s: any) => !((ctx.state.sessions || {})[s.id] || {}).completed && !s.fixed && !s.race);
    const total = open.reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0);
    if (open.length > 1 && total > limitMin + 2) {
      const best = [...open].sort((a: any, b: any) => rank(a) - rank(b))[0];
      const rest = open.filter((s: any) => s !== best);
      const spec = specOf(best, ctx.profile, ctx.today)!;
      const short = (best.plannedMinutes || 0) > limitMin + 2 ? fitToMinutes(spec, limitMin) : spec;
      const sx = structureOf({ ...best, spec: W.build(short).spec }, ctx.profile, ctx.today)!;
      const g = 'chat-' + ctx.now + '-d';
      if (short !== spec) ops.push(modifyOp(ctx, best, date, short, null, `nur ${limitMin} min Zeit`));
      ops.push({ op: 'adjust', adj: rest.map((x: any) => ({ id: `${g}-${x.id}`, group: g, type: 'cancel', sessionId: x.id, what: `${x.title} (${fmtD(date)}) entfällt`, reason: `nur ${limitMin} min Zeit` })) });
      return { intent: 'explain', text: `${head} Mit ${limitMin} min schaffst du nicht alles (${total} min geplant). Am wichtigsten ist ${best.title}${short !== spec ? `, gekürzt auf ${W.totals(short).min} min` : ''}:
${structureText({ ...sx, why: null })}

${joinDe(rest.map((x: any) => x.title))} ${rest.length > 1 ? 'fallen' : 'fällt'} heute weg.

Soll ich das so ändern?`, ops, yes: 'Ja, so machen' };
    }
  }
  const done = (s: any) => !!((ctx.state.sessions || {})[s.id] || {}).completed;
  for (const s of list) {
    const x = structureOf(s, ctx.profile, ctx.today); if (!x) continue;
    const meta = [x.minutes ? `ca. ${x.minutes} min` : '', x.km ? (s.sport === 'swim' ? `${Math.round(x.km * 1000)} m` : `${String(x.km).replace('.', ',')} km`) : '', s.slot === 'am' ? 'morgens' : ''].filter(Boolean).join(', ');
    let text = `${s.title}${meta ? ` (${meta})` : ''}${done(s) ? ' – schon erledigt' : ''}\n${structureText(x)}`;
    if (s.sport === 'swim') {
      const proofs=C.swimProofs(ctx.state,ctx.baseWeeks||[],ctx.today,42);
      for (const [key,label] of [['crawl','Kraul ohne Hilfsmittel'],['pull','Kraul mit Pull Buoy']] as const) {
        const values=proofs.map(p=>p[key]).filter(Boolean) as number[];
        if (values.length) text+='\n'+label+': Bestwert '+Math.max(...values)+' m; bestätigt '+(C.confirmedOf(values)?C.confirmedOf(values)+' m':'noch keine Strecke in zwei Einheiten')+'.';
      }
      if (ctx.profile.skills?.swimCrawlM != null) text+='\nProfilangabe Kraul: '+ctx.profile.skills.swimCrawlM+' m (kein zusätzlicher Ergebnisnachweis).';
      text+='\nJede Kraul-Strecke einzeln schwimmen und danach warten, bis der Atem ruhig ist.';
    }
    blocks.push(text);
    if (done(s) || s.fixed || s.race) continue;
    const spec = specOf(s, ctx.profile, ctx.today)!;
    // Wenn nötig: Änderung vorschlagen (gilt erst nach „Ja“)
    if (limitMin && x.minutes && x.minutes > limitMin + 2 && !ops.length) {
      const short = fitToMinutes(spec, limitMin);
      const sx = structureOf({ ...s, spec: W.build(short).spec }, ctx.profile, ctx.today)!;
      blocks.push(`Mit nur ${limitMin} min: ${W.totals(short).min} min so:\n${structureText({ ...sx, why: null, tip: null })}`);
      ops.push(modifyOp(ctx, s, date, short, null, `nur ${limitMin} min Zeit`)); yes = `Ja, auf ${W.totals(short).min} min kürzen`;
    } else if (ret && !ops.length && (C.isHard(s) || (x.minutes || 0) > 40)) {
      const easy = s.sport === 'run' ? W.runEasy(spec.ctx, Math.min(30, x.minutes || 30)) : s.sport === 'bike' ? W.bikeEasy(spec.ctx, Math.min(40, x.minutes || 40)) : fitToMinutes(spec, 30);
      if (easy.sport !== 'strength') easy.steps = easy.steps.map(st => ({ ...st, zone: Math.min(st.zone || 2, 2) }));
      ops.push(modifyOp(ctx, s, date, { ...easy, why: 'Wiedereinstieg nach Krankheit: locker und kurz.' }, `Locker statt: ${s.title}`, 'Wiedereinstieg nach Krankheit'));
      blocks.push(`Du bist erst seit Kurzem wieder gesund. Ich schlage vor: ${W.totals(easy).min} min ganz locker statt der geplanten Einheit, keine Intervalle.`); yes = 'Ja, lockerer machen';
    } else if (R && R.level === 2 && !ops.length && !C.isGame(s)) {
      const easy = s.sport === 'run' ? W.runEasy(spec.ctx, 25) : s.sport === 'bike' ? W.bikeEasy(spec.ctx, 30) : fitToMinutes(spec, 25);
      easy.steps = easy.steps.map(st => ({ ...st, zone: 1 }));
      ops.push(modifyOp(ctx, s, date, easy, `Locker statt: ${s.title}`, 'Ampel rot'));
      blocks.push(`Deine Werte heute sind schlecht (${joinDe(readinessFacts(ctx, date)) || R.reasons.join(', ')}). Ich schlage vor: höchstens ${W.totals(easy).min} min ganz locker oder Ruhetag.`); yes = 'Ja, nur locker';
    } else if (R && R.level === 1 && C.isHard(s) && !ops.length && !/test/i.test(s.title || '') && (s.sport === 'run' || s.sport === 'bike')) {
      const easy = s.sport === 'run' ? W.runEasy(spec.ctx, Math.round((x.minutes || 40) * 0.8)) : W.bikeEasy(spec.ctx, Math.round((x.minutes || 50) * 0.8));
      ops.push(modifyOp(ctx, s, date, easy, `Zone 2 statt: ${s.title}`, 'Ampel gelb'));
      blocks.push(`Deine Werte sind heute nur mittel (${R.reasons.join(', ')}). Ich schlage vor: statt Intervallen ${W.totals(easy).min} min locker in Zone 2.`); yes = 'Ja, locker machen';
    }
  }
  const valuesLine = R && R.level === 3 ? (date === ctx.today ? (R.uncertain === 'few' ? C.readinessLine(R) : 'Für heute fehlen noch die Morgenwerte, die Ampel ist unsicher.') + ' Fühlst du dich nicht fit, sag Bescheid, dann mache ich es lockerer.' : '') : R && R.level !== 3 && !ops.length ? `Deine Werte heute: ${vals.length ? vals.join(', ') + ', ' : ''}Ampel ${['grün', 'gelb', 'rot'][R.level]}${R.level === 0 ? ', du kannst wie geplant trainieren' : ''}.` : ret ? 'Wiedereinstieg nach Krankheit: alles locker, keine Intervalle.' : '';
  const text = [head, ...blocks, valuesLine].filter(Boolean).join('\n\n');
  return ops.length ? { intent: 'explain', text: text + '\n\nSoll ich das so ändern?', ops, yes } : { intent: 'explain', text };
}

/* Erkennen: „Was genau soll ich heute beim Schwimmen machen?“, „Wie läuft der Lauf morgen ab?“, „Erklär mir die Einheit am Samstag“,
   „Ich hab heute nur 20 min, was soll ich machen?“ */
export function explainWanted(toks: string[], raw: string): boolean {
  const j = toks.join(' ');
  if (/\b(verschieb|verlege|tausch|streich|absag|krank|schmerz|urlaub)/.test(j)) return false;
  return /\b(was genau|wie genau|genau machen|ablauf|laeuft .* ab|wie soll ich|wie mache ich|was soll ich|was mache ich|was muss ich|erklaer|struktur|wie viele|welche uebungen|wie viel(e)? (meter|bahnen|minuten)|wie trainiere ich|wie geht)\b/.test(j)
    || (/\bnur \d+ ?(min|minuten)\b/.test(j) && /\b(was|machen|soll)\b/.test(j))
    || /\b(einheit|training|schwimmen|lauf|laufen|rad|kraft)\b.*\b(heute|morgen|uebermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b.*\b(genau|ablauf)\b/.test(j);
  void raw;
}
export function limitIn(j: string): number | null { const m = /\bnur (?:noch )?(\d{1,3}) ?(min|minuten)\b|\b(\d{1,3}) ?(min|minuten) zeit\b/.exec(j); const v = m ? +(m[1] || m[3]) : null; return v && v >= 10 && v <= 240 ? v : null; }
