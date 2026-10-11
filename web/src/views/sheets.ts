/* Einstellungen, Export, Willkommen, Plan aktualisieren */
import * as CoachCore from '../../../shared/core';
import { STATE, PLAN, SESS, UI, HAS_PLAN, BASE_WEEKS, findDay, currentWeekIdx } from '../store';
import { $, esc, de, todayStr, addDays, daysBetween, fmtDate, dowShort, dowLong, secToPace, parseNum, round5, round50, rng } from '../util';
import { SPORTS, icon, uiIcon } from '../icons';
import * as D from '../domain';
import { sessState, effStatus, illnessAt, activeIllness, returnPhase, RETURN_STAGES, trendAt, latestTrend, latestWithKey, hasRecovery, rollingAvg, arrow, computeReadiness, readinessHistoryHtml, computeScore, tierLabel, perfEntries, forgottenSessions, computeZones, computePaceZones, computeSpeedZones } from '../domain';
import { sessionCard, dayCard, dayBadge, weekStrip, weekProgress, checkinFields } from '../components';
import { lineChart, illnessShades } from '../charts';
import { VS } from '../viewstate';
import { APP, APP_VERSION, STORAGE } from '../config';
import { buildExportText, buildWeekReport } from '../exporttext';
import { backupText } from '../backup';
import { syncSection, notifySection, syncWelcomePanel, isSyncOn } from '../sync';


