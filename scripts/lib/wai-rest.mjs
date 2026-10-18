// REST-Zugang zu Workers AI für Tests (Token aus der Wrangler-Anmeldung, wird nie ausgegeben)
import fs from 'node:fs';
const cfg = fs.readFileSync(process.env.APPDATA + '/xdg.config/.wrangler/config/default.toml', 'utf8');
const TOKEN = /oauth_token\s*=\s*"([^"]+)"/.exec(cfg)[1];
export const ACCOUNT = '6ef4583a07efb0035dfcf081303d29e1';
export async function run(model, input) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${model}`, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (input.stream) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300)); return r.body; }
  const j = await r.json();
  if (!j.success) throw new Error('HTTP ' + r.status + ' ' + JSON.stringify(j.errors).slice(0, 300));
  return j.result;
}
export const AI = { run };
