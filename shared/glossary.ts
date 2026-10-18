/* Fachbegriffe mit kurzer Erklärung (Auftrag 15: keine Fachbegriffe ohne Erklärung).
   Taucht ein Begriff in einer Einheit oder Nachricht auf, steht die Erklärung dabei („Begriffe: …“), sofern der Text ihn nicht schon erklärt. */
export interface Term { term: string; re: RegExp; text: string; /** erkennt eine schon vorhandene Erklärung im Text */ ok?: RegExp }
export const JARGON: Term[] = [
  { term: 'CSS', re: /\bCSS\b/, text: 'CSS = dein Schwellentempo im Wasser, etwa so schnell, wie du 30 min am Stück kraulen kannst', ok: /Schwellentempo im Wasser|Critical Swim Speed/ },
  { term: 'FTP', re: /\bFTP\b/, text: 'FTP = die Leistung in Watt, die du etwa eine Stunde halten kannst', ok: /eine Stunde halten/ },
  { term: 'VO2max', re: /VO2max|VO2-max/i, text: 'VO2max = kurze, sehr harte Stücke nahe am Maximum, trainieren die Sauerstoffaufnahme', ok: /Sauerstoffaufnahme/ },
  { term: 'Sweet Spot', re: /Sweet Spot/i, text: 'Sweet Spot = zügig, aber lange gut durchzuhalten, etwas unter dem Tempo, das du eine Stunde halten kannst', ok: /etwas unter dem Tempo|lange gut durchzuhalten/ },
  { term: 'Over-Unders', re: /Over-Under/i, text: 'Over-Unders = im Wechsel etwas unter und etwas über dem Tempo, das du eine Stunde halten kannst', ok: /etwas unter und etwas über/ },
  { term: 'Schwelle', re: /Schwelle(?!ntempo im Wasser)/, text: 'Schwelle = das Tempo, das du etwa eine Stunde lang halten kannst (Zone 4)', ok: /eine Stunde (lang )?halten|Tempo, das du lange halten kannst/ },
  { term: 'Kadenz', re: /Kadenz/, text: 'Kadenz = Umdrehungen bzw. Schritte pro Minute', ok: /Umdrehungen|Schritte pro Minute|Trittfrequenz/ },
  { term: 'Tapering', re: /Tapering/, text: 'Tapering = weniger Umfang vor dem Wettkampf, damit du frisch an den Start gehst', ok: /frisch/ },
  { term: 'Koppellauf', re: /Koppel(lauf|training)/, text: 'Koppellauf = direkt nach dem Rad laufen, gewöhnt die Beine an den Wechsel', ok: /Wechsel vom Rad|direkt nach dem Rad/ },
  { term: 'HFV', re: /\bHFV\b/, text: 'HFV = Herzfrequenzvariabilität, zeigt, wie erholt du bist', ok: /Herzfrequenzvariabilität/ },
  { term: 'ACWR', re: /\bACWR\b/, text: 'ACWR = Belastung der letzten 7 Tage im Vergleich zu den letzten 4 Wochen', ok: /7 Tage|letzten 4 Wochen|28 Tage/ },
  { term: 'CTL', re: /\bCTL\b/, text: 'CTL = deine Fitness (Belastung der letzten 6 Wochen)', ok: /Fitness/ },
  { term: 'ATL', re: /\bATL\b/, text: 'ATL = deine Müdigkeit (Belastung der letzten 7 Tage)', ok: /Müdigkeit|Ermüdung/ },
  { term: 'TSB', re: /\bTSB\b/, text: 'TSB = deine Form (Fitness minus Müdigkeit)', ok: /Form/ },
  { term: 'RPE', re: /\bRPE\b/, text: 'RPE = wie anstrengend es sich angefühlt hat (1 = ganz leicht, 10 = maximal)', ok: /angefühlt|Anstrengung/ },
  { term: 'LTHR', re: /\bLTHR\b/, text: 'LTHR = dein Schwellenpuls', ok: /Schwellenpuls/ }
];
/* Begriffe im Text, die nicht erklärt sind */
export function unexplained(text: string): string[] {
  const t = String(text || '');
  return JARGON.filter(j => j.re.test(t) && !(j.ok && j.ok.test(t))).map(j => j.term);
}
/* Erklär-Zeile für die Begriffe eines Textes (leer, wenn nichts zu erklären ist) */
export function termsLine(text: string): string {
  const miss = JARGON.filter(j => j.re.test(text) && !(j.ok && j.ok.test(text)));
  return miss.length ? 'Begriffe: ' + miss.map(j => j.text).join('; ') + '.' : '';
}
/* Text mit Erklär-Zeile am Ende (für Coach-Nachrichten und Antworten) */
export function withTerms(text: string): string {
  const t = String(text || ''); const line = termsLine(t);
  return line && !t.includes('Begriffe: ') ? `${t}\n\n${line}` : t;
}
