/**
 * Quick MongoDB connectivity check for local demo setup.
 * Usage: node scripts/check-db.js
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('Missing .env.local — copy from .env.example first.');
    process.exit(1);
  }
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

async function main() {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in .env.local');
    process.exit(1);
  }
  console.log('Connecting to MongoDB…');
  await mongoose.connect(uri);
  const cols = await mongoose.connection.db.listCollections().toArray();
  const names = cols.map((c) => c.name);
  console.log('DB OK');
  console.log(
    'Collections:',
    names.length ? names.join(', ') : '(empty — run seed after starting the app)'
  );
  const userCount = names.includes('users')
    ? await mongoose.connection.db.collection('users').countDocuments()
    : 0;
  console.log('Users:', userCount);
  if (userCount === 0) {
    console.log('Tip: start the app, then open http://localhost:3000/api/seed once.');
  }
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('DB FAIL:', err.message);
  process.exit(1);
});
