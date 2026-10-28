/* Auftrag 21: data-export behält je Umgebung die 5 neuesten Sicherungen; ältere werden komprimiert, Archive erst nach 60 Tagen gelöscht */
import { expect, test } from 'vitest';
// @ts-ignore – Skript ohne Typen
import { planPrune, groupOf } from '../../scripts/prune-backups.mjs';
test('5 neueste je Umgebung bleiben, ältere komprimiert, andere Dateien unberührt', () => {
  const day = 86400000, now = Date.parse('2026-10-28T12:00:00Z');
  const f = (name: string, d: number) => ({ name, mtime: now - d * day });
  const files = [...Array.from({ length: 8 }, (_, i) => f(`production-vor-x-${i}.sql`, i)), ...Array.from({ length: 7 }, (_, i) => f(`test-vor-${i}.sql`, i)), f('plan17-prod.json', 1), f('prod-freigabe.sql', 30)];
  const p = planPrune(files, [f('test-alt.sql.gz', 90), f('test-neu.sql.gz', 20)], now);
  expect(p.keep.filter((n: string) => groupOf(n) === 'production')).toEqual(['production-vor-x-0.sql', 'production-vor-x-1.sql', 'production-vor-x-2.sql', 'production-vor-x-3.sql', 'production-vor-x-4.sql']);
  expect(p.compress).toContain('prod-freigabe.sql');
  expect(p.compress).not.toContain('plan17-prod.json');
  expect(p.compress.filter((n: string) => groupOf(n) === 'test')).toHaveLength(2);
  expect(p.deleteArchive).toEqual([]);
});
test('Archive nur gelöscht, wenn mehr als 10 und älter als 60 Tage', () => {
  const now = Date.parse('2026-12-28T12:00:00Z');
  const arch = Array.from({ length: 13 }, (_, i) => ({ name: `test-${i}.sql.gz`, mtime: now - (i * 10) * 86400000 }));
  const p = planPrune([], arch, now);
  expect(p.deleteArchive).toEqual(['test-10.sql.gz', 'test-11.sql.gz', 'test-12.sql.gz']);
});
test('von Tests genutzte Vorlagen bleiben immer unverändert', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const files = Array.from({ length: 8 }, (_, i) => ({ name: `prod-${i}.sqlite`, mtime: now - i * 86400000 }));
  const p = planPrune(files, [], now, new Set(['prod-7.sqlite']));
  expect(p.keep).toContain('prod-7.sqlite'); expect(p.compress).not.toContain('prod-7.sqlite');
});
