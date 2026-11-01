/* Verweise auf das Neuzeichnen, damit Module ohne Kreis-Import rendern können. main.ts setzt sie.
   refresh (Auftrag 26): Aktualisierung aus dem Hintergrund (Sync, Konto, Verbindungen). Mehrere Anfragen im selben Moment
   werden zu einem Neuzeichnen im nächsten Bild zusammengefasst; während einer Eingabe wartet es, bis das Feld verlassen wird. */
export const nav = {
  render: () => {},
  rerender: () => {},
  refresh: () => {},
  go: (_view: string, _scroll?: string | null) => {}
};
