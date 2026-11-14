/**
 * Calls GET /api/seed once the app is already running.
 * Usage (with server up on port 3000):  npm run seed
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const port = process.env.PORT || 3000;
const secret = process.env.SEED_SECRET || '';
if (process.env.NODE_ENV === 'production') {
  console.error('Legacy destructive seeding is disabled in production.');
  process.exit(1);
}
if (process.env.DEMO_MODE === 'true' || process.env.ALLOW_DB_SEED !== 'true' || !secret) {
  console.error('Legacy destructive seeding is disabled. It requires a non-production environment, ALLOW_DB_SEED=true, and a dedicated SEED_SECRET.');
  process.exit(1);
}

const headers = { Accept: 'application/json' };
if (secret) headers['x-seed-secret'] = secret;

const req = http.get(
  {
    hostname: '127.0.0.1',
    port,
    path: '/api/seed',
    headers,
  },
  (res) => {
    let body = '';
    res.on('data', (chunk) => {
      body += chunk;
    });
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        console.log(JSON.stringify(json, null, 2));
        process.exit(json.success ? 0 : 1);
      } catch {
        console.log(body);
        process.exit(res.statusCode >= 400 ? 1 : 0);
      }
    });
  }
);

req.on('error', (err) => {
  console.error('Could not reach the app. Start it first with: npm run dev');
  console.error(err.message);
  process.exit(1);
});
