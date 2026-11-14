import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { getToken } from 'next-auth/jwt';
import Papa from 'papaparse';
import { io as createSocket } from 'socket.io-client';
import { DISHES_CATALOG } from '../src/lib/dishesCatalog.js';

const databaseUri = process.env.TEST_MONGODB_URI;
const appUrl = process.env.TEST_HTTP_BASE_URL;

function cookiesFrom(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get('set-cookie');
  return raw ? raw.split(/,\s*(?=[^;,]+=)/) : [];
}

function cookiePair(response, expression) {
  return cookiesFrom(response)
    .map((cookie) => cookie.split(';', 1)[0])
    .find((cookie) => expression.test(cookie));
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return [];
      return [
        [
          part.slice(0, separator).trim(),
          decodeURIComponent(part.slice(separator + 1).trim()),
        ],
      ];
    })
  );
}

async function credentialsRequest(email, password, extra = {}) {
  const csrfResponse = await fetch(new URL('/api/auth/csrf', appUrl));
  assert.equal(csrfResponse.status, 200);
  const csrf = await csrfResponse.json();
  const csrfCookies = cookiesFrom(csrfResponse)
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ');
  const form = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    callbackUrl: appUrl,
    json: 'true',
    ...extra,
  });
  return fetch(new URL('/api/auth/callback/credentials', appUrl), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Cookie: csrfCookies,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
}

async function signIn(email, password) {
  const response = await credentialsRequest(email, password);
  const cookie = cookiePair(
    response,
    /^(?:__Secure-)?next-auth\.session-token=/
  );
  assert.ok(cookie, `credentials login failed for ${email}: ${response.status}`);
  const sessionResponse = await fetch(new URL('/api/auth/session', appUrl), {
    headers: { Cookie: cookie },
  });
  const session = await sessionResponse.json();
  assert.ok(session?.user?.id, `no session was issued for ${email}`);
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

async function changePassword(cookie, newPassword) {
  return api('/api/student/change-password', {
    cookie,
    method: 'POST',
    body: { newPassword },
  });
}

async function connectSocket(cookie, role) {
  const socket = createSocket(appUrl, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000,
    extraHeaders: { Cookie: cookie },
  });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', (error) =>
      reject(new Error(`${role} socket connection rejected: ${error.message}`))
    );
  });
  return socket;
}

async function waitFor(predicate, message, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.fail(message);
}

