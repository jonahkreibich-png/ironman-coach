import { cycleHint, shoeHint } from '../../../shared/care';
/* Heute: das Zentrum der App. Oben die Antwort des Tages (Ampel + Einheit + ein Satz vom Coach), darunter Morgen,
   Zuletzt, Woche. Details erst beim Antippen. Zwei Entwürfe: A „Antwort“ (Standard) und B „Feed“ (siehe DESIGN.md). */
import * as C from '../../../shared/core';
import { STATE, UI, PLAN, findDay, BASE_WEEKS } from '../store';
import { esc, fmtDate, dowShort, dowLong, addDays, daysBetween } from '../util';
import { t, tn, num, duration } from '../../../shared/i18n';
import { D, RETURN_STAGES } from '../data';
import { on, ring, li, sec, srcBadge, sportIc, ic, pill, bar, openSheet, closeSheet, armed } from '../kit';
import { sessState, effStatus, forgottenSessions, dayStats, ensureSess } from '../domain';
import { saveState } from '../store';
import { toast } from '../toast';
import { sessionRow, metaLine, doneLine } from './session';
import { openCheckin } from './werte';
import { nav } from '../nav';
import { SPORT_COLOR, sportIcon } from '../icons';
import { nutritionToday } from './essen';
import { daysUntil } from '../../../shared/race';
import { syncStatusLine } from '../sync';

const STATUS_KEY = ['heute.st.ready', 'heute.st.easy', 'heute.st.rest', 'heute.st.novalues'];

/* Auftrag 14: Ring, Wort, Farbe und Satz kommen alle aus demselben Bereitschafts-Wert (nie aus einer älteren Morgen-Nachricht). */
export function todayStatus() {
  const d = D(); const R = d.readiness;
  if (d.ill) return { level: 2, word: t('heute.st.sick'), line: t('heute.sickLine') };
  if (d.ret && d.ret.stage < 3) return { level: Math.max(1, R.level === 3 ? 1 : R.level), word: t('heute.st.return'), line: t(RETURN_STAGES[d.ret.stage]) };
  const level = R.level;
  const reasons = R.reasons.join(', ');
  let line: string;
  if (level === 3) {
    const few = R.uncertain === 'few' ? R.crits.filter((c: any) => ['HFV', 'Ruhepuls', 'Schlaf', 'Gefühl'].includes(c.k)).map((c: any) => t(CRIT_LABEL[c.k] || c.k)).join(', ') : '';
    line = few ? t('heute.unsureFew', { v: few }) : t('heute.unsureNone') + (R.staleLevel != null ? ' ' + t('heute.unsureStale', { c: t(['heute.c.green', 'heute.c.yellow', 'heute.c.red'][R.staleLevel] || 'heute.c.green') }) : '');
  } else line = t(['heute.line.green', 'heute.line.yellow', 'heute.line.red'][level], { s: R.score }) + (level > 0 ? ' ' + (reasons || t('heute.yellowLine')) + '.' : '');
  return { level, word: t(STATUS_KEY[level] || STATUS_KEY[3]), line };
}

const CRIT_LABEL: Record<string, string> = { HFV: 'v.hrv', Ruhepuls: 'v.rhr', Schlaf: 'v.sleep', 'Gefühl': 'v.feel', Belastung: 'v.load', 'Temp.': 'v.tempShort', Krankheit: 'v.ill' };
const CRIT_FIELD: Record<string, string> = { HFV: 'hrv', Ruhepuls: 'restingHR', Schlaf: 'sleepHours', 'Gefühl': 'feel', 'Temp.': 'bodyTemp' };
/* Einzelwerte unter „Warum?“, jeder mit eigener Ampelfarbe (grau = fehlt oder wird noch gelernt) */
function critTiles(): string {
  const d = D(); const R = d.readiness; const p = (R.stale ? null : R.point) || {};
  const list: any[] = [...R.crits];
  for (const k of ['HFV', 'Ruhepuls', 'Schlaf']) if (!list.some(c => c.k === k)) list.push({ k, v: '–', t: t('heute.critMissing'), st: 'none' });
  const order = ['Krankheit', 'HFV', 'Ruhepuls', 'Schlaf', 'Gefühl', 'Belastung', 'Temp.'];
  list.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
  const stWord: Record<string, string> = { ok: 'heute.c.green', warn: 'heute.c.yellow', bad: 'heute.c.red', none: 'heute.c.none' };
  return `<div class="crit-grid">${list.map(c => `<button class="crit ${c.st}" data-act="checkin-open" aria-label="${esc(t(CRIT_LABEL[c.k] || c.k) + ': ' + c.v + ', ' + t(stWord[c.st] || 'heute.c.none'))}"><div class="k"><i></i>${esc(t(CRIT_LABEL[c.k] || c.k))} ${CRIT_FIELD[c.k] ? srcBadge((p._src || {})[CRIT_FIELD[c.k]]) : ''}</div><div class="v">${esc(c.v)}</div><div class="n">${esc(c.t || '')}</div></button>`).join('')}</div>`;
}

