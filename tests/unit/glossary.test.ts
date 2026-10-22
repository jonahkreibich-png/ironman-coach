import { describe, expect, test } from 'vitest';
import { JARGON, searchGlossary, findTerm, termsLine, withTerms } from '../../shared/glossary';
import { SESSION_TYPES } from '../../shared/sessiontypes';

describe('zentrales Trainingslexikon (Auftrag 17)', () => {
  test('enthält alle Begriffe der App, kurz und verständlich', () => {
    for (const term of ['CTL', 'ATL', 'TSB', 'ATL/CTL', 'ACWR', 'HFV', 'Ruhepuls', 'SpO2', 'VO2max', 'FTP', 'W/kg', 'CSS', 'LTHR', 'Zonen', 'Sweet Spot', 'Over-Unders', 'Intervalle',
      'Koppellauf', 'Tapering', 'Periodisierung', 'RPE', 'Entkopplung', 'SWOLF', 'Kadenz', 'Belastung', 'Pull Buoy', 'Kickbrett', 'Kraul am Stück', 'Soll und Ist', 'Harte Einheit', 'Erholungswoche']) {
      const j = JARGON.find(x => x.term === term);
      expect(j, term).toBeTruthy();
      expect(j!.text.length, term).toBeGreaterThan(40);
      expect(j!.text.length, term).toBeLessThan(260);
    }
    expect(new Set(JARGON.map(j => j.term)).size).toBe(JARGON.length);
  });
  test('jede Einheit aus der zentralen Liste steht im Lexikon', () => {
    for (const s of SESSION_TYPES) expect(findTerm(s.name)?.term, s.name).toBeTruthy();
    expect(searchGlossary('', 'sessions').length).toBeGreaterThan(20);
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
    expect(findTerm('HRV')?.term).toBe('HFV');
    expect(findTerm('ctl')?.term).toBe('CTL');
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
