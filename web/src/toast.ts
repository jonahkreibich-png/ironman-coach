import { storage, storageMessage } from './persistence';
/* Kurze Meldungen und „Nochmal tippen“-Bestätigung. */
import { $ } from './util';

let toastTimer: any = null;
export function toast(msg: string): void {
  if (/gespeichert|saved|consentSaved|revoked/i.test(msg) && storage.status !== 'saved') msg = storageMessage();
  const el = $('#toast'); if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}
export function armed(btn: HTMLElement, label?: string): boolean {
  if (btn.dataset.armed === '1') return true;
  btn.dataset.armed = '1'; const orig = btn.innerHTML;
  btn.textContent = label || 'Sicher? Nochmal tippen'; btn.classList.add('armed');
  setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.innerHTML = orig; btn.classList.remove('armed'); } }, 3200);
  return false;
}