function historyBars(): string {
  const h = D().history;
  if (!h.some((x: any) => x.level != null)) return '';
  const col = (l: number | null) => l === 0 ? 'var(--good)' : l === 1 ? 'var(--warn)' : l === 2 ? 'var(--bad)' : 'var(--line)';
  return `<div><div class="row" style="align-items:flex-end;gap:3px;height:30px" role="img" aria-label="${esc(t('heute.history'))}">${h.map((x: any) => `<i style="flex:1;border-radius:3px;height:${x.score != null ? Math.max(15, x.score) : 15}%;background:${x.ill ? 'var(--rest)' : col(x.level)}${x.level == null ? ';opacity:.4' : ''}" title="${dowShort(x.date)} ${fmtDate(x.date)}${x.score != null ? ': ' + x.score : ''}"></i>`).join('')}</div>
    <div class="spread xs muted"><span>${esc(t('heute.14ago'))}</span><span>${esc(t('common.today'))}</span></div></div>`;
}

function answerCard(): string {
  const d = D(); const s = todayStatus();
  const day = findDay(d.today);
  const list = day ? day.sessions.filter((x: any) => x.sport !== 'rest').map((x: any) => ({ ...x, date: d.today })) : [];
  const beforeStart = !!day && day.sessions.some((x: any) => x.sport === 'rest' && x.title === 'Vor dem Planstart');
  const own = (STATE.trend || []).find((p: any) => p.date === d.today);
  const noValues = !C.hasRecovery(own);
  const sessions = list.length ? list.map((x: any) => {
    const st = sessState(x.id); const status = effStatus(x);
    return `<div class="session-hero ${st.completed ? 'done' : ''}" style="--c:${SPORT_COLOR[x.sport]}">
      <button class="row grow" data-act="sess-open" data-sid="${esc(x.id)}" style="border:0;background:none;padding:0;text-align:left;color:inherit;min-height:44px"><span class="ic">${sportIcon(x.sport)}</span>
      <span class="grow"><span class="t">${esc(x.title)}</span>${x._adj ? ' ' + pill(t('st.adjusted'), 'warn') : ''}<br><span class="m">${esc(st.completed ? (doneLine(x) || metaLine(x)) : metaLine(x))}</span></span></button>
      ${status === 'cancelled' || status === 'sick' ? '' : `<button class="check ${st.completed ? 'on' : ''}" data-act="sess-toggle" data-sid="${esc(x.id)}" aria-pressed="${!!st.completed}" aria-label="${esc(st.completed ? t('sess.undone') : t('sess.done'))}">${ic('check')}</button>`}</div>`;
  }).join('') : `<div class="session-hero" style="--c:var(--rest)"><span class="ic">${sportIcon('rest')}</span><span class="grow"><span class="t">${esc(t(beforeStart ? 'plan.beforeStart' : 'heute.restDay'))}</span><br><span class="m">${esc(t(beforeStart ? 'heute.startsSoon' : 'heute.restLine'))}</span></span></div>`;
  return `<div class="answer l${s.level}">
    <div class="answer-top">${ring(d.ill ? null : d.readiness.score, s.level, t('heute.readiness'))}
      <div class="grow"><div class="status-word">${esc(s.word)}</div><div class="coach-line">${esc(s.line)}</div></div></div>
    <div class="stack" style="margin-top:var(--s4)">${sessions}</div>
    ${noValues && !d.ill ? `<button class="btn soft block" data-act="checkin-open" style="margin-top:var(--s3)">${ic('plus')} ${esc(t('heute.enterValues'))}</button>` : ''}
    <details class="more" style="margin-top:var(--s3)"><summary>${esc(t('heute.why'))}<span class="chev">${ic('down')}</span></summary><div class="body">${critTiles()}${historyBars()}
      ${d.readiness.point && !d.readiness.personal ? `<div class="hint">${esc(t('heute.fixedLimits', { n: C.MIN_DAYS }))}</div>` : ''}
      <div class="row wrap"><button class="btn ghost sm" data-act="checkin-open">${ic('edit')} ${esc(t('heute.editValues'))}</button></div></div></details>
  </div>`;
}

