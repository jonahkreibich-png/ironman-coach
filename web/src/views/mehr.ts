/* Mehr (Auftrag 25): wie die iOS-Einstellungen. Oben Suche und Profilkarte, darunter gruppierte Listen mit Symbolen.
   Jede Zeile öffnet genau eine Unterseite (höchstens 2 Ebenen). Die Suche filtert die Zeilen nach Titel, Untertitel und Stichworten. */
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { ic, pill, onInput } from '../kit';
import { D } from '../data';
import { profile } from '../store';
import { isSyncOn, statusText, me, isAdmin } from '../sync';
import { reauthHints } from './verbindungen';
import { backupDue } from './daten';
import { APP, APP_RELEASE } from '../config';
import { daysUntil } from '../../../shared/race';
import { notifySummary, themeLabel } from './einstellungen';

interface Row { sub: string; icon: string; color: string; title: string; sub2?: string; value?: string; badge?: string; keys?: string }
interface Group { title: string; rows: Row[] }

let QUERY = '';
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

/* Alle Zeilen an einer Stelle: dieselbe Liste für die Anzeige und die Suche */
export function mehrGroups(): Group[] {
  const d = D(); const p: any = profile();
  const race = d.raceGoal || d.recentRace;
  const reauth = reauthHints().length;
  const m = me() as any;
  const fbBadge = m.feedbackNew ? pill(t('fb.newCount', { n: m.feedbackNew }), 'warn') : m.repliesUnseen ? pill(t('fb.newReply'), 'info') : '';
  const training: Row[] = [
    { sub: 'profil', icon: 'target', color: 'var(--accent)', title: t('sub.profil'), sub2: d.goal ? t('mehr.profilGoal', { name: d.goal.name }) : t('mehr.profil'), keys: 'name geburtsjahr alter gewicht größe ziel ziele wettkampf sportarten wunschzeit prognose' },
    { sub: 'beruecksichtigungen', icon: 'info', color: 'var(--warn)', title: t('sub.beruecksichtigungen'), sub2: t('mehr.beruecksichtigungen'), keys: 'zeit zeiten wochenraster teamsport fussball spiele können kraul beschwerden krank krankheit zyklus regeln' },
    { sub: 'zonen', icon: 'pulse', color: 'var(--bad)', title: t('sub.zonen'), sub2: t('mehr.zonen'), keys: 'puls schwellenpuls pace tempo ftp watt css maxpuls zonen ampel ruhepuls hrv score test' },
    { sub: 'ausruestung', icon: 'tool', color: 'var(--bike)', title: t('sub.ausruestung'), sub2: t('mehr.ausruestung'), keys: 'rad räder fahrrad rolle smart trainer wattmesser pull buoy kickbrett flossen paddles schnorchel laufschuhe schuhe' },
    { sub: 'vorlagen', icon: 'edit', color: 'var(--strength)', title: t('sub.vorlagen'), sub2: t('mehr.vorlagen'), keys: 'vorlage vorlagen kraft übungen einheiten' },
    { sub: 'onboarding', icon: 'doc', color: 'var(--strength)', title: t('sub.onboarding'), sub2: t('mehr.onboarding'), keys: 'fragebogen neu plan erstellen' }
  ];
  const daily: Row[] = [
    ...(race ? [{ sub: 'wettkampf', icon: 'flag', color: 'var(--accent)', title: t('sub.wettkampf'), sub2: race.date && race.date >= d.today ? t('race.inDays', { name: race.name, n: daysUntil(d.today, race.date) }) : t('race.enterResult', { name: race.name }), keys: 'rennwoche pacing verpflegung ergebnis' }] : []),
    { sub: 'werte', icon: 'heart', color: 'var(--info)', title: t('sub.werte'), sub2: t('mehr.werte'), keys: 'morgenwerte ruhepuls hrv schlaf gewicht belastung ctl atl tsb form' },
    { sub: 'essen', icon: 'food', color: 'var(--good)', title: t('sub.essen'), sub2: t('mehr.essen'), keys: 'essen ernährung kalorien kohlenhydrate eiweiß foto gewicht' }
  ];
  const units = p.units === 'imperial' ? t('prof.imperial') : t('prof.metric');
  const groups: Group[] = [
    { title: t('mehr.g.account'), rows: [{ sub: 'konto', icon: 'user', color: 'var(--accent)', title: t('sub.konto'), sub2: isSyncOn() ? statusText() : t('mehr.kontoNone'), keys: 'konto anmelden anmeldung abmelden e-mail email geräte gerät koppeln sync wiederherstellung code' }] },
    { title: t('mehr.g.training'), rows: training },
    { title: t('mehr.g.daily'), rows: daily },
    { title: t('mehr.g.settings'), rows: [
      { sub: 'verbindungen', icon: 'link', color: 'var(--run)', title: t('sub.verbindungen'), sub2: t('mehr.verbindungen'), badge: reauth ? pill(t('conn.reauth'), 'warn') : '', keys: 'uhr ring garmin oura intervals healthfit apple health strava dropbox import datei verbindungen' },
      { sub: 'mitteilungen', icon: 'bell', color: 'var(--bad)', title: t('sub.mitteilungen'), sub2: notifySummary(), keys: 'mitteilungen push benachrichtigung erinnerung ruhezeit' },
      { sub: 'darstellung', icon: 'palette', color: 'var(--info)', title: t('sub.darstellung'), value: esc(themeLabel()), keys: 'hell dunkel farbschema design heute ansicht' },
      { sub: 'coachset', icon: 'chat', color: 'var(--accent)', title: t('sub.coachset'), sub2: t('mehr.coachset'), keys: 'ki coach chat nachrichten tagesrückblick einwilligung' },
      { sub: 'einheiten', icon: 'ruler', color: 'var(--good)', title: t('sub.einheiten'), value: esc(units), keys: 'km meilen kg pfund metrisch imperial' },
      { sub: 'sprache', icon: 'globe', color: 'var(--swim)', title: t('sub.sprache'), value: esc(p.lang === 'en' ? 'English' : 'Deutsch'), keys: 'sprache deutsch englisch english' }
    ] },
    { title: t('mehr.g.data'), rows: [{ sub: 'daten', icon: 'shield', color: 'var(--swim)', title: t('sub.daten'), sub2: t('mehr.daten'), badge: backupDue() ? pill(t('mehr.backupDue'), 'warn') : '', keys: 'backup sicherung export datei wiederherstellen löschen konto löschen datenschutz' }] },
    { title: t('mehr.g.help'), rows: [
      { sub: 'lexikon', icon: 'book', color: 'var(--info)', title: t('sub.lexikon'), sub2: t('mehr.lexikon'), keys: 'lexikon begriffe erklärung hilfe regeln' },
      { sub: 'feedback', icon: 'bug', color: 'var(--warn)', title: t('sub.feedback'), sub2: t('mehr.feedback'), badge: fbBadge, keys: 'fehler melden idee wunsch problem' }
    ] },
    { title: t('mehr.g.about'), rows: [{ sub: 'ueber', icon: 'help', color: 'var(--ink-2)', title: t('sub.ueber', { app: APP.name }), value: esc(t('mehr.version', { v: APP_RELEASE })), keys: 'version update aktualisieren installieren app fehlerprotokoll' }] }
  ];
  if (isAdmin()) groups.push({ title: t('mehr.g.operator'), rows: [{ sub: 'betreiber', icon: 'key', color: 'var(--ink-2)', title: t('sub.betreiber'), sub2: t('mehr.betreiber'), keys: 'einladung nutzer freischaltung ki verbrauch neurons serverfehler' }] });
  return groups.filter(g => g.rows.length);
}

