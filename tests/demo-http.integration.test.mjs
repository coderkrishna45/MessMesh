import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { sameDatabase, safeDemoDatabase } from '../src/lib/accessPolicy.js';

const demoUri = process.env.TEST_DEMO_MONGODB_URI;
const realUri = process.env.TEST_REAL_MONGODB_URI;
const appUrl = process.env.TEST_HTTP_BASE_URL;

function cookiesFrom(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get('set-cookie');
  return raw ? raw.split(/,\s*(?=[^;,]+=)/) : [];
}

function sessionCookie(response) {
  return cookiesFrom(response)
    .map((cookie) => cookie.split(';', 1)[0])
    .find((cookie) => /^(?:__Secure-)?next-auth\.session-token=/.test(cookie));
}

async function loginDemo(role) {
  const csrfResponse = await fetch(new URL('/api/auth/csrf', appUrl));
  const csrf = await csrfResponse.json();
  const csrfCookies = cookiesFrom(csrfResponse)
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ');
  const response = await fetch(new URL('/api/auth/callback/credentials', appUrl), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Cookie: csrfCookies,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email: '',
      password: '',
      demoRole: role,
      callbackUrl: appUrl,
      json: 'true',
    }),
  });
  const cookie = sessionCookie(response);
  assert.ok(cookie, `${role} demo login did not issue a session`);
  const sessionResponse = await fetch(new URL('/api/auth/session', appUrl), {
    headers: { Cookie: cookie },
  });
  const session = await sessionResponse.json();
  assert.equal(session?.user?.role, role);
  assert.equal(session?.user?.isDemoAccount, true);
  return cookie;
}

async function api(path, { cookie, method = 'GET', body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(new URL(path, appUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

test(
  'demo login selects only the dedicated demo database and protects demo entry accounts',
  { skip: !demoUri || !realUri || !appUrl },
  async () => {
    const demoName = new URL(demoUri).pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
    const realName = new URL(realUri).pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
    assert.match(demoName, /demo/i);
    assert.match(demoName, /test/i);
    assert.match(realName, /test/i);
    assert.notEqual(demoName, realName);
    assert.equal(sameDatabase(demoUri, realUri), false);
    assert.equal(
      safeDemoDatabase({
        DEMO_MODE: 'true',
        NEXT_PUBLIC_DEMO_MODE: 'true',
        DEMO_MONGODB_URI: demoUri,
        MONGODB_URI: realUri,
        REAL_DATABASE_NAME: realName,
      }),
      true
    );
    assert.equal(
      safeDemoDatabase({
        DEMO_MODE: 'true',
        NEXT_PUBLIC_DEMO_MODE: 'true',
        DEMO_MONGODB_URI: realUri,
        MONGODB_URI: realUri,
        REAL_DATABASE_NAME: realName,
      }),
      false
    );

    await mongoose.connect(demoUri, { bufferCommands: false });
    const [
      { default: User },
      { default: AccountAudit },
      { default: AccountSetupToken },
      { default: RateLimitBucket },
    ] = await Promise.all([
      import('../src/lib/models/User.js'),
      import('../src/lib/models/AccountAudit.js'),
      import('../src/lib/models/AccountSetupToken.js'),
      import('../src/lib/models/RateLimitBucket.js'),
    ]);

    const prefix = `demo-http-test-${randomBytes(8).toString('hex')}`;
    const userIds = [];
    try {
      assert.equal(await User.countDocuments({}), 0, 'Use a fresh isolated demo test database.');
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 10);
      const accounts = await User.create([
        {
          name: 'Fictional Test Demo Admin',
          email: `${prefix}-admin@example.invalid`,
          password: passwordHash,
          role: 'ADMIN',
          wing: 'ALL',
          isDemoAccount: true,
          isDemoData: true,
        },
        {
          name: 'Fictional Test Demo Warden',
          email: `${prefix}-warden@example.invalid`,
          password: passwordHash,
          role: 'WARDEN',
          wing: 'A-Wing',
          isDemoAccount: true,
          isDemoData: true,
        },
        {
          name: 'Fictional Test Demo Student',
          email: `${prefix}-student@example.invalid`,
          password: passwordHash,
          role: 'STUDENT',
          wing: 'A-Wing',
          rollNumber: `${prefix}-student`,
          isDemoAccount: true,
          isDemoData: true,
        },
      ]);
      userIds.push(...accounts.map((account) => account._id));

      const adminCookie = await loginDemo('ADMIN');
      const wardenCookie = await loginDemo('WARDEN');
      const studentCookie = await loginDemo('STUDENT');
      const status = await api('/api/demo/status');
      assert.equal(status.status, 200);
      assert.equal(status.data.enabled, true);

      const listed = await api('/api/admin/wardens', { cookie: adminCookie });
      assert.equal(listed.status, 200);
      assert.ok(listed.data.wardens.some((warden) => warden.id === accounts[1]._id.toString()));

      for (const action of ['deactivate', 'issue-setup']) {
        const protectedAction = await api('/api/admin/wardens', {
          cookie: adminCookie,
          method: 'PATCH',
          body: { wardenId: accounts[1]._id.toString(), action },
        });
        assert.equal(protectedAction.status, 403);
      }

      const protectedReset = await api('/api/warden/reset-password', {
        cookie: wardenCookie,
        method: 'POST',
        body: { studentId: accounts[2]._id.toString() },
      });
      assert.equal(protectedReset.status, 403);
      const protectedChange = await api('/api/student/change-password', {
        cookie: studentCookie,
        method: 'POST',
        body: { newPassword: 'a-different-test-password' },
      });
      assert.equal(protectedChange.status, 403);

      const invited = await api('/api/admin/wardens', {
        cookie: adminCookie,
        method: 'POST',
        body: {
          name: 'Fictional Test Invited Warden',
          email: `${prefix}-invited@example.invalid`,
          wing: 'B-Wing',
        },
      });
      assert.equal(invited.status, 201);
      assert.equal(invited.data.invitation.status, 'preview');
      assert.match(invited.data.message, /no email was sent/i);
      userIds.push(new mongoose.Types.ObjectId(invited.data.warden.id));
    } finally {
      if (userIds.length) {
        await Promise.all([
          AccountSetupToken.deleteMany({ user: { $in: userIds } }),
          AccountAudit.deleteMany({
            $or: [{ actor: { $in: userIds } }, { target: { $in: userIds } }],
          }),
          User.deleteMany({ _id: { $in: userIds } }),
        ]);
      }
      await RateLimitBucket.deleteMany({});
      await mongoose.disconnect();
    }
  }
);