export function openSheet(kind, arg?) { VS.SHEET = { kind, arg }; renderSheet(); $('#sheet').hidden = false; document.body.style.overflow = 'hidden'; }
export function closeSheet() { VS.SHEET = null; $('#sheet').hidden = true; $('#sheetPanel').innerHTML = ''; document.body.style.overflow = ''; }
export function sheetHead(t) { return `<div class="sheet-h"><h2>${t}</h2><button class="icon-btn" data-act="sheet-close" aria-label="Schließen">${uiIcon('close')}</button></div>`; }
export function renderSheet() {
  if (!VS.SHEET) return;
  const P = $('#sheetPanel');
  if (VS.SHEET.kind === 'export') {
    const d = VS.SHEET.arg || todayStr();
    P.innerHTML = sheetHead('Export') + `<div class="stack">
      <div class="hint">Enthält die Einheiten des Tages, deinen Status, die Erholungswerte und die Ernährung. Kopieren und in den Chat einfügen.</div>
      <div class="row"><div class="fld" style="flex:1;min-width:150px"><label for="ex-date">Datum</label><input class="inp" type="date" id="ex-date" value="${d}"></div>
      <button class="btn" data-act="export-copy" style="align-self:flex-end">Kopieren</button>${CAN_SHARE ? '<button class="btn ghost" data-act="export-share" style="align-self:flex-end">Teilen</button>' : ''}</div>
      <div class="seg" role="tablist">${[['day', 'Tag'], ['week', 'Wochenbericht für den Coach']].map(([k, l]) => `<button class="${(VS.SHEET.mode || 'day') === k ? 'on' : ''}" data-act="export-mode" data-mode="${k}">${l}</button>`).join('')}</div>
      <textarea class="inp" id="ex-text" rows="14" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px">${esc(VS.SHEET.mode === 'week' ? buildWeekReport(d) : buildExportText(d))}</textarea></div>`;
  } else if (VS.SHEET.kind === 'settings') {
    const S = STATE.settings, R = S.readiness;
    const theme = (() => { try { return localStorage.getItem(STORAGE.theme) || ''; } catch (e) { return ''; } })();
    const zr = computeZones(S.lthrRun), pz = computePaceZones(S.thresholdPaceRunSec), zb = computeZones(S.lthrBike), sz = computeSpeedZones(S.thresholdSpeedBikeKmh);
    const zcol = ['var(--rest)', 'var(--info)', 'var(--good)', 'var(--warn)', 'var(--bad)'];
    P.innerHTML = sheetHead('Einstellungen') + `<div class="stack">
      <div class="sec" style="margin-top:0"><div class="sec-h"><h2>Darstellung</h2></div><div class="seg">${[['', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button class="${theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${l}</button>`).join('')}</div></div>

      <div class="sec"><div class="sec-h"><h2>Ampel-Grenzwerte</h2><span class="aside">nur als Rückfall</span></div><div class="panel">
        <div class="hint">Die Ampel vergleicht deine Werte mit deinem persönlichen Normalbereich der letzten 28 Tage (ohne Krankheitstage). Diese festen Grenzen gelten nur, solange weniger als ${CoachCore.MIN_DAYS} Tage Werte da sind. Temperatur: ab +0,3 °C Gelb, ab +0,5 °C Rot.</div>
        <div class="fgrid"><div class="fld"><label for="r-rhr">Ruhepuls max</label><input class="inp" type="number" id="r-rhr" value="${R.rhrMax}"></div><div class="fld"><label for="r-hrv">HFV min</label><input class="inp" type="number" id="r-hrv" value="${R.hrvMin}"></div><div class="fld"><label for="r-temp">Temp. max °C</label><input class="inp" type="number" step="0.1" id="r-temp" value="${R.tempMax}"></div></div>
        <button class="btn small" data-act="save-ready">Speichern</button></div></div>

      <div class="sec"><div class="sec-h"><h2>Zonen</h2><span class="aside">nach dem Schwellentest anpassen</span></div><div class="panel">
        <div class="fgrid"><div class="fld"><label for="z-lr">LTHR Laufen</label><input class="inp" type="number" id="z-lr" value="${S.lthrRun}"></div><div class="fld"><label for="z-lb">LTHR Rad</label><input class="inp" type="number" id="z-lb" value="${S.lthrBike}"></div><div class="fld"><label for="z-tp">Schwellen-Pace</label><input class="inp" type="text" inputmode="decimal" id="z-tp" value="${secToPace(S.thresholdPaceRunSec)}" placeholder="5:39"></div><div class="fld"><label for="z-ts">Schwelle Rad km/h</label><input class="inp" type="number" step="any" id="z-ts" value="${S.thresholdSpeedBikeKmh}"></div></div>
        <button class="btn small" data-act="save-zones">Speichern</button>
        <div class="zbar">${zcol.map(c => `<i style="background:${c}"></i>`).join('')}</div>
        <div class="lbl">Laufen</div><div class="scroll-x"><table class="tbl"><tbody>${zr.map((z, i) => `<tr><td><b style="color:${zcol[i]}">Z${z.zone}</b></td><td>${esc(z.label)}</td><td>${z.lowBpm}${z.highBpm ? '-' + z.highBpm : '+'} bpm</td><td>${secToPace(pz[i].fastSec)}${pz[i].slowSec ? '-' + secToPace(pz[i].slowSec) : '+'}/km</td></tr>`).join('')}</tbody></table></div>
        <div class="lbl">Rad</div><div class="scroll-x"><table class="tbl"><tbody>${zb.map((z, i) => `<tr><td><b style="color:${zcol[i]}">Z${z.zone}</b></td><td>${esc(z.label)}</td><td>${z.lowBpm}${z.highBpm ? '-' + z.highBpm : '+'} bpm</td><td>${de(sz[i].lowKmh)}${sz[i].highKmh ? '-' + de(sz[i].highKmh) : '+'} km/h</td></tr>`).join('')}</tbody></table></div>
        <div class="hint">Passt Pace oder Speed, aber der Puls ist hoch, war es ein schwerer Tag und kein Rückschritt. Der Rad-Speed ist eine grobe Schätzung, bis mehr Fahrten mit dem Rennrad da sind.</div></div></div>

      <div class="sec"><div class="sec-h"><h2>Krankheitsphasen</h2></div><div class="panel">
        <div class="hint">In diesen Zeiträumen zählen geplante Einheiten nicht als verpasst. Leeres Ende heißt: läuft noch.</div>
        ${STATE.illnessPeriods.length ? STATE.illnessPeriods.map(p => `<div class="fgrid" data-ill="${esc(p.id)}" style="padding-top:10px;border-top:1px solid var(--line)">
          <div class="fld"><label>Von</label><input class="inp" type="date" data-illf="start" value="${p.start || ''}"></div>
          <div class="fld"><label>Bis</label><input class="inp" type="date" data-illf="end" value="${p.end || ''}"></div>
          <div class="fld" style="grid-column: span 2"><label>Notiz</label><input class="inp" type="text" data-illf="note" value="${esc(p.note || '')}"></div>
          <div class="fld" style="justify-content:flex-end"><button class="btn danger small" data-act="ill-del">Löschen</button></div></div>`).join('') : '<div class="empty">Keine Einträge.</div>'}
        <button class="btn ghost small" data-act="ill-add">+ Phase hinzufügen</button></div></div>

      ${syncSection()}
      ${notifySection()}
      ${planUpdateSection()}
      <div class="sec"><div class="sec-h"><h2>Backup</h2>${STATE.lastBackupAt ? `<span class="aside">zuletzt ${fmtDate(STATE.lastBackupAt.slice(0, 10))}</span>` : ''}</div><div class="panel">
        <div class="hint">${syncOn() ? 'Der Server sichert deine Daten jeden Tag automatisch (siehe Sync). Ein Datei-Backup ist zusätzlich möglich.' : `Deine Daten liegen nur auf diesem Gerät. Sichere sie einmal pro Woche als Datei, z. B. in iCloud Drive. Dann bist du sicher, auch wenn das Handy kaputtgeht.`}</div>
        <div class="row"><button class="btn small" data-act="backup-file">Als Datei sichern</button><button class="btn ghost small" data-act="backup-copy">Backup kopieren</button></div>
        <textarea class="inp" id="bk-out" rows="3" readonly style="font-family:ui-monospace,Menlo,monospace;font-size:11px"></textarea>
        <div class="hr"></div>
        <div class="fld"><label for="bk-in">Backup wiederherstellen</label><textarea class="inp" id="bk-in" rows="3" placeholder="Backup-Text hier einfügen" style="font-family:ui-monospace,Menlo,monospace;font-size:11px"></textarea></div>
        <div class="row"><label class="btn ghost small" for="bk-file">Datei wählen</label><input type="file" id="bk-file" accept="application/json,.json,.txt,text/plain" hidden>
        <button class="btn danger small" data-act="backup-load">Einfügen und laden</button></div>
        <div class="hint">Beim Laden werden alle aktuellen Daten durch das Backup ersetzt.</div></div></div>
      ${appInfoSection()}
      <div class="hint" style="text-align:center;padding-top:8px">Erstellt von deinem Claude Coach.</div>
    </div>`;
    const out = $('#bk-out'); if (out) out.value = backupText();
  }
}

/* ================= Backup reminder / welcome / plan update ================= */
export const CAN_SHARE = typeof navigator.share === 'function';
export function syncOn() { return isSyncOn(); }
export function backupReminder() {
  if (syncOn()) return '';
  const last = STATE.lastBackupAt ? STATE.lastBackupAt.slice(0, 10) : null;
  const age = last ? daysBetween(last, todayStr()) : 999;
  if (age < 7) return '';
  return `<div class="sec"><div class="banner info row" style="justify-content:space-between;flex-wrap:nowrap"><span>${last ? `Letztes Backup vor ${age} Tagen.` : 'Noch kein Backup gemacht.'} Sichere deine Daten kurz als Datei.</span><button class="btn small" data-act="backup-file" style="flex-shrink:0">Sichern</button></div></div>`;
}
export function isStandalone() { return (navigator as any).standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); }
export function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
export const SHARE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
export const DOTS_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="vertical-align:-3px"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
export function installSteps() {
  return `<ol class="howto">
    <li>Unten rechts in Safari auf die <b>drei Punkte</b> ${DOTS_SVG} tippen.</li>
    <li><b>Teilen</b> ${SHARE_SVG} wählen.</li>
    <li>Nach unten scrollen und <b>Zum Home-Bildschirm</b> wählen.</li>
    <li><b>Als Web-App öffnen</b> eingeschaltet lassen, auf <b>Hinzufügen</b> tippen und die App ab jetzt über das neue Icon öffnen.</li></ol>
    <div class="hint">Ältere iOS-Version ohne drei Punkte: Das Teilen-Symbol ${SHARE_SVG} liegt direkt unten in der Leiste.</div>`;
}
export function renderWelcome() {
  const needInstall = isIOS() && !isStandalone();
  $('#app').innerHTML = `<div class="welcome">
    <div class="mark" aria-hidden="true"><span>${esc(APP.shortName)}</span><i></i></div>
    <h1 class="view-title" style="margin-top:18px">${esc(APP.name)}<small>Dein Training, deine Werte und dein Essen, als App auf dem Handy.</small></h1>
    ${needInstall ? `<div class="panel" style="border-color:var(--accent)"><div class="sec-h"><h2 style="color:var(--accent)">Schritt 1: App installieren</h2></div>
      <div class="hint">Mach das zuerst. Daten, die du hier in Safari lädst, sieht die installierte App nicht.</div>${installSteps()}</div>` : ''}
    <div class="panel"><div class="sec-h"><h2>${needInstall ? 'Schritt 2: ' : ''}Daten laden</h2></div>
      <div class="hint">Öffne die alte App, tippe auf Einstellungen und dann auf <b>Backup kopieren</b>. Füge den Text hier ein. Oder wähle eine Backup-Datei aus.</div>
      <textarea class="inp" id="bk-in" rows="4" placeholder="Backup-Text hier einfügen" style="font-family:ui-monospace,Menlo,monospace;font-size:12px"></textarea>
      <div class="row"><button class="btn" data-act="welcome-load">Daten laden</button><label class="btn ghost" for="bk-file">Datei wählen</label><input type="file" id="bk-file" accept="application/json,.json,.txt,text/plain" hidden></div>
      <div class="hint">Der Trainingsplan steckt im Backup mit drin. Deine Daten bleiben auf diesem Handy, bis du unter Einstellungen den Sync mit deinem eigenen Server einrichtest.</div></div>
    ${syncWelcomePanel()}
  </div>`;
}
export function planUpdateSection() {
  return `<div class="sec"><div class="sec-h"><h2>Plan aktualisieren</h2></div><div class="panel">
    <div class="hint">Wenn dein Coach dir im Chat einen neuen Plan-Code gibt (z. B. für Block 2), füge ihn hier ein. Deine Einträge bleiben erhalten.</div>
    <textarea class="inp" id="pl-in" rows="3" placeholder="Plan-Code hier einfügen" style="font-family:ui-monospace,Menlo,monospace;font-size:11px"></textarea>
    <button class="btn small" data-act="plan-load">Plan übernehmen</button></div></div>`;
}
export function appInfoSection() {
  return `<div class="sec"><div class="sec-h"><h2>App</h2><span class="aside">Version ${esc(APP_VERSION)}</span></div><div class="panel">
    ${isStandalone() ? '<div class="hint">Installiert auf dem Home-Bildschirm. Funktioniert auch offline.</div>' : `<div class="hint">So legst du die App auf den Home-Bildschirm:</div>${installSteps()}`}
    <button class="btn ghost small" data-act="app-update">Nach Update suchen</button></div></div>`;
}
