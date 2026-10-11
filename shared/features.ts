/* Freischaltungen pro Nutzer. Der Betreiber (Admin) hat immer alles.
   Andere Nutzer bekommen Funktionen einzeln (heute vom Admin für Tester, später z. B. per Kauf im Store). */
export const FEATURE_KEYS = ['ai', 'foodPhoto', 'generator'] as const;
export type FeatureKey = typeof FEATURE_KEYS[number];
export type Entitlements = Record<FeatureKey, boolean>;

export function entitlements(role: string | null | undefined, features: Record<string, any> | null | undefined): Entitlements {
  const f = features || {};
  const out = {} as Entitlements;
  for (const k of FEATURE_KEYS) out[k] = role === 'admin' || f[k] === true;
  return out;
}

/* KI-Coach: ab 16 eigene Einwilligung, darunter zusätzlich die eines Elternteils.
   Die übrigen Schutzregeln für unter 18 (keine Gewichtsziele, vorsichtigere Steigerung) bleiben unabhängig davon. */
export const AI_OWN_CONSENT_AGE = 16;
export function needsParentConsent(age: number | null): boolean { return age != null && age < AI_OWN_CONSENT_AGE; }
