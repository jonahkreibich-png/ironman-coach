/* Jeder Text, den die App anzeigt, muss auf Deutsch vorhanden sein. Fehlt ein Schlüssel, zeigt die App sonst den Schlüssel selbst. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { de } from '../../shared/lang/de';
import { en } from '../../shared/lang/en';
import { t, setLang } from '../../shared/i18n';
import { GOALS } from '../../shared/goals';
import { QUICK } from '../../shared/coach/quick';
import { NUTRI_TYPES } from '../../shared/nutrition';
import { FEATURE_KEYS } from '../../shared/features';

function sources(): string[] {
  const out: string[] = [];
  const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!p.includes('lang')) walk(p); } else if (f.endsWith('.ts')) out.push(fs.readFileSync(p, 'utf8')); } };
  ['web/src', 'shared'].forEach(walk);
  return out;
}

describe('Texte (i18n)', () => {
  it('alle festen Schlüssel aus t(…) sind auf Deutsch vorhanden', () => {
    const missing = new Set<string>();
    for (const s of sources()) for (const m of s.matchAll(/\bt\('([a-zA-Z0-9_.-]+)'/g)) {
      const k = m[1];
      if (k.endsWith('.')) continue; // Präfix, unten geprüft
      if (k in de) continue;
      if (Object.keys(de).some(h => h.startsWith(k) && /^\d/.test(h.slice(k.length)))) continue; // ai.c + Nummer
      missing.add(k);
    }
    expect([...missing]).toEqual([]);
  });
  it('Schlüssel in Listen (z. B. Feldnamen) sind vorhanden', () => {
    const prefixes = new Set(Object.keys(de).map(k => k.split('.')[0]));
    const missing = new Set<string>();
    for (const s of sources()) for (const m of s.matchAll(/'([a-z]+)\.([a-zA-Z0-9.]+)'/g)) {
      const k = m[1] + '.' + m[2];
      if (!prefixes.has(m[1]) || k.endsWith('.') || /\.(ts|js|json|css|png|svg|html|mjs|md)$/.test(k) || k in de) continue;
      if (Object.keys(de).some(h => h.startsWith(k) && /^[\d.]/.test(h.slice(k.length)))) continue;
      missing.add(k);
    }
    expect([...missing]).toEqual([]);
  });
  it('dynamische Schlüssel-Familien sind vollständig', () => {
    const need = [
      ...Object.keys(GOALS).map(k => 'goal.' + k), ...[0, 1, 2, 3, 4, 5, 6].map(d => 'dow.' + d),
      ...['base', 'build', 'specific', 'taper', 'race'].map(p => 'phase.' + p), ...QUICK.map(q => 'quick.' + q.id),
      ...Object.keys(NUTRI_TYPES).flatMap(k => ['food.type.' + k, 'food.note.' + k]),
      ...['swim', 'bike', 'run', 'strength', 'football', 'rest', 'walk', 'multi', 'other'].map(s => 'sport.' + s),
      ...['work', 'rest', 'warmup', 'cooldown', 'steady'].map(k => 'lap.' + k),
      ...['heute', 'plan', 'coach', 'fortschritt', 'mehr'].map(k => 'tab.' + k),
      ...['werte', 'essen', 'profil', 'verbindungen', 'einstellungen', 'daten', 'wettkampf', 'onboarding', 'generator'].flatMap(k => ['sub.' + k, 'mehr.' + k]),
      ...['konto', 'zonen', 'ausruestung', 'mitteilungen', 'darstellung', 'coachset', 'einheiten', 'sprache', 'ueber', 'betreiber', 'vorlagen'].map(k => 'sub.' + k), // Auftrag 25
      ...['dropbox', 'oura', 'whoop', 'polar', 'withings', 'fitbit', 'intervals', 'shortcut', 'suunto', 'coros', 'wahoo', 'garmin', 'trainingpeaks'].map(k => 'conn.desc.' + k),
      ...['workouts', 'sleep', 'hrv', 'restingHR', 'temp', 'spo2', 'breath', 'load', 'weight'].map(k => 'group.' + k),
      ...['ready', 'easy', 'rest', 'novalues', 'sick', 'return'].map(k => 'heute.st.' + k), ...[0, 1, 2, 3].map(i => 'return.s' + i),
      ...['neu', 'ersetzt', 'gleich'].map(k => 'coach.st.' + k), ...FEATURE_KEYS.map(k => 'feature.' + k)
    ];
    expect(need.filter(k => !(k in de))).toEqual([]);
  });
  it('kein Text nennt die alte Marke', () => {
    expect(Object.values(de).filter(v => /iron\s*man/i.test(v))).toEqual([]);
  });
  it('Englisch fällt auf Deutsch zurück und ersetzt Platzhalter', () => {
    setLang('en');
    expect(t('tab.heute')).toBe(en['tab.heute'] || de['tab.heute']);
    expect(t('heute.goalIn', { name: 'X', n: 3 })).toMatch(/X/);
    setLang('de');
    expect(t('heute.goalIn', { name: 'Lauf', n: 3 })).toBe('Lauf in 3 Tagen');
  });
});
