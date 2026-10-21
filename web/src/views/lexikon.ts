import { searchGlossary, type GlossaryTopic } from '../../../shared/glossary';
import { t } from '../../../shared/i18n';
import { esc } from '../util';

const topics: GlossaryTopic[] = ['load', 'intensity', 'planning', 'technique'];
function results(query = '', topic: GlossaryTopic | '' = ''): string {
  const terms = searchGlossary(query, topic);
  return `<p class="muted xs" role="status">${esc(t('lexicon.count', { n: terms.length }))}</p>${terms.length ? terms.map(j => `<article class="card lexicon-entry" data-lexicon-term="${esc(j.term)}"><h2>${esc(j.term)}</h2><p class="xs muted">${esc(t('lexicon.' + j.topic))}</p><p>${esc(j.text)}</p></article>`).join('') : `<p class="empty">${esc(t('lexicon.empty'))}</p>`}`;
}
export function renderLexikon(): string {
  return `<p class="muted">${esc(t('lexicon.intro'))}</p><div class="card lexicon-filters"><label for="lexicon-search">${esc(t('lexicon.search'))}</label><input id="lexicon-search" class="inp" type="search" autocomplete="off" placeholder="${esc(t('lexicon.placeholder'))}" aria-controls="lexicon-results"><label for="lexicon-topic">${esc(t('lexicon.topic'))}</label><select class="inp" id="lexicon-topic" aria-controls="lexicon-results"><option value="">${esc(t('lexicon.all'))}</option>${topics.map(k => `<option value="${k}">${esc(t('lexicon.' + k))}</option>`).join('')}</select></div><div id="lexicon-results">${results()}</div><details class="more"><summary>${esc(t('lexicon.sources'))}</summary><div class="body"><p><a href="https://help.trainingpeaks.com/hc/en-us/articles/204071764-Form-TSB" target="_blank" rel="noopener noreferrer">TrainingPeaks: Form / TSB</a></p><p><a href="https://www.trainingpeaks.com/coach-blog/a-coachs-guide-to-atl-ctl-tsb/" target="_blank" rel="noopener noreferrer">TrainingPeaks: ATL, CTL, TSB</a></p><p><a href="https://www.swimsmooth.guru/css/calcsingle" target="_blank" rel="noopener noreferrer">Swim Smooth: CSS</a></p><p><a href="https://www.trainingpeaks.com/learn/articles/what-is-threshold-power/" target="_blank" rel="noopener noreferrer">Andrew Coggan: FTP</a></p><p><a href="https://arxiv.org/abs/1907.05326" target="_blank" rel="noopener noreferrer">Wang et al.: ACWR – Grenzen der Methode</a></p></div></details>`;
}
function filter() {
  const input = document.getElementById('lexicon-search') as HTMLInputElement | null;
  const select = document.getElementById('lexicon-topic') as HTMLSelectElement | null;
  const target = document.getElementById('lexicon-results');
  if (input && select && target) target.innerHTML = results(input.value, select.value as GlossaryTopic | '');
}
document.addEventListener('input', e => { if ((e.target as HTMLElement).id === 'lexicon-search') filter(); });
document.addEventListener('change', e => { if ((e.target as HTMLElement).id === 'lexicon-topic') filter(); });
