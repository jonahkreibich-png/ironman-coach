/* Verweise auf das Neuzeichnen, damit Module ohne Kreis-Import rendern können. main.ts setzt sie. */
export const nav = {
  render: () => {},
  rerender: () => {},
  go: (_view: string, _scroll?: string | null) => {}
};
