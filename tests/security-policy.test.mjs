import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizationFailureStatus,
  canAccessWing,
  canMutateAccount,
  canSeeSocketEvent,
  canUseDemoLogin,
  principalFailure,
  roleAllowed,
  safeDemoDatabase,
  setupTokenCanBeClaimed,
  setupTokenClaimFilter,
  socketEventRoom,
  socketRoomsFor,
} from '../src/lib/accessPolicy.js';
import { deliverSetupLink } from '../src/lib/invitationDelivery.js';

test('missing authentication and insufficient roles have distinct HTTP statuses', () => {
  assert.equal(
    authorizationFailureStatus(principalFailure(null, null)),
    401
  );
  assert.equal(authorizationFailureStatus('invalid-account'), 401);
  assert.equal(roleAllowed('STUDENT', ['ADMIN', 'WARDEN']), false);
  assert.equal(authorizationFailureStatus('insufficient-role'), 403);
});

test('legacy active users remain valid; inactive and stale-session users do not', () => {
  const session = { user: { id: 'user-1' } };
  assert.equal(principalFailure(session, { _id: 'user-1' }), null);
  assert.equal(principalFailure(session, { active: false }), 'invalid-account');
  assert.equal(
    principalFailure(
      { user: { id: 'user-1', authVersion: 2 } },
      { authVersion: 3 }
    ),
    'stale-session'
  );
});

test('warden wing checks reject cross-wing list, create, import, and reset targets', () => {
  const warden = { role: 'WARDEN', wing: 'A-Wing' };
  for (const operation of ['list', 'create', 'import', 'reset']) {
    assert.equal(canAccessWing(warden, 'B-Wing'), false, operation);
    assert.equal(canAccessWing(warden, 'A-Wing'), true, operation);
  }
  assert.equal(canAccessWing({ role: 'ADMIN' }, 'D-Wing'), true);
  assert.equal(canAccessWing({ role: 'STUDENT', wing: 'A-Wing' }, 'A-Wing'), false);
});

test('password-change requirement cannot be cleared by a client session update', () => {
  const session = { user: { id: 'user-1', authVersion: 0, needsPasswordChange: false } };
  const user = { authVersion: 0, needsPasswordChange: true };
  assert.equal(principalFailure(session, user), 'password-change-required');
  assert.equal(principalFailure(session, user, true), null);
  assert.equal(authorizationFailureStatus('password-change-required'), 403);
});

test('setup-token claim filter excludes expired and consumed tokens and binds purpose', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  const filter = setupTokenClaimFilter('sha256-hash', now);
  assert.deepEqual(filter, {
    tokenHash: 'sha256-hash',
    purpose: { $in: ['INVITATION', 'PASSWORD_RESET'] },
    consumedAt: null,
    expiresAt: { $gt: now },
  });
  const valid = {
    tokenHash: 'sha256-hash',
    purpose: 'INVITATION',
    consumedAt: null,
    expiresAt: new Date('2026-11-14T00:00:00Z'),
  };
  assert.equal(setupTokenCanBeClaimed(valid, 'sha256-hash', now), true);
  assert.equal(
    setupTokenCanBeClaimed({ ...valid, expiresAt: now }, 'sha256-hash', now),
    false
  );
  assert.equal(
    setupTokenCanBeClaimed({ ...valid, consumedAt: now }, 'sha256-hash', now),
    false
  );
  assert.equal(
    setupTokenCanBeClaimed({ ...valid, purpose: 'OTHER' }, 'sha256-hash', now),
    false
  );
});

test('demo entry accounts are immutable through public account actions', () => {
  assert.equal(canMutateAccount({ isDemoAccount: true }), false);
  assert.equal(canMutateAccount({ isDemoAccount: false }), true);
});

