export const VALID_WINGS = ['A-Wing', 'B-Wing', 'C-Wing', 'D-Wing'];

export function principalFailure(session, user, allowPasswordChange = false) {
  if (!session?.user?.id) return 'missing-authentication';
  if (!user || user.active === false) return 'invalid-account';
  if ((session.user.authVersion ?? 0) !== (user.authVersion ?? 0)) {
    return 'stale-session';
  }
  if (!allowPasswordChange && user.needsPasswordChange) {
    return 'password-change-required';
  }
  return null;
}

export function roleAllowed(role, roles) {
  return roles.includes(role);
}

export function authorizationFailureStatus(failure) {
  return failure === 'insufficient-role' || failure === 'password-change-required'
    ? 403
    : 401;
}

export function canAccessWing(actor, targetWing) {
  if (!VALID_WINGS.includes(targetWing)) return false;
  return actor?.role === 'ADMIN' ||
    (actor?.role === 'WARDEN' && actor.wing === targetWing);
}

export function canMutateAccount(account) {
  return account?.isDemoAccount !== true;
}

export function setupTokenCanBeClaimed(token, tokenHash, now = new Date()) {
  return Boolean(
    token &&
    token.tokenHash === tokenHash &&
    ['INVITATION', 'PASSWORD_RESET'].includes(token.purpose) &&
    token.consumedAt == null &&
    new Date(token.expiresAt).getTime() > now.getTime()
  );
}

export function socketRoomsFor(user) {
  if (!user?.id || !user.role) return [];
  const rooms = ['authenticated', `user:${user.id}`, `role:${user.role}`];
  if (user.wing) rooms.push(`wing:${user.wing}`);
  if (user.role === 'WARDEN' && user.wing) {
    rooms.push(`warden:${user.wing}`);
  }
  return rooms;
}

export function socketEventRoom(event, targetWing) {
  if (event === 'date-simulated' || event === 'rate-updated') return 'authenticated';
  if (event === 'feast-unlocked' && VALID_WINGS.includes(targetWing)) {
    return `wing:${targetWing}`;
  }
  if (event === 'high-waste-logged' && VALID_WINGS.includes(targetWing)) {
    return `warden:${targetWing}`;
  }
  return null;
}

export function canSeeSocketEvent(user, event, targetWing) {
  if (!user?.id || !user.role) return false;
  if (event === 'date-simulated' || event === 'rate-updated') return true;
  if (event === 'feast-unlocked') return user.wing === targetWing;
  if (event === 'high-waste-logged') {
    return user.role === 'WARDEN' && user.wing === targetWing;
  }
  return false;
}

export function canUseDemoLogin(environment, role, account) {
  return environment.DEMO_MODE === 'true' &&
    environment.NEXT_PUBLIC_DEMO_MODE === 'true' &&
    ['ADMIN', 'WARDEN', 'STUDENT'].includes(role) &&
    account?.isDemoAccount === true &&
    account.active !== false;
}

export function setupTokenClaimFilter(tokenHash, now = new Date()) {
  return {
    tokenHash,
    purpose: { $in: ['INVITATION', 'PASSWORD_RESET'] },
    consumedAt: null,
    expiresAt: { $gt: now },
  };
}

export function sameDatabase(first, second) {
  const firstIdentity = databaseIdentity(first);
  return firstIdentity !== null && firstIdentity === databaseIdentity(second);
}

export function safeDemoDatabase(environment) {
  const demoIdentity = databaseIdentity(environment.DEMO_MONGODB_URI);
  if (
    !demoIdentity ||
    environment.DEMO_MODE !== 'true' ||
    environment.NEXT_PUBLIC_DEMO_MODE !== 'true'
  ) return false;
  const demoName = demoIdentity.split('/').pop();
  const realName = environment.REAL_DATABASE_NAME?.trim().toLowerCase();
  if (!realName || !demoName.includes('demo') || demoName === realName) return false;
  return !environment.MONGODB_URI || demoIdentity !== databaseIdentity(environment.MONGODB_URI);
}

function databaseIdentity(uri) {
  try {
    const parsed = new URL(uri);
    const name = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
    return name ? `${parsed.host.toLowerCase()}/${name.toLowerCase()}` : null;
  } catch {
    return null;
  }
}
