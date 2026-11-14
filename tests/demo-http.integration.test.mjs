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
    assert.equal(process.env.DEMO_MODE, 'true');
    assert.equal(process.env.NEXT_PUBLIC_DEMO_MODE, 'true');
    assert.equal(process.env.DEMO_MONGODB_URI, demoUri);
    assert.equal(process.env.MONGODB_URI, realUri);
    assert.ok(['127.0.0.1', 'localhost', '::1'].includes(new URL(demoUri).hostname));
    assert.ok(['127.0.0.1', 'localhost', '::1'].includes(new URL(realUri).hostname));

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
      { default: Dish },
      { default: WeeklyMenu },
      { default: WeeklyMenuInitialization },
    ] = await Promise.all([
      import('../src/lib/models/User.js'),
      import('../src/lib/models/AccountAudit.js'),
      import('../src/lib/models/AccountSetupToken.js'),
      import('../src/lib/models/RateLimitBucket.js'),
      import('../src/lib/models/Dish.js'),
      import('../src/lib/models/WeeklyMenu.js'),
      import('../src/lib/models/WeeklyMenuInitialization.js'),
    ]);

    const prefix = `demo-http-test-${randomBytes(8).toString('hex')}`;
    const userIds = [];
    let testDishId;
    let ownsDishCatalog = false;
    const weekStartDate = new Date('2026-07-13T00:00:00.000Z');
    try {
      assert.equal(await User.countDocuments({}), 0, 'Use a fresh isolated demo test database.');
      assert.equal(await WeeklyMenu.countDocuments({}), 0);
      assert.equal(await Dish.countDocuments({}), 0);
      ownsDishCatalog = true;
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

      const testDish = await Dish.create({
        name: `${prefix} single catalog dish`,
        category: 'LUNCH',
      });
      testDishId = testDish._id;

      const readDate = '2026-07-18';
      const menuCountsBeforeReads = {
        menus: await WeeklyMenu.countDocuments({}),
        dishes: await Dish.countDocuments({}),
        locks: await WeeklyMenuInitialization.countDocuments({}),
      };
      const emptyMenu = await api(`/api/menu?date=${readDate}`);
      const emptyRatings = await api(`/api/vote?date=${readDate}`);
      const unauthenticatedHistory = await api('/api/vote/history');
      assert.equal(emptyMenu.status, 200);
      assert.deepEqual(emptyMenu.data.menu, []);
      assert.equal(emptyRatings.status, 200);
      assert.deepEqual(emptyRatings.data.menu, []);
      assert.equal(unauthenticatedHistory.status, 401);
      assert.deepEqual(
        {
          menus: await WeeklyMenu.countDocuments({}),
          dishes: await Dish.countDocuments({}),
          locks: await WeeklyMenuInitialization.countDocuments({}),
        },
        menuCountsBeforeReads,
        'Unauthenticated reads must not create menu data or initialization locks.'
      );

      const initialized = await api('/api/admin/generate-menu', {
        cookie: adminCookie,
        method: 'POST',
        body: { action: 'initialize', weekStartDate: '2026-07-13' },
      });
      assert.equal(initialized.status, 200);
      assert.equal(initialized.data.initialized, true);
      await WeeklyMenu.updateMany({ weekStartDate }, { $set: { dish: testDishId } });
      const publishedMenuBeforeReads = await WeeklyMenu.find({
        weekStartDate,
      }).sort({ dayOfWeek: 1, mealType: 1 }).lean();
      assert.equal(publishedMenuBeforeReads.length, 28);
      assert.equal(new Set(publishedMenuBeforeReads.map((row) => row.dish.toString())).size, 1);

      const repeatedInitialization = await api('/api/admin/generate-menu', {
        cookie: adminCookie,
        method: 'POST',
        body: { action: 'initialize', weekStartDate: '2026-07-13' },
      });
      assert.equal(repeatedInitialization.status, 200);
      assert.equal(repeatedInitialization.data.initialized, false);

      const visibleMenu = await api(`/api/menu?date=${readDate}`, {
        cookie: studentCookie,
      });
      const visibleRatings = await api(`/api/vote?date=${readDate}`, {
        cookie: studentCookie,
      });
      const visibleHistory = await api('/api/vote/history', {
        cookie: studentCookie,
      });
      assert.equal(visibleMenu.data.menu.length, 4);
      assert.equal(visibleRatings.data.menu.length, 4);
      assert.equal(visibleHistory.data.history.length, 28);
      assert.deepEqual(
        await WeeklyMenu.find({ weekStartDate }).sort({ dayOfWeek: 1, mealType: 1 }).lean(),
        publishedMenuBeforeReads,
        'Menu, ratings, and history reads must preserve the published menu.'
      );

      const listed = await api('/api/admin/wardens', { cookie: adminCookie });
      assert.equal(listed.status, 200);
      assert.ok(listed.data.wardens.some((warden) => warden.id === accounts[1]._id.toString()));

      const protectedWardenBefore = await User.findById(accounts[1]._id).lean();
      for (const action of [
        'deactivate',
        'activate',
        'change-wing',
        'issue-setup',
        'change-role',
      ]) {
        const protectedAction = await api('/api/admin/wardens', {
          cookie: adminCookie,
          method: 'PATCH',
          body: {
            wardenId: accounts[1]._id.toString(),
            action,
            wing: 'B-Wing',
            role: 'STUDENT',
          },
        });
        assert.equal(protectedAction.status, 403);
      }
      const protectedWardenAfter = await User.findById(accounts[1]._id).lean();
      for (const field of ['role', 'wing', 'active', 'password', 'authVersion']) {
        assert.equal(protectedWardenAfter[field], protectedWardenBefore[field]);
      }

      const protectedStudentBefore = await User.findById(accounts[2]._id).lean();
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
      const protectedStudentAfter = await User.findById(accounts[2]._id).lean();
      for (const field of ['role', 'wing', 'active', 'password', 'authVersion']) {
        assert.equal(protectedStudentAfter[field], protectedStudentBefore[field]);
      }

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
          WeeklyMenu.deleteMany({ weekStartDate }),
          WeeklyMenuInitialization.deleteMany({ _id: '2026-07-13' }),
        ]);
      }
      if (ownsDishCatalog) await Dish.deleteMany({});
      else if (testDishId) await Dish.deleteOne({ _id: testDishId });
      await RateLimitBucket.deleteMany({});
      await mongoose.disconnect();
    }
  }
);