const hit = (r: Row, g: Group, q: string) => !q || norm([r.title, r.sub2 || '', r.keys || '', g.title].join(' ')).includes(q);

function rowHtml(r: Row, g: Group): string {
  const search = esc(norm([r.title, r.sub2 || '', r.keys || '', g.title].join(' ')));
  return `<button class="li mrow" data-act="go-sub" data-sub="${esc(r.sub)}" data-q="${search}"><span class="ic" style="--c:${r.color}">${ic(r.icon)}</span>
    <span class="grow"><span class="t">${esc(r.title)}</span>${r.sub2 ? `<br><span class="s">${esc(r.sub2)}</span>` : ''}</span>${r.badge || ''}${r.value ? `<span class="v">${r.value}</span>` : ''}<span class="chev">${ic('right')}</span></button>`;
}

/* Profilkarte: Bild (oder Anfangsbuchstaben), Name und Hauptziel; öffnet „Profil und Ziele“ */
export function avatarHtml(size = 56): string {
  const p: any = profile();
  const name = String(p.name || '').trim();
  const initials = name ? name.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() : '';
  return p.photo && /^data:image\/(jpeg|png|webp);base64,/.test(p.photo)
    ? `<img class="avatar" src="${esc(p.photo)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`
    : `<span class="avatar ph" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px" aria-hidden="true">${initials ? esc(initials) : ic('user')}</span>`;
}
function profileCard(): string {
  const p: any = profile(); const d = D();
  const name = String(p.name || '').trim() || t('mehr.noName');
  return `<button class="list profile-card" data-act="go-sub" data-sub="profil" data-q="${esc(norm(name + ' profil ziele'))}"><span class="li" style="border-top:0">${avatarHtml(56)}
    <span class="grow"><span class="t" style="font-size:var(--t-lg)">${esc(name)}</span><br><span class="s">${esc(t('mehr.profilCard'))}</span></span><span class="chev">${ic('right')}</span></span></button>`;
}

