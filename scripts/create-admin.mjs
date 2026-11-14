import { createInterface } from 'node:readline';
import { loadEnvConfig } from '@next/env';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

loadEnvConfig(process.cwd());

function ask(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

function askSecret(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('A TTY is required to safely enter a hidden password.');
  }
  return new Promise((resolve, reject) => {
    process.stdout.write(prompt);
    let value = '';
    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          process.stdin.off('data', onData);
          process.stdin.setRawMode(false);
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          process.stdin.off('data', onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else if (char >= ' ') {
          value += char;
        }
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function main() {
  if (process.env.DEMO_MODE === 'true') {
    throw new Error('Refusing to create an administrator while demo mode is enabled.');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('Set MONGODB_URI for the intended application database.');
  }
  const name = await ask('Administrator name: ');
  const email = (await ask('Administrator email: ')).toLowerCase();
  const password = await askSecret('Administrator password (hidden): ');
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    throw new Error('Name, valid email, and a password of at least 12 characters are required.');
  }

  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const { default: User } = await import('../src/lib/models/User.js');
  const { default: AccountAudit } = await import('../src/lib/models/AccountAudit.js');
  if (await User.exists({ email })) {
    throw new Error('That email already belongs to an account. Existing accounts are never promoted or reset.');
  }
  const admin = await User.create({
    name,
    email,
    role: 'ADMIN',
    wing: 'ALL',
    password: await bcrypt.hash(password, 12),
    active: true,
    authVersion: 0,
    needsPasswordChange: false,
  });
  await AccountAudit.create({
    actor: admin._id,
    target: admin._id,
    action: 'ACCOUNT_CREATED',
  });
  console.log(`Administrator created for ${email}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