test('demo role login is denied unless explicitly enabled for an active seeded entry account', () => {
  const account = { isDemoAccount: true, active: true };
  assert.equal(
    canUseDemoLogin(
      { DEMO_MODE: 'false', NEXT_PUBLIC_DEMO_MODE: 'true' },
      'ADMIN',
      account
    ),
    false
  );
  assert.equal(
    canUseDemoLogin(
      { DEMO_MODE: 'true', NEXT_PUBLIC_DEMO_MODE: 'true' },
      'ADMIN',
      account
    ),
    true
  );
  assert.equal(
    canUseDemoLogin(
      { DEMO_MODE: 'true', NEXT_PUBLIC_DEMO_MODE: 'true' },
      'WARDEN',
      { ...account, active: false }
    ),
    false
  );
});

test('demo reset refuses normal, same-database, or incomplete configuration', () => {
  const base = {
    DEMO_MODE: 'true',
    NEXT_PUBLIC_DEMO_MODE: 'true',
    DEMO_MONGODB_URI: 'mongodb://demo-host/messmesh_demo',
    REAL_DATABASE_NAME: 'messmesh',
  };
  assert.equal(safeDemoDatabase(base), true);
  assert.equal(safeDemoDatabase({ ...base, DEMO_MODE: 'false' }), false);
  assert.equal(safeDemoDatabase({ ...base, REAL_DATABASE_NAME: 'messmesh_demo' }), false);
  assert.equal(
    safeDemoDatabase({ ...base, MONGODB_URI: 'mongodb://demo-host/messmesh_demo' }),
    false
  );
  assert.equal(safeDemoDatabase({ ...base, DEMO_MONGODB_URI: '' }), false);
});

test('socket rooms and event visibility are scoped to authenticated role and wing', () => {
  const warden = { id: 'warden-1', role: 'WARDEN', wing: 'A-Wing' };
  const student = { id: 'student-1', role: 'STUDENT', wing: 'A-Wing' };
  const otherStudent = { id: 'student-2', role: 'STUDENT', wing: 'B-Wing' };
  assert.deepEqual(socketRoomsFor(warden), [
    'authenticated',
    'user:warden-1',
    'role:WARDEN',
    'wing:A-Wing',
    'warden:A-Wing',
  ]);
  assert.equal(socketEventRoom('feast-unlocked', 'A-Wing'), 'wing:A-Wing');
  assert.equal(socketEventRoom('high-waste-logged', 'A-Wing'), 'warden:A-Wing');
  assert.equal(socketEventRoom('date-simulated'), 'authenticated');
  assert.equal(canSeeSocketEvent(warden, 'high-waste-logged', 'A-Wing'), true);
  assert.equal(canSeeSocketEvent(student, 'high-waste-logged', 'A-Wing'), false);
  assert.equal(canSeeSocketEvent(otherStudent, 'feast-unlocked', 'A-Wing'), false);
  assert.equal(canSeeSocketEvent(student, 'feast-unlocked', 'A-Wing'), true);
});

test('invitation delivery boundary uses a fake provider and never reports an unconfigured email as sent', async () => {
  const messages = [];
  const fakeFetch = async (url, options) => {
    messages.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true };
  };
  const account = { email: 'fictional@example.invalid' };
  const setupUrl = 'https://demo.example.invalid/account/setup?token=fake';

  const preview = await deliverSetupLink(
    account,
    setupUrl,
    { DEMO_MODE: 'true', NODE_ENV: 'production' },
    fakeFetch
  );
  assert.equal(preview.status, 'preview');
  assert.equal(messages.length, 0);

  const missingProvider = await deliverSetupLink(
    account,
    setupUrl,
    { DEMO_MODE: 'false', NODE_ENV: 'production' },
    fakeFetch
  );
  assert.equal(missingProvider.status, 'not_configured');
  assert.equal(messages.length, 0);

  const sent = await deliverSetupLink(
    account,
    setupUrl,
    {
      DEMO_MODE: 'false',
      NODE_ENV: 'production',
      MAIL_DELIVERY_URL: 'https://mail.example.invalid/send',
      MAIL_DELIVERY_TOKEN: 'fake-provider-token',
    },
    fakeFetch
  );
  assert.equal(sent.status, 'sent');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body.setupUrl, setupUrl);
});