function illnessBlock(): string {
  const d = D();
  if (d.ill) {
    const n = daysBetween(d.ill.start, d.today) + 1;
    return `<div class="card" style="margin-top:var(--s3)"><div class="spread"><b>${esc(t('heute.sickSince', { d: `${dowShort(d.ill.start)} ${fmtDate(d.ill.start)}`, n }))}</b></div>
      <div class="hint">${esc(t('heute.sickHint'))}</div><div class="banner info">${esc(t('heute.doctor'))}</div>
      <button class="btn block" data-act="ill-end">${esc(t('heute.healthy'))}</button></div>`;
  }
  if (d.ret) return `<div class="card" style="margin-top:var(--s3)"><b>${esc(t('heute.returnDay', { n: d.ret.day }))}</b><div class="hint">${esc(t(RETURN_STAGES[d.ret.stage]))}</div><button class="link" data-act="ill-reopen">${esc(t('heute.stillSick'))}</button></div>`;
  // Auftrag 19: sichtbar statt versteckt – krank (Plan pausiert, danach Wiedereinstieg in Stufen) oder Schmerzen (Coach fragt wo und wie stark)
  return `<div class="health-row" data-health><span class="xs muted">${esc(t('heute.sickOrHurt'))}</span><div class="row wrap"><button class="btn ghost sm" data-act="ill-start">${ic('sick')} ${esc(t('heute.imSick'))}</button><button class="btn ghost sm" data-act="coach-ask" data-text="${esc(t('heute.painSay'))}">${ic('pulse')} ${esc(t('heute.pain'))}</button></div></div>`;
}

function weekStrip(): string {
  const d = D(); const day = findDay(d.today);
  if (!day) return '';
  const week = PLAN.weeks[day.weekIdx];
  return `<div class="week">${week.days.map((x: any) => {
    const stt = dayStats({ ...x });
    const real = x.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled);
    const dots = real.map((s: any) => `<i class="${sessState(s.id).completed ? 'done' : ''}" style="--c:${SPORT_COLOR[s.sport]}"></i>`).join('');
    const cls = [x.date === d.today ? 'today' : '', stt.sick ? 'sick' : '', stt.missed ? 'missed' : ''].join(' ');
    return `<button class="wd ${cls}" data-act="plan-day" data-date="${x.date}" aria-label="${esc(dowLong(x.date))} ${fmtDate(x.date)}"><span class="d">${dowShort(x.date)}</span><span class="n">${x.date.slice(8)}</span><span class="dots">${dots}</span></button>`;
  }).join('')}</div>`;
}

function nextRows(): string {
  const d = D(); const rows: string[] = [];
  const tm = addDays(d.today, 1);
  const tday = findDay(tm);
  const tl = tday ? tday.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled) : [];
  rows.push(li({ act: 'plan-day', data: { date: tm }, icon: tl.length ? sportIcon(tl[0].sport) : ic('moon'), color: tl.length ? SPORT_COLOR[tl[0].sport] : 'var(--rest)', title: t('heute.tomorrow') + ': ' + (tl.length ? tl.map((s: any) => s.title).join(', ') : t('heute.restDay')), sub: tl.length ? tl.map((s: any) => metaLine({ ...s, date: tm })).join(' · ') : '' }));
  // Zuletzt erledigt
  const last = d.activities.filter(a => a.date <= d.today).sort((a, b) => b.startMs - a.startMs)[0];
  const lastSess = [...(PLAN.weeks || [])].flatMap((w: any) => w.days.flatMap((x: any) => x.sessions.map((s: any) => ({ ...s, date: x.date })))).filter((s: any) => s.date <= d.today && sessState(s.id).completed).sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
  if (lastSess) rows.push(li({ act: 'sess-open', data: { sid: lastSess.id }, icon: sportIcon(lastSess.sport), color: SPORT_COLOR[lastSess.sport], title: `${t('heute.last')}: ${doneLine(lastSess) ? lastSess.title.replace(/ \d+ min\b/, '') : lastSess.title}`, sub: `${dowShort(lastSess.date)} ${fmtDate(lastSess.date)} · ${doneLine(lastSess) || metaLine(lastSess)}`, value: srcBadge(sessState(lastSess.id).source) }));
  void last;
  const forgot = forgottenSessions();
  if (forgot.length) rows.push(li({ act: 'missed-open', icon: ic('info'), color: 'var(--warn)', title: tn('heute.open', forgot.length), sub: t('heute.openSub') }));
  return `<div class="list" style="margin-top:var(--s3)">${rows.join('')}</div>`;
}

function raceBanner(): string {
  const d = D();
  if (d.raceGoal) { const n = daysUntil(d.today, d.raceGoal.date!); return `<button class="banner good" data-act="go-sub" data-sub="wettkampf" style="width:100%;text-align:left;margin-top:var(--s3)">${ic('flag')} <b>${esc(n === 0 ? t('race.today', { name: d.raceGoal.name }) : t('race.inDays', { name: d.raceGoal.name, n }))}</b> · ${esc(t('race.open'))}</button>`; }
  if (d.recentRace && !d.recentRace.result) return `<button class="banner info" data-act="go-sub" data-sub="wettkampf" style="width:100%;text-align:left;margin-top:var(--s3)">${ic('trophy')} ${esc(t('race.enterResult', { name: d.recentRace.name }))}</button>`;
  return '';
}

