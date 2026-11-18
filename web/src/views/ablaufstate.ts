/* Auftrag 37: gemeinsamer Zugang des Ablaufs (Abschnitte, Sätze, Wiederholungen, Übungen) zum Datensatz der Einheit.
   Vorher hatten Intervalle und Abschnitte je einen eigenen Host (registerIntervalHost, registerSectionHost, registerPlannedLookup).
   fieldsui.ts registriert ihn einmal (gleicher Datensatz, gleiche Speicherung und Neubewertung wie alle übrigen Werte). */
import type { IvThresholds } from '../../../shared/intervals';

export type Tg = { kind: 'session' | 'custom'; id: string; date: string; sport: string; planned?: any };
export interface AbHost {
  rec: (tg: Tg) => any; put: (tg: Tg, next: any) => void; redraw: () => void; rev: (tg: Tg) => void;
  activities: () => Record<string, any>; thresholds: () => IvThresholds;
  /** geplante Einheit (nur bei geplanten Einheiten) */ planned: (tg: Tg) => any;
  /** 'free' = andere Intervalle als geplant (eigene Liste ohne Soll), 'none' = keine Sätze */ mode: (tg: Tg) => 'none' | 'free' | 'planned';
}
export let HOST: AbHost | null = null;
export function registerAbHost(h: AbHost) { HOST = h; }

export const attrsOf = (tg: Tg) => `data-tk="${tg.kind}" data-tid="${String(tg.id).replace(/"/g, '&quot;')}" data-tdate="${tg.date}" data-tsport="${tg.sport}"`;
/** Ziel aus den data-Attributen eines Knopfs bzw. Felds (mit der geplanten Einheit) */
export function tgOf(el: HTMLElement): Tg {
  const tg: Tg = { kind: el.dataset.tk as any, id: el.dataset.tid!, date: el.dataset.tdate!, sport: el.dataset.tsport! };
  tg.planned = HOST ? HOST.planned(tg) : null;
  return tg;
}
/** geplante Einheit für die Sätze: bei „andere Intervalle“ ohne Soll */
export const plannedIv = (tg: Tg) => (HOST && HOST.mode(tg) === 'free' && tg.planned ? { ...tg.planned, spec: null } : tg.planned || null);
export const actOf = (st: any) => (st && st.activityId && HOST ? HOST.activities()[st.activityId] || null : null);

/** Welcher Teil ist im Fenster offen (Schlüssel wie im Ablauf: sec:warm, set:0, rep:3, ex:1, add) */
export const SUB: { tg: Tg | null; key: string } = { tg: null, key: '' };
export function setSubKey(key: string) { SUB.key = key; }
/** Fenster eines Teils öffnen bzw. nach Hinzufügen den neuen Teil zeigen (ablaufui.ts setzt das) */
export const UIH: { open: (tg: Tg, key: string) => void } = { open: () => {} };