export function renderMehr(): string {
  const q = norm(QUERY.trim());
  const groups = mehrGroups();
  let h = `<div class="mehr-search"><span class="ic" aria-hidden="true">${ic('search')}</span><input class="inp" type="search" id="mehr-q" data-ch="mehr-q" placeholder="${esc(t('mehr.search'))}" aria-label="${esc(t('mehr.search'))}" value="${esc(QUERY)}" autocomplete="off" enterkeyhint="search"></div>`;
  h += `<div data-mgroup="profile" ${q && !norm(String((profile() as any).name || '') + ' profil ziele').includes(q) ? 'hidden' : ''}>${profileCard()}</div>`;
  for (const g of groups) {
    const any = g.rows.some(r => hit(r, g, q));
    const head = g.rows.length > 1 ? `<div class="sec-h"><h2>${esc(g.title)}</h2></div>` : '';
    h += `<section class="sec mgroup" data-mgroup="${esc(g.title)}" ${any ? '' : 'hidden'}>${head}<div class="list">${g.rows.map(r => rowHtml(r, g).replace('<button class="li mrow"', `<button class="li mrow"${hit(r, g, q) ? '' : ' hidden'}`)).join('')}</div></section>`;
  }
  h += `<div class="empty" data-mehr-empty ${groups.some(g => g.rows.some(r => hit(r, g, q))) ? 'hidden' : ''}>${esc(t('mehr.noHits'))}</div>`;
  h += `<div class="xs muted" style="text-align:center;margin:var(--s4) 0 var(--s2)">${esc(APP.name)} · ${esc(t('mehr.version', { v: APP_RELEASE }))}</div>`;
  return h;
}

/* Suche ohne Neuzeichnen (Tastatur bleibt offen) */
onInput('mehr-q', el => {
  QUERY = (el as HTMLInputElement).value;
  const q = norm(QUERY.trim());
  const root = el.closest('main') || document;
  let total = 0;
  root.querySelectorAll<HTMLElement>('.mgroup').forEach(sec => {
    let n = 0;
    sec.querySelectorAll<HTMLElement>('.mrow').forEach(r => { const ok = !q || (r.dataset.q || '').includes(q); r.hidden = !ok; if (ok) n++; });
    sec.hidden = n === 0; total += n;
  });
  const prof = root.querySelector<HTMLElement>('[data-mgroup="profile"]');
  if (prof) { const ok = !q || (prof.querySelector<HTMLElement>('[data-q]')?.dataset.q || '').includes(q); prof.hidden = !ok; if (ok) total++; }
  const empty = root.querySelector<HTMLElement>('[data-mehr-empty]'); if (empty) empty.hidden = total > 0;
});
export function resetMehrSearch() { QUERY = ''; }
