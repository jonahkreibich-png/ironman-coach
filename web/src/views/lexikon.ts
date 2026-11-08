import { searchGlossary, findTerm, type GlossaryTopic, type Term } from '../../../shared/glossary';
import { t } from '../../../shared/i18n';
import { esc } from '../util';
import { ic } from '../icons';
import { MARKS } from '../../../shared/intensity';

/* Auftrag 17, Punkt 5: alle Begriffe an einem Ort, nach Themen, mit Suche. Begriffs-Links aus den Ansichten öffnen das Lexikon mit dem Begriff. */
const topics: GlossaryTopic[] = ['understand', 'load', 'values', 'intensity', 'planning', 'technique', 'sessions'];
let preset = '';
export function setLexiconQuery(q: string): void { const j = findTerm(q); preset = j ? j.term : q; }
/* Auftrag 19: Formen der Einheiten-Bibliothek mit Steckbrief und Ablaufbild (SVG aus den Bausteinen, keine Nutzerdaten) */
const card = (j: Term) => `<article class="card lexicon-entry" data-lexicon-term="${esc(j.term)}"><h3>${esc(j.term)}</h3><p>${esc(j.text)}</p>${j.diagram ? `<div class="wo-diagram-wrap">${j.diagram}</div>` : ''}${j.facts && j.facts.length ? `<ul class="wo-facts">${j.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</article>`;
function results(query = '', topic: GlossaryTopic | '' = ''): string {
  const terms = searchGlossary(query, topic);
  const count = `<p class="muted xs" role="status">${esc(t('lexicon.count', { n: terms.length }))}</p>`;
  if (!terms.length) return `${count}<p class="empty">${esc(t('lexicon.empty'))}</p>`;
  // ohne Suche nach Themen gruppiert, mit Suche eine Liste
  if (query.trim() || topic) return count + terms.map(card).join('');
  return count + topics.map(k => { const g = terms.filter(j => j.topic === k); return g.length ? `<h2 class="lexicon-topic">${esc(t('lexicon.' + k))}</h2>${g.map(card).join('')}` : ''; }).join('');
}
/* Auftrag 30: Legende der Symbole und Farbstreifen im Plan (dieselbe Liste wie im Plan: shared/intensity.ts) */
function legendHtml(): string {
  const bands: [string, string, string][] = [['var(--good)', 'locker', 'Zone 1–2, Unterhaltungstempo'], ['var(--warn)', 'mittel', 'lange Einheit, Zone 3, leichte Qualität, Kraft'], ['var(--bad)', 'hart', 'Intervalle, Schwelle, Test, Wettkampf, Spiel']];
  return `<details class="more" data-legend><summary>Symbole im Plan<span class="chev">${ic('down')}</span></summary><div class="body"><div class="list mk-legend">${MARKS.map(m => `<div class="li" data-legend-mark="${m.key}"><span class="ic-mk mk-${m.key}">${ic(m.icon)}</span><span class="grow"><span class="t">${esc(m.label)}</span><br><span class="s">${esc(m.text)}</span></span></div>`).join('')}
    ${bands.map(([c, l, x]) => `<div class="li" data-legend-band="${l}"><span class="ic-mk"><i class="int-dot" style="background:${c}"></i></span><span class="grow"><span class="t">Streifen ${esc(l)}</span><br><span class="s">${esc(x)}</span></span></div>`).join('')}</div></div></details>`;
}
export function renderLexikon(): string {
  const q = preset; preset = '';
  return `<p class="muted">${esc(t('lexicon.intro'))}</p>${legendHtml()}<div class="card lexicon-filters"><label for="lexicon-search">${esc(t('lexicon.search'))}</label><input id="lexicon-search" class="inp" type="search" autocomplete="off" value="${esc(q)}" placeholder="${esc(t('lexicon.placeholder'))}" aria-controls="lexicon-results"><label for="lexicon-topic">${esc(t('lexicon.topic'))}</label><select class="inp" id="lexicon-topic" aria-controls="lexicon-results"><option value="">${esc(t('lexicon.all'))}</option>${topics.map(k => `<option value="${k}">${esc(t('lexicon.' + k))}</option>`).join('')}</select></div><div id="lexicon-results">${results(q)}</div><details class="more"><summary>${esc(t('lexicon.sources'))}</summary><div class="body"><p><a href="https://help.trainingpeaks.com/hc/en-us/articles/204071764-Form-TSB" target="_blank" rel="noopener noreferrer">TrainingPeaks: Form / TSB</a></p><p><a href="https://www.trainingpeaks.com/coach-blog/a-coachs-guide-to-atl-ctl-tsb/" target="_blank" rel="noopener noreferrer">TrainingPeaks: ATL, CTL, TSB</a></p><p><a href="https://www.swimsmooth.guru/css/calcsingle" target="_blank" rel="noopener noreferrer">Swim Smooth: CSS</a></p><p><a href="https://www.trainingpeaks.com/learn/articles/what-is-threshold-power/" target="_blank" rel="noopener noreferrer">Andrew Coggan: FTP</a></p><p><a href="https://arxiv.org/abs/1907.05326" target="_blank" rel="noopener noreferrer">Wang et al.: ACWR – Grenzen der Methode</a></p></div></details>`;
}
function filter() {
  const input = document.getElementById('lexicon-search') as HTMLInputElement | null;
  const select = document.getElementById('lexicon-topic') as HTMLSelectElement | null;
  const target = document.getElementById('lexicon-results');
  if (input && select && target) target.innerHTML = results(input.value, select.value as GlossaryTopic | '');
}
document.addEventListener('input', e => { if ((e.target as HTMLElement).id === 'lexicon-search') filter(); });
document.addEventListener('change', e => { if ((e.target as HTMLElement).id === 'lexicon-topic') filter(); });
