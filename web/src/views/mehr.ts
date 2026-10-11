/* Mehr: alles, was nicht täglich gebraucht wird. Eine Liste, jede Zeile öffnet eine Unterseite. */
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { sec, li, ic, pill } from '../kit';
import { D } from '../data';
import { isSyncOn, statusText, entitled } from '../sync';
import { reauthHints } from './verbindungen';
import { backupDue } from './daten';
import { FEATURES } from '../config';
import { daysUntil } from '../../../shared/race';

export function renderMehr(): string {
  const d = D();
  const row = (sub: string, icon: string, color: string, sub2 = '', badge = '') => li({ act: 'go-sub', data: { sub }, icon: ic(icon), color, title: t('sub.' + sub), sub: sub2 || t('mehr.' + sub), value: badge, html: false });
  const race = d.raceGoal || d.recentRace;
  let h = '';
  if (race) h += `<div class="list" style="margin-bottom:var(--s3)">${row('wettkampf', 'flag', 'var(--accent)', race.date && race.date >= d.today ? t('race.inDays', { name: race.name, n: daysUntil(d.today, race.date) }) : t('race.enterResult', { name: race.name }))}</div>`;
  h += sec(t('mehr.daily'), `<div class="list">${row('werte', 'pulse', 'var(--info)')}${row('essen', 'food', 'var(--good)')}</div>`);
  const reauth = reauthHints().length;
  h += sec(t('mehr.setup'), `<div class="list">${row('profil', 'user', 'var(--accent)', d.goal ? t('mehr.profilGoal', { name: d.goal.name }) : '')}
    ${row('beruecksichtigungen', 'info', 'var(--warn)')}
    ${row('verbindungen', 'link', 'var(--run)', '', reauth ? pill(t('conn.reauth'), 'warn') : '')}
    ${row('einstellungen', 'sliders', 'var(--ink-2)')}
    ${row('daten', 'cloud', 'var(--swim)', isSyncOn() ? statusText() : '', backupDue() ? pill(t('mehr.backupDue'), 'warn') : '')}</div>`);
  const extra = [(FEATURES.generator || entitled('generator')) ? row('generator', 'wand', 'var(--bike)') : '', row('onboarding', 'doc', 'var(--strength)')].join('');
  h += sec(t('mehr.plan'), `<div class="list">${extra}</div>`);
  return h;
}
void esc;