test(
  'HTTP account workflows, wing isolation, session invalidation, and authenticated socket events',
  { skip: !databaseUri || !appUrl },
  async () => {
    const databaseName = new URL(databaseUri).pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')[0];
    assert.match(databaseName, /test/i, 'TEST_MONGODB_URI must use a test-named database');
    assert.notEqual(process.env.DEMO_MODE, 'true', 'Run this workflow with DEMO_MODE=false.');

    await mongoose.connect(databaseUri, { bufferCommands: false });
    const [
      { default: User },
      { default: Dish },
      { default: SystemState },
      { default: WeeklyMenu },
      { default: MealRating },
      { default: WasteLog },
      { default: AccountAudit },
      { default: AccountSetupToken },
    ] = await Promise.all([
      import('../src/lib/models/User.js'),
      import('../src/lib/models/Dish.js'),
      import('../src/lib/models/SystemState.js'),
      import('../src/lib/models/WeeklyMenu.js'),
      import('../src/lib/models/MealRating.js'),
      import('../src/lib/models/WasteLog.js'),
      import('../src/lib/models/AccountAudit.js'),
      import('../src/lib/models/AccountSetupToken.js'),
    ]);

    const runId = randomBytes(8).toString('hex');
    const prefix = `http-test-${runId}`;
    const password = `Test-${randomBytes(18).toString('base64url')}`;
    const secondPassword = `Test-${randomBytes(18).toString('base64url')}`;
    const testDate = new Date('2026-11-14T00:00:00.000Z');
    const weekStart = new Date('2026-11-09T00:00:00.000Z');
    const userIds = [];
    const sockets = [];
    let systemStateId;

    const rememberUser = (id) => {
      if (id) userIds.push(new mongoose.Types.ObjectId(id));
    };

    try {
      assert.equal(await User.countDocuments({}), 0, 'Use a fresh isolated test database.');
      assert.equal(await Dish.countDocuments({}), 0, 'Use a fresh isolated test database.');

      const passwordHash = await bcrypt.hash(password, 10);
      const [admin, wardenB] = await User.create([
        {
          name: 'Fictional Test Admin',
          email: `${prefix}-admin@example.invalid`,
          password: passwordHash,
          role: 'ADMIN',
          wing: 'ALL',
        },
        {
          name: 'Fictional Test Warden B',
          email: `${prefix}-warden-b@example.invalid`,
          password: passwordHash,
          role: 'WARDEN',
          wing: 'B-Wing',
        },
      ]);
      rememberUser(admin._id);
      rememberUser(wardenB._id);
      const systemState = await SystemState.create({ simulatedDate: testDate });
      systemStateId = systemState._id;

      const unauthenticated = await api('/api/admin/wardens');
      assert.equal(unauthenticated.status, 401, 'unauthenticated management calls must be 401');

      const adminCookie = await signIn(admin.email, password);
      const adminSocketToken = await getToken({
        req: {
          headers: { cookie: adminCookie },
          cookies: parseCookies(adminCookie),
        },
        secret: process.env.NEXTAUTH_SECRET,
        secureCookie: false,
      });
      assert.equal(adminSocketToken?.id, admin._id.toString());
      const disabledDemoAttempt = await credentialsRequest('demo', 'demo', {
        demoRole: 'ADMIN',
      });
      assert.equal(
        cookiePair(disabledDemoAttempt, /^(?:__Secure-)?next-auth\.session-token=/),
        undefined,
        'demo-role login must not issue a session outside demo mode'
      );
      assert.equal((await api('/api/admin/stats', { cookie: adminCookie })).status, 200);

      const invited = await api('/api/admin/wardens', {
        cookie: adminCookie,
        method: 'POST',
        body: {
          name: 'Fictional Test Warden A',
          email: `${prefix}-warden-a@example.invalid`,
          wing: 'A-Wing',
        },
      });
      assert.equal(invited.status, 201);
      assert.equal(invited.data.invitation.status, 'preview');
      const wardenAId = invited.data.warden.id;
      rememberUser(wardenAId);
      const setupUrl = new URL(invited.data.invitation.setupUrl);
      const rawSetupToken = setupUrl.searchParams.get('token');
      assert.ok(rawSetupToken);
      const storedSetupToken = await AccountSetupToken.findOne({ user: wardenAId });
      assert.equal(
        storedSetupToken.tokenHash,
        createHash('sha256').update(rawSetupToken).digest('hex')
      );
      assert.notEqual(storedSetupToken.tokenHash, rawSetupToken);

      const expiredRawToken = `expired-${runId}`;
      await AccountSetupToken.create({
        user: wardenAId,
        purpose: 'INVITATION',
        tokenHash: createHash('sha256').update(expiredRawToken).digest('hex'),
        expiresAt: new Date(Date.now() - 1000),
      });
      const expiredSetup = await api('/api/auth/setup-token', {
        method: 'POST',
        body: { token: expiredRawToken, password: secondPassword },
      });
      assert.equal(expiredSetup.status, 400);

      const wardenPassword = `Warden-${randomBytes(18).toString('base64url')}`;
      const setupResult = await api('/api/auth/setup-token', {
        method: 'POST',
        body: { token: rawSetupToken, password: wardenPassword },
      });
      assert.equal(setupResult.status, 200);
      assert.equal(setupResult.data.reauthenticationRequired, true);
      const reusedSetup = await api('/api/auth/setup-token', {
        method: 'POST',
        body: { token: rawSetupToken, password: secondPassword },
      });
      assert.equal(reusedSetup.status, 400, 'a consumed setup token must not be reusable');

      const wardenACookie = await signIn(`${prefix}-warden-a@example.invalid`, wardenPassword);
      const wardenBCookie = await signIn(wardenB.email, password);
      assert.equal((await api('/api/admin/wardens', { cookie: wardenACookie })).status, 403);
      assert.equal((await api('/api/warden/students', { cookie: adminCookie })).status, 200);

      const manuallyCreated = await api('/api/warden/students', {
        cookie: wardenACookie,
        method: 'POST',
        body: {
          students: {
            name: 'Fictional Manual Student',
            rollNumber: `${prefix}-manual`,
            wing: 'A-Wing',
          },
        },
      });
      assert.equal(manuallyCreated.status, 200);
      assert.equal(manuallyCreated.data.successCount, 1);
      const studentA = manuallyCreated.data.registered[0];
      rememberUser(studentA.id);

      const parsedCsv = Papa.parse(
        [
          'rollNumber,name,wing,email,phone',
          `${prefix}-csv,Fictional CSV Student,A-Wing,,`,
          `${prefix}-csv,Fictional Duplicate Student,A-Wing,,`,
        ].join('\n'),
        { header: true, skipEmptyLines: true }
      ).data;
      const imported = await api('/api/warden/students', {
        cookie: wardenACookie,
        method: 'POST',
        body: { students: parsedCsv },
      });
      assert.equal(imported.status, 200);
      assert.equal(imported.data.successCount, 1);
      assert.equal(imported.data.failCount, 1);
      rememberUser(imported.data.registered[0].id);

      const studentBResult = await api('/api/warden/students', {
        cookie: wardenBCookie,
        method: 'POST',
        body: {
          students: {
            name: 'Fictional Student B',
            rollNumber: `${prefix}-student-b`,
            wing: 'B-Wing',
          },
        },
      });
      assert.equal(studentBResult.status, 200);
      const studentB = studentBResult.data.registered[0];
      rememberUser(studentB.id);

      assert.equal(
        (await api('/api/warden/students?wing=B-Wing', { cookie: wardenACookie })).status,
        403
      );
      for (const students of [
        [{ name: 'Cross Wing', rollNumber: `${prefix}-cross`, wing: 'B-Wing' }],
        [{ name: 'CSV Cross Wing', rollNumber: `${prefix}-csv-cross`, wing: 'B-Wing' }],
      ]) {
        assert.equal(
          (
            await api('/api/warden/students', {
              cookie: wardenACookie,
              method: 'POST',
              body: { students },
            })
          ).status,
          403
        );
      }
      assert.equal(
        (
          await api('/api/warden/reset-password', {
            cookie: wardenACookie,
            method: 'POST',
            body: { studentId: studentB.id },
          })
        ).status,
        403
      );
      const adminStudentList = await api('/api/warden/students', { cookie: adminCookie });
      assert.equal(adminStudentList.status, 200);
      assert.ok(adminStudentList.data.students.length >= 3);

      const studentCookie = await signIn(studentA.username, studentA.password);
      assert.equal((await api('/api/vote/history', { cookie: studentCookie })).status, 403);
      await fetch(new URL('/api/auth/session', appUrl), {
        method: 'POST',
        headers: {
          Cookie: studentCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ needsPasswordChange: false }),
      });
      assert.equal((await api('/api/vote/history', { cookie: studentCookie })).status, 403);
      const changed = await changePassword(studentCookie, secondPassword);
      assert.equal(changed.status, 200);
      assert.equal((await api('/api/vote/history', { cookie: studentCookie })).status, 401);
      const studentSession = await signIn(studentA.username, secondPassword);

      const menu = await api(`/api/menu?date=${testDate.toISOString().slice(0, 10)}`, {
        cookie: studentSession,
      });
      assert.equal(menu.status, 200);
      assert.equal(menu.data.resolvedWing, 'A-Wing');
      assert.ok(menu.data.menu.length > 0);
      const history = await api('/api/vote/history', { cookie: studentSession });
      assert.equal(history.status, 200);
      assert.equal(history.data.history.length, 28);
      assert.equal((await api('/api/vote/weekly-contest', { cookie: studentSession })).status, 200);
      assert.equal((await api('/api/leaderboard')).status, 200);

      const firstDish = menu.data.menu[0].dish._id;
      const rating = await api('/api/vote', {
        cookie: studentSession,
        method: 'POST',
        body: { dishId: firstDish, rating: 5, date: testDate.toISOString() },
      });
      assert.equal(rating.status, 200);
      const waste = await api('/api/waste', {
        cookie: studentSession,
        method: 'POST',
        body: { dishId: firstDish, wasteLevel: 5 },
      });
      assert.equal(waste.status, 200);
      assert.ok(await MealRating.exists({ user: studentA.id, dish: firstDish }));
      assert.ok(await WasteLog.exists({ user: studentA.id, dish: firstDish }));

      const wardenStats = await api('/api/admin/stats', { cookie: wardenACookie });
      assert.equal(wardenStats.status, 200);
      assert.equal(wardenStats.data.scope, 'A-Wing');

      const noCookieSocket = createSocket(appUrl, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
      });
      sockets.push(noCookieSocket);
      const socketError = await new Promise((resolve, reject) => {
        noCookieSocket.once('connect_error', resolve);
        noCookieSocket.once('connect', () => reject(new Error('Unauthenticated socket connected.')));
        setTimeout(() => reject(new Error('Unauthenticated socket was not rejected.')), 6000);
      });
      assert.match(socketError.message, /Authentication required/);

      const adminSocket = await connectSocket(adminCookie, 'Admin');
      const wardenASocket = await connectSocket(wardenACookie, 'Warden A');
      const wardenBSocket = await connectSocket(wardenBCookie, 'Warden B');
      const studentSocket = await connectSocket(studentSession, 'Student');
      const authenticatedSockets = [
        adminSocket,
        wardenASocket,
        wardenBSocket,
        studentSocket,
      ];
      sockets.push(...authenticatedSockets);
      const received = new Map();
      for (const [socket, key] of [
        [adminSocket, 'admin'],
        [wardenASocket, 'wardenA'],
        [wardenBSocket, 'wardenB'],
        [studentSocket, 'student'],
      ]) {
        received.set(key, { waste: [], rating: [], feast: [] });
        socket.on('high-waste-logged', (event) => received.get(key).waste.push(event));
        socket.on('rate-updated', (event) => received.get(key).rating.push(event));
        socket.on('feast-unlocked', (event) => received.get(key).feast.push(event));
      }

      await waitFor(() => [...received.keys()].length === 4, 'sockets did not initialize');
      await waitFor(
        () => authenticatedSockets.every((socket) => socket.connected),
        'socket auth failed'
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(received.get('wardenA').waste.length, 0);

      const secondWaste = await api('/api/waste', {
        cookie: studentSession,
        method: 'POST',
        body: { dishId: firstDish, wasteLevel: 4 },
      });
      assert.equal(secondWaste.status, 200);
      await waitFor(
        () => received.get('wardenA').waste.length === 1,
        'assigned-wing Warden did not receive high-waste notification'
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(received.get('wardenB').waste.length, 0);
      assert.equal(received.get('student').waste.length, 0);

      await api('/api/vote', {
        cookie: studentSession,
        method: 'POST',
        body: { dishId: firstDish, rating: 4, date: testDate.toISOString() },
      });
      await waitFor(
        () => [...received.values()].every((events) => events.rating.length === 1),
        'rating update was not broadcast to authenticated sockets'
      );

      await User.updateMany(
        { _id: { $in: [studentA.id, imported.data.registered[0].id] } },
        { $set: { cleanPlateScore: 95 } }
      );
      const feast = await api('/api/admin/unlock-premium', {
        cookie: wardenACookie,
        method: 'POST',
        body: {},
      });
      assert.equal(feast.status, 200);
      await waitFor(
        () =>
          received.get('wardenA').feast.length === 1 &&
          received.get('student').feast.length === 1,
        'feast event did not reach the assigned wing'
      );
      assert.equal(received.get('wardenB').feast.length, 0);
      assert.equal(received.get('admin').feast.length, 0);

      const reset = await api('/api/warden/reset-password', {
        cookie: wardenACookie,
        method: 'POST',
        body: { studentId: studentA.id },
      });
      assert.equal(reset.status, 200);
      assert.equal((await api('/api/vote/history', { cookie: studentSession })).status, 401);
      const resetSession = await signIn(studentA.username, reset.data.password);
      assert.equal((await api('/api/vote/history', { cookie: resetSession })).status, 403);
      assert.equal((await changePassword(resetSession, password)).status, 200);
      assert.equal((await api('/api/vote/history', { cookie: resetSession })).status, 401);

      for (const action of ['deactivate', 'activate']) {
        const result = await api('/api/admin/wardens', {
          cookie: adminCookie,
          method: 'PATCH',
          body: { wardenId: wardenAId, action },
        });
        assert.equal(result.status, 200);
        assert.equal((await api('/api/warden/students', { cookie: wardenACookie })).status, 401);
      }
      const wingChange = await api('/api/admin/wardens', {
        cookie: adminCookie,
        method: 'PATCH',
        body: { wardenId: wardenAId, action: 'change-wing', wing: 'C-Wing' },
      });
      assert.equal(wingChange.status, 200);
      assert.equal((await api('/api/warden/students', { cookie: wardenACookie })).status, 401);
      const currentWardenCookie = await signIn(
        `${prefix}-warden-a@example.invalid`,
        wardenPassword
      );
      const ownWing = await api('/api/warden/students', { cookie: currentWardenCookie });
      assert.equal(ownWing.status, 200);
      assert.ok(ownWing.data.students.every((student) => student.wing === 'C-Wing'));
      assert.equal(
        (await api('/api/warden/students?wing=A-Wing', { cookie: currentWardenCookie })).status,
        403
      );

      const wardenSetup = await api('/api/admin/wardens', {
        cookie: adminCookie,
        method: 'PATCH',
        body: { wardenId: wardenAId, action: 'issue-setup' },
      });
      assert.equal(wardenSetup.status, 200);
      assert.equal(
        (await api('/api/warden/students', { cookie: currentWardenCookie })).status,
        401
      );
      const replacementPassword = `Warden-${randomBytes(18).toString('base64url')}`;
      const replacementToken = new URL(wardenSetup.data.invitation.setupUrl)
        .searchParams.get('token');
      assert.equal(
        (
          await api('/api/auth/setup-token', {
            method: 'POST',
            body: { token: replacementToken, password: replacementPassword },
          })
        ).status,
        200
      );
      const newWardenSession = await signIn(
        `${prefix}-warden-a@example.invalid`,
        replacementPassword
      );
      assert.equal((await api('/api/warden/students', { cookie: newWardenSession })).status, 200);

      const wardenBRecord = await User.findById(wardenB._id);
      wardenBRecord.role = 'STUDENT';
      wardenBRecord.authVersion += 1;
      await wardenBRecord.save();
      assert.equal((await api('/api/warden/students', { cookie: wardenBCookie })).status, 401);
      const changedRoleSession = await signIn(wardenB.email, password);
      assert.equal((await api('/api/warden/students', { cookie: changedRoleSession })).status, 403);

      const auditEvents = await AccountAudit.countDocuments({
        target: { $in: userIds },
      });
      assert.ok(auditEvents >= 4, 'privileged account actions should be audited');
    } finally {
      for (const socket of sockets) socket.disconnect();
      if (userIds.length) {
        await Promise.all([
          AccountSetupToken.deleteMany({ user: { $in: userIds } }),
          AccountAudit.deleteMany({
            $or: [{ actor: { $in: userIds } }, { target: { $in: userIds } }],
          }),
          MealRating.deleteMany({ user: { $in: userIds } }),
          WasteLog.deleteMany({ user: { $in: userIds } }),
          User.deleteMany({ _id: { $in: userIds } }),
        ]);
      }
      if (systemStateId) await SystemState.deleteOne({ _id: systemStateId });
      await WeeklyMenu.deleteMany({ weekStartDate: weekStart });
      await Dish.deleteMany({ name: { $in: DISHES_CATALOG.map((dish) => dish.name) } });
      await mongoose.disconnect();
    }
  }
);
