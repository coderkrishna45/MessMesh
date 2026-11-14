import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { safeDemoDatabase } from '../src/lib/accessPolicy.js';

const demoUri = process.env.TEST_DEMO_MONGODB_URI;
const realUri = process.env.TEST_REAL_MONGODB_URI;
const appUrl = process.env.TEST_HTTP_BASE_URL;
const enabled = process.env.TEST_BROWSER === 'true' && Boolean(demoUri && realUri && appUrl);
const weekStartDate = new Date('2026-11-09T00:00:00.000Z');
const weekStartKey = '2026-11-09';

async function api(context, path, { method = 'GET', body } = {}) {
  const options = { method };
  if (body !== undefined) options.data = body;
  const response = await context.request.fetch(new URL(path, appUrl).toString(), options);
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status(), data };
}

async function signInDemo(page, role, expectedUserId) {
  await page.goto(new URL('/login', appUrl).toString());
  await page.getByRole('button', { name: `Explore as ${role[0]}${role.slice(1).toLowerCase()}` }).click();
  await page.waitForFunction(
    async ({ expectedRole, expectedUserId }) => {
      const session = await fetch('/api/auth/session').then((response) => response.json());
      return (
        session.user?.id === expectedUserId &&
        session.user?.role === expectedRole &&
        session.user?.isDemoAccount === true
      );
    },
    { expectedRole: role, expectedUserId },
    { timeout: 30_000 }
  );
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15_000 });
  const session = await page.evaluate(() =>
    fetch('/api/auth/session').then((response) => response.json())
  );
  assert.equal(session.user?.id, expectedUserId);
  assert.equal(new URL(page.url()).pathname === '/login', false);
  return session.user;
}

async function signInWarden(page, email, password, expectedUserId) {
  await page.goto(new URL('/login', appUrl).toString());
  await page.getByPlaceholder('name@messmesh.com or CS2023001').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForFunction(
    async (id) => {
      const session = await fetch('/api/auth/session').then((response) => response.json());
      return session.user?.id === id && session.user?.role === 'WARDEN';
    },
    expectedUserId,
    { timeout: 30_000 }
  );
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15_000 });
}

async function navigate(page, label, pathname) {
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await page.waitForURL((url) => url.pathname === pathname, { timeout: 15_000 });
}

async function advanceDate(page, expectedDate) {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/admin/simulate-date' &&
      response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Next Day ➔', exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  await page.waitForFunction(
    async (date) => {
      const response = await fetch('/api/admin/simulate-date');
      return (await response.json()).date === date;
    },
    expectedDate,
    { timeout: 15_000 }
  );
}

async function referenceDatabaseIsEmpty() {
  const connection = await mongoose.createConnection(realUri).asPromise();
  try {
    const collections = await connection.db.listCollections().toArray();
    const populatedCollections = [];
    for (const collection of collections) {
      if (await connection.db.collection(collection.name).countDocuments()) {
        populatedCollections.push(collection.name);
      }
    }
    assert.deepEqual(populatedCollections, []);
  } finally {
    await connection.close();
  }
}

