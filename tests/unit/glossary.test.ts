import { describe, expect, test } from 'vitest';
import { JARGON, searchGlossary, termsLine, withTerms } from '../../shared/glossary';

describe('zentrales Trainingslexikon', () => {
  test('enthält die verwendeten Kernbegriffe mit verständlichen Definitionen', () => {
    for (const term of ['CTL', 'ATL', 'TSB', 'ATL/CTL', 'ACWR', 'VO2max', 'FTP', 'CSS', 'Zonen', 'Belastung', 'Periodisierung', 'Tapering', 'RPE', 'HFV', 'LTHR', 'Kadenz', 'Sweet Spot', 'Over-Unders', 'Koppellauf']) {
      expect(JARGON.find(j => j.term === term)?.text.length, term).toBeGreaterThan(60);
    }
    expect(new Set(JARGON.map(j => j.term)).size).toBe(JARGON.length);
  });
  test('sucht auch Aliase, Umlaute, mehrere Wörter und Themen; sortiert alphabetisch', () => {
    expect(searchGlossary('vo₂max').map(j => j.term)).toContain('VO2max');
    expect(searchGlossary('herzfrequenzvariabilitat').map(j => j.term)).toContain('HFV');
    expect(searchGlossary('functional power').map(j => j.term)).toEqual(['FTP']);
    expect(searchGlossary('', 'planning').every(j => j.topic === 'planning')).toBe(true);
    expect(searchGlossary('FTP', 'technique')).toEqual([]);
    expect(searchGlossary('nichtvorhanden')).toEqual([]);
    const names = searchGlossary().map(j => j.term);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'de')));
  });
  test('fügt weder Coach- noch Einheitentexten wiederholte Erklärungen an', () => {
    const text = 'FTP-Intervalle, RPE 7. Bei Schmerzen abbrechen. CSS = Schwellentempo im Wasser.';
    expect(termsLine(text)).toBe('');
    expect(withTerms(text)).toBe(text);
  });
  test('bezeichnet Belastungsmodelle als Näherungen ohne Verletzungsprognose', () => {
    expect(JARGON.find(j => j.term === 'CTL')?.text).toContain('42 Tagen Zeitkonstante');
    expect(JARGON.find(j => j.term === 'ATL')?.text).toContain('7 Tagen Zeitkonstante');
    expect(JARGON.find(j => j.term === 'TSB')?.text).toContain('Tagesende');
    expect(JARGON.find(j => j.term === 'ATL/CTL')?.text).toContain('keine Verletzung voraus');
    expect(JARGON.find(j => j.term === 'ACWR')?.text).toContain('Kein persönlicher Verletzungsprädiktor');
  });
});