function coachPreview(): string {
  const msgs = Object.values(STATE.coachMsgs || {}).filter((m: any) => m && m.from !== 'user' && m.kind !== 'briefing').sort((a: any, b: any) => b.at - a.at);
  const m: any = msgs[0];
  if (!m || Date.now() - m.at > 3 * 86400000) return '';
  return sec(t('heute.coach'), `<button class="card" data-act="go-tab" data-tab="coach"><div class="lbl">${esc(m.title || t('coach.title'))}</div><div class="small" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(m.text)}</div></button>`);
}

function foodMini(): string {
  const n = nutritionToday();
  if (!n) return '';
  return sec(t('heute.food'), `<button class="card" data-act="go-sub" data-sub="essen"><div class="spread"><b>${esc(n.typeLabel)}</b><span class="small muted num">${n.eaten != null ? `${n.eaten} / ` : ''}${n.low}-${n.high} kcal</span></div>${n.eaten != null ? bar(n.eaten / n.high * 100, n.eaten < n.low ? 'var(--warn)' : 'var(--good)') : `<div class="hint">${esc(t('heute.foodNone'))}</div>`}</button>`);
}

/* Entwurf B: Coach-Feed mit Zeitleiste */
function feedVariant(): string {
  const d = D(); const s = todayStatus();
  const day = findDay(d.today);
  const list = day ? day.sessions.filter((x: any) => x.sport !== 'rest').map((x: any) => ({ ...x, date: d.today })) : [];
  return `<div class="msg coach" style="max-width:100%"><div class="h">${ring(d.readiness.score, s.level, '', true)} <span style="color:${['var(--good)', 'var(--warn)', 'var(--bad)', 'var(--ink-2)'][s.level]}">${esc(s.word)}</span></div>${esc(s.line)}</div>
    ${sec(t('heute.timeline'), `<div class="list">${list.length ? list.map(x => sessionRow(x)).join('') : li({ icon: ic('moon'), title: t('heute.restDay') })}${nextRows().replace('<div class="list" style="margin-top:var(--s3)">', '').replace(/<\/div>$/, '')}</div>`)}
    ${sec(t('heute.values'), critTiles())}`;
}

/* Auftrag 18: freiwillige Hinweise (Laufschuhe, Zyklus) – nur wenn eingetragen */
function careHints(): string {
  const d = D(); const st = STATE.settings || {};
  const l = [cycleHint(st.cycle, d.today), shoeHint(STATE, BASE_WEEKS, st.shoe, d.today)].filter(Boolean) as string[];
  return l.length ? `<div class="card stack" data-care-hints style="margin-top:var(--s3)">${l.map(x => `<div class="hint">${esc(x)}</div>`).join('')}</div>` : '';
}
export function renderHeute(): string {
  const d = D();
  const head = `<div class="spread" style="margin:var(--s1) 2px var(--s3)"><div><div class="lbl">${esc(dowLong(d.today))}, ${fmtDate(d.today)}</div></div>${d.goal && d.goal.date ? `<span class="pill accent">${esc(t('heute.goalIn', { name: d.goal.name, n: daysUntil(d.today, d.goal.date) }))}</span>` : ''}</div>${syncStatusLine()}`;
  if (UI.heuteVariant === 'feed') return head + feedVariant() + illnessBlock() + raceBanner() + sec(t('heute.week'), weekStrip()) + foodMini();
  return head + answerCard() + illnessBlock() + raceBanner() + careHints() + nextRows() + sec(t('heute.week'), weekStrip()) + coachPreview() + foodMini();
}

on('plan-day', el => { UI.planDate = el.dataset.date; nav.go('plan'); });
on('checkin-open', () => openCheckin(D().today));
void duration;

/* Offene (vergessene) Einheiten: einzeln abhaken/öffnen oder alle als ausgefallen markieren */
function missedSheet(): string {
  const list = forgottenSessions();
  if (!list.length) return `<div class="empty">${esc(t('heute.missedNone'))}</div>`;
  return `<div class="stack"><div class="hint">${esc(t('heute.missedHint'))}</div><div class="list">${list.map((s: any) => sessionRow(s)).join('')}</div>
    <button class="btn ghost" data-act="missed-skip-all">${esc(t('heute.missedSkipAll'))}</button></div>`;
}
on('missed-open', () => openSheet(t('heute.missedTitle'), missedSheet));
on('missed-skip-all', el => {
  if (!armed(el, t('common.sure'))) return;
  const list = forgottenSessions(); list.forEach((s: any) => { const st = ensureSess(s.id); st.skipped = true; st.completed = false; });
  saveState(); closeSheet(); nav.rerender(); toast(t('heute.missedSkipped', { n: list.length }));
});