test(
  'public demo browser workflows stay isolated and protect role-specific actions',
  { skip: !enabled, timeout: 240_000 },
  async () => {
    assert.equal(process.env.DEMO_MODE, 'true');
    assert.equal(process.env.NEXT_PUBLIC_DEMO_MODE, 'true');
    assert.equal(process.env.DEMO_MONGODB_URI, demoUri);
    assert.equal(process.env.MONGODB_URI, realUri);
    assert.equal(
      safeDemoDatabase({
        ...process.env,
        DEMO_MODE: 'true',
        NEXT_PUBLIC_DEMO_MODE: 'true',
        DEMO_MONGODB_URI: demoUri,
        MONGODB_URI: realUri,
        REAL_DATABASE_NAME: new URL(realUri).pathname.slice(1),
      }),
      true
    );
    assert.ok(['127.0.0.1', 'localhost', '::1'].includes(new URL(demoUri).hostname));
    assert.ok(['127.0.0.1', 'localhost', '::1'].includes(new URL(realUri).hostname));
    await referenceDatabaseIsEmpty();

    await mongoose.connect(demoUri, { bufferCommands: false });
    const [
      { default: User },
      { default: Dish },
      { default: MealRating },
      { default: WasteLog },
      { default: WeeklyMenu },
      { default: WeeklyMenuInitialization },
      { default: WeeklyScoreSnapshot },
      { default: WeeklyScoreState },
      { default: SystemState },
      { default: AccountAudit },
      { default: AccountSetupToken },
      { default: RateLimitBucket },
    ] = await Promise.all([
      import('../src/lib/models/User.js'),
      import('../src/lib/models/Dish.js'),
      import('../src/lib/models/MealRating.js'),
      import('../src/lib/models/WasteLog.js'),
      import('../src/lib/models/WeeklyMenu.js'),
      import('../src/lib/models/WeeklyMenuInitialization.js'),
      import('../src/lib/models/WeeklyScoreSnapshot.js'),
      import('../src/lib/models/WeeklyScoreState.js'),
      import('../src/lib/models/SystemState.js'),
      import('../src/lib/models/AccountAudit.js'),
      import('../src/lib/models/AccountSetupToken.js'),
      import('../src/lib/models/RateLimitBucket.js'),
    ]);

    let browser;
    const contexts = [];
    const userIds = [];
    let ownsCatalog = false;
    try {
      assert.equal(await User.countDocuments({}), 0, 'Use a fresh isolated demo test database.');
      assert.equal(await WeeklyMenu.countDocuments({}), 0);
      assert.equal(await Dish.countDocuments({}), 0);
      assert.equal(await SystemState.countDocuments({}), 0);
      ownsCatalog = true;

      const prefix = `demo-browser-${randomBytes(8).toString('hex')}`;
      const sharedPasswordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 10);
      const alternateWardenPassword = randomBytes(20).toString('base64url');
      const accounts = await User.create([
        {
          name: 'Fictional Test Demo Admin',
          email: `${prefix}-admin@example.invalid`,
          password: sharedPasswordHash,
          role: 'ADMIN',
          wing: 'ALL',
          isDemoAccount: true,
          isDemoData: true,
        },
        {
          name: 'Fictional Test Demo Warden',
          email: `${prefix}-warden@example.invalid`,
          password: sharedPasswordHash,
          role: 'WARDEN',
          wing: 'A-Wing',
          isDemoAccount: true,
          isDemoData: true,
        },
        {
          name: 'Fictional Test Demo Student',
          email: `${prefix}-student@example.invalid`,
          password: sharedPasswordHash,
          role: 'STUDENT',
          wing: 'A-Wing',
          rollNumber: `${prefix}-student`,
          isDemoAccount: true,
          isDemoData: true,
        },
        {
          name: 'Fictional Test B-Wing Warden',
          email: `${prefix}-b-warden@example.invalid`,
          password: await bcrypt.hash(alternateWardenPassword, 10),
          role: 'WARDEN',
          wing: 'B-Wing',
          isDemoData: true,
        },
        {
          name: 'Fictional Test B-Wing Student',
          email: `${prefix}-b-student@example.invalid`,
          password: sharedPasswordHash,
          role: 'STUDENT',
          wing: 'B-Wing',
          rollNumber: `${prefix}-b-student`,
          isDemoData: true,
        },
      ]);
      userIds.push(...accounts.map((account) => account._id));
      await SystemState.create({ simulatedDate: new Date('2026-11-14T00:00:00.000Z') });

      const emptyContext = await (browser = await chromium.launch({ headless: true })).newContext({
        viewport: { width: 1440, height: 1000 },
      });
      contexts.push(emptyContext);
      const preInitMenu = await api(emptyContext, '/api/menu?date=2026-11-14');
      const preInitRatings = await api(emptyContext, '/api/vote?date=2026-11-14');
      assert.deepEqual(preInitMenu.data.menu, []);
      assert.deepEqual(preInitRatings.data.menu, []);
      assert.equal(await WeeklyMenu.countDocuments({}), 0);
      assert.equal(await WeeklyMenuInitialization.countDocuments({}), 0);

      const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const wardenContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const studentContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const otherWardenContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      contexts.push(adminContext, wardenContext, studentContext, otherWardenContext);
      const adminPage = await adminContext.newPage();
      const wardenPage = await wardenContext.newPage();
      const studentPage = await studentContext.newPage();
      const otherWardenPage = await otherWardenContext.newPage();

      await signInDemo(adminPage, 'ADMIN', accounts[0]._id.toString());
      const adminSession = await adminPage.evaluate(() =>
        fetch('/api/auth/session').then((response) => response.json())
      );
      assert.equal(adminSession.user.role, 'ADMIN');
      await navigate(adminPage, 'Wardens', '/admin/wardens');
      await adminPage.getByText(/Fictional Test Demo Warden/).waitFor();

      const invitedEmail = `${prefix}-invited@example.invalid`;
      await adminPage.getByPlaceholder('Full name').fill('Fictional Test Invited Warden');
      await adminPage.getByPlaceholder('Email address').fill(invitedEmail);
      await adminPage.locator('form select').first().selectOption('B-Wing');
      await adminPage.getByRole('button', { name: 'Create & invite' }).click();
      await adminPage.getByText('Invitation preview — no email was sent').waitFor();
      await adminPage.getByText('Fictional demo account invitation.').waitFor();
      const invitedWarden = await User.findOne({ email: invitedEmail }).lean();
      assert.equal(invitedWarden.role, 'WARDEN');
      assert.equal(invitedWarden.wing, 'B-Wing');
      userIds.push(invitedWarden._id);
      const protectedWardenBefore = await User.findById(accounts[1]._id).lean();
      const demoWardenRow = adminPage
        .getByRole('row')
        .filter({ hasText: 'Fictional Test Demo Warden' });
      assert.equal(await demoWardenRow.locator('select').isDisabled(), true);
      assert.equal(await demoWardenRow.getByRole('button', { name: 'Deactivate' }).isDisabled(), true);
      assert.equal(
        await demoWardenRow.getByRole('button', { name: 'Issue setup/reset' }).isDisabled(),
        true
      );
      for (const action of ['deactivate', 'change-wing', 'issue-setup', 'change-role']) {
        const response = await api(adminContext, '/api/admin/wardens', {
          method: 'PATCH',
          body: {
            wardenId: accounts[1]._id.toString(),
            action,
            wing: 'B-Wing',
            role: 'STUDENT',
          },
        });
        assert.equal(response.status, 403);
      }
      const protectedWardenAfter = await User.findById(accounts[1]._id).lean();
      for (const field of ['role', 'wing', 'active', 'password', 'authVersion']) {
        assert.equal(protectedWardenAfter[field], protectedWardenBefore[field]);
      }
      const protectedEntryStudentBefore = await User.findById(accounts[2]._id).lean();
      for (const action of ['deactivate', 'change-wing', 'change-role']) {
        const response = await api(adminContext, '/api/admin/wardens', {
          method: 'PATCH',
          body: {
            wardenId: accounts[2]._id.toString(),
            action,
            wing: 'B-Wing',
            role: 'WARDEN',
          },
        });
        assert.equal(response.status, 404);
      }
      const protectedEntryStudentAfter = await User.findById(accounts[2]._id).lean();
      for (const field of ['role', 'wing', 'active', 'password', 'authVersion']) {
        assert.equal(protectedEntryStudentAfter[field], protectedEntryStudentBefore[field]);
      }
      await navigate(adminPage, 'Students', '/warden/manage-students');
      await navigate(adminPage, 'Analytics', '/admin');
      await adminPage.getByRole('heading', { name: 'Mess Curation & Analytics' }).waitFor();
      const [download] = await Promise.all([
        adminPage.waitForEvent('download', { timeout: 30_000 }),
        adminPage.getByRole('button', { name: 'Download Weekly Report' }).click(),
      ]);
      assert.match(download.suggestedFilename(), /\.pdf$/i);
      await navigate(adminPage, 'Leaderboard', '/leaderboard');

      await signInDemo(wardenPage, 'WARDEN', accounts[1]._id.toString());
      await navigate(wardenPage, 'Students', '/warden/manage-students');
      assert.equal(await wardenPage.locator('select').first().isDisabled(), true);
      const createdRoll = `${prefix}-created`;
      const createdEmail = `${prefix}-created@example.invalid`;
      await wardenPage.getByPlaceholder('e.g. Charlie Brown').fill('Fictional Created Student');
      await wardenPage.getByPlaceholder('e.g. CS2023001').fill(createdRoll);
      await wardenPage.getByPlaceholder('e.g. student@hostel.edu').fill(createdEmail);
      await wardenPage.getByRole('button', { name: 'Add Student' }).click();
      await wardenPage.getByText('Student Created — Share These Credentials').waitFor();
      const createdStudent = await User.findOne({ rollNumber: createdRoll }).lean();
      assert.equal(createdStudent.wing, 'A-Wing');
      assert.equal(createdStudent.needsPasswordChange, true);
      assert.equal(createdStudent.isDemoData, true);
      userIds.push(createdStudent._id);

      const crossWingList = await api(wardenContext, '/api/warden/students?wing=B-Wing');
      assert.equal(crossWingList.status, 403);
      const crossWingCreate = await api(wardenContext, '/api/warden/students', {
        method: 'POST',
        body: {
          students: {
            name: 'Fictional Rejected B-Wing Student',
            rollNumber: `${prefix}-rejected`,
            wing: 'B-Wing',
            email: `${prefix}-rejected@example.invalid`,
          },
        },
      });
      assert.equal(crossWingCreate.status, 403);
      const crossWingImport = await api(wardenContext, '/api/warden/students', {
        method: 'POST',
        body: {
          students: [
            {
              name: 'Fictional Rejected A-Wing Student',
              rollNumber: `${prefix}-batch-a`,
              wing: 'A-Wing',
              email: `${prefix}-batch-a@example.invalid`,
            },
            {
              name: 'Fictional Rejected B-Wing Student',
              rollNumber: `${prefix}-batch-b`,
              wing: 'B-Wing',
              email: `${prefix}-batch-b@example.invalid`,
            },
          ],
        },
      });
      assert.equal(crossWingImport.status, 403);
      assert.equal(await User.exists({ rollNumber: `${prefix}-rejected` }), null);
      assert.equal(await User.exists({ rollNumber: `${prefix}-batch-a` }), null);
      const crossWingStudentBefore = await User.findById(accounts[4]._id).lean();
      const protectedReset = await api(wardenContext, '/api/warden/reset-password', {
        method: 'POST',
        body: { studentId: accounts[4]._id.toString() },
      });
      assert.equal(protectedReset.status, 403);
      const crossWingStudentAfter = await User.findById(accounts[4]._id).lean();
      for (const field of ['role', 'wing', 'active', 'password', 'authVersion']) {
        assert.equal(crossWingStudentAfter[field], crossWingStudentBefore[field]);
      }

      await signInWarden(
        otherWardenPage,
        accounts[3].email,
        alternateWardenPassword,
        accounts[3]._id.toString()
      );

      await navigate(adminPage, 'Analytics', '/admin');
      await adminPage.getByRole('button', { name: 'Initialize Empty Current Week' }).click();
      await adminPage.getByText('Default menu initialized for the week of 2026-11-09.').waitFor();
      const menuBeforeReads = await WeeklyMenu.find({ weekStartDate })
        .sort({ dayOfWeek: 1, mealType: 1 })
        .lean();
      assert.equal(menuBeforeReads.length, 28);
      await adminPage.getByRole('button', { name: 'Initialize Empty Current Week' }).click();
      await adminPage.getByText('An existing menu for the week of 2026-11-09 was preserved.').waitFor();
      assert.deepEqual(
        await WeeklyMenu.find({ weekStartDate }).sort({ dayOfWeek: 1, mealType: 1 }).lean(),
        menuBeforeReads
      );

      await signInDemo(studentPage, 'STUDENT', accounts[2]._id.toString());
      await navigate(studentPage, 'Rate Meals', '/vote');
      await studentPage.getByRole('heading', { name: 'My Meal Rating History Matrix' }).waitFor();
      const beforeStudentReads = await WeeklyMenu.find({ weekStartDate })
        .sort({ dayOfWeek: 1, mealType: 1 })
        .lean();
      const menuResponse = await api(studentContext, '/api/menu?date=2026-11-14');
      const ratingsResponse = await api(studentContext, '/api/vote?date=2026-11-14');
      const historyResponse = await api(studentContext, '/api/vote/history');
      assert.equal(menuResponse.data.menu.length, 4);
      assert.equal(ratingsResponse.data.menu.length, 4);
      assert.equal(historyResponse.data.history.length, 28);
      assert.deepEqual(
        await WeeklyMenu.find({ weekStartDate }).sort({ dayOfWeek: 1, mealType: 1 }).lean(),
        beforeStudentReads
      );
      const ratePrompt = studentPage.getByText('Rate taste', { exact: true }).first();
      await ratePrompt.locator('..').getByRole('button').nth(4).click();
      await studentPage.getByText('You rated 5★', { exact: true }).waitFor();
      assert.equal(await MealRating.countDocuments({ user: accounts[2]._id }), 1);
      const ratedHistory = await api(studentContext, '/api/vote/history');
      assert.equal(ratedHistory.data.history.filter((entry) => entry.rating === 5).length, 1);

      await navigate(studentPage, 'Log Waste', '/waste-log');
      await studentPage.locator('input[type="date"]').fill('2026-11-14');
      const wasteSlider = studentPage.locator('input[type="range"]');
      await wasteSlider.focus();
      await wasteSlider.press('End');
      await studentPage.getByRole('button', { name: 'Submit Daily Log' }).click();
      await studentPage.getByText('Log Recorded Successfully!', { exact: true }).waitFor();
      await studentPage.getByText('0/100', { exact: true }).waitFor();
      assert.equal(await WasteLog.countDocuments({ user: accounts[2]._id }), 1);

      await wardenPage.locator('button[title="Notifications"]').click();
      const wardenNotifications = wardenPage.getByRole('dialog', { name: 'Notifications' });
      await wardenNotifications
        .getByText(/High waste reported in A-Wing by Fictional Test Demo Student/)
        .waitFor({ timeout: 15_000 });
      await adminPage.waitForTimeout(500);
      const adminNotifications = await adminPage.evaluate(() =>
        JSON.parse(localStorage.getItem('messmesh_notifications') || '[]')
      );
      const otherWardenNotifications = await otherWardenPage.evaluate(() =>
        JSON.parse(localStorage.getItem('messmesh_notifications') || '[]')
      );
      assert.equal(
        adminNotifications.some((notification) => notification.text.includes('High waste reported')),
        false
      );
      assert.equal(
        otherWardenNotifications.some((notification) => notification.text.includes('High waste reported')),
        false
      );

      const activityBeforeTimeAdvance = {
        ratings: await MealRating.countDocuments({}),
        waste: await WasteLog.countDocuments({}),
      };
      await advanceDate(adminPage, '2026-11-15');
      await User.updateMany(
        { role: 'STUDENT', isDemoData: true },
        {
          $set: {
            cleanPlateScore: 75,
            cleanPlateScoreWeekStart: weekStartDate,
          },
        }
      );
      await advanceDate(adminPage, '2026-11-16');
      assert.deepEqual(
        {
          ratings: await MealRating.countDocuments({}),
          waste: await WasteLog.countDocuments({}),
        },
        activityBeforeTimeAdvance
      );
      const snapshot = await WeeklyScoreSnapshot.findOne({ weekStartDate }).lean();
      assert.equal(snapshot.status, 'COMPLETED');
      assert.equal(snapshot.hostelAvg, 75);
      const studentsAfterRollover = await User.find({
        role: 'STUDENT',
        isDemoData: true,
      }).lean();
      assert.ok(studentsAfterRollover.every((student) => student.cleanPlateScore === 0));
      assert.ok(
        studentsAfterRollover.every(
          (student) => student.cleanPlateScoreWeekStart.getTime() === new Date('2026-11-16T00:00:00.000Z').getTime()
        )
      );

      const missingMenu = await api(studentContext, '/api/menu?date=2026-11-16');
      const missingRatings = await api(studentContext, '/api/vote?date=2026-11-16');
      assert.deepEqual(missingMenu.data.menu, []);
      assert.deepEqual(missingRatings.data.menu, []);
      await studentPage.goto(new URL('/vote', appUrl).toString());
      await studentPage.getByText('No dishes scheduled for this day.', { exact: true }).waitFor();
      await studentPage.goto(new URL('/waste-log', appUrl).toString());
      await studentPage.locator('input[type="date"]').fill('2026-11-16');
      await studentPage.getByText('No menu scheduled for Monday', { exact: false }).waitFor();

      const protectedStudentBefore = await User.findById(accounts[2]._id).lean();
      const selfPasswordChange = await api(studentContext, '/api/student/change-password', {
        method: 'POST',
        body: { newPassword: 'a-different-demo-test-password' },
      });
      assert.equal(selfPasswordChange.status, 403);
      const protectedStudentAfter = await User.findById(accounts[2]._id).lean();
      for (const field of ['role', 'wing', 'active', 'password', 'authVersion']) {
        assert.equal(protectedStudentAfter[field], protectedStudentBefore[field]);
      }

      await adminPage.locator('button[title="Sign Out"]').click();
      await adminPage.waitForURL((url) => url.pathname === '/login');
      await signInDemo(adminPage, 'STUDENT', accounts[2]._id.toString());
      assert.equal(
        (await adminPage.evaluate(() =>
          fetch('/api/auth/session').then((response) => response.json())
        )).user.role,
        'STUDENT'
      );
    } finally {
      for (const context of contexts) {
        await context.close().catch(() => {});
      }
      if (browser) await browser.close();
      if (userIds.length) {
        await Promise.all([
          MealRating.deleteMany({ user: { $in: userIds } }),
          WasteLog.deleteMany({ user: { $in: userIds } }),
          AccountSetupToken.deleteMany({ user: { $in: userIds } }),
          AccountAudit.deleteMany({
            $or: [{ actor: { $in: userIds } }, { target: { $in: userIds } }],
          }),
          User.deleteMany({ _id: { $in: userIds } }),
        ]);
      }
      await Promise.all([
        WeeklyMenu.deleteMany({ weekStartDate }),
        WeeklyMenuInitialization.deleteMany({ _id: weekStartKey }),
        WeeklyScoreSnapshot.deleteMany({ weekStartDate }),
        WeeklyScoreState.deleteMany({ _id: 'global' }),
        SystemState.deleteMany({}),
        RateLimitBucket.deleteMany({}),
      ]);
      if (ownsCatalog) await Dish.deleteMany({});
      await mongoose.disconnect();
      await referenceDatabaseIsEmpty();
    }
  }
);
