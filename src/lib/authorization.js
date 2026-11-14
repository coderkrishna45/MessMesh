import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import { authOptions } from '@/lib/auth';
import {
  principalFailure,
  roleAllowed,
  authorizationFailureStatus,
  VALID_WINGS,
} from '@/lib/accessPolicy';

export { VALID_WINGS };

export async function getCurrentUser({ allowPasswordChange = false } = {}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      user: null,
      response: NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: authorizationFailureStatus('missing-authentication') }
      ),
    };
  }

  await dbConnect();
  const user = await User.findById(session.user.id);
  const failure = principalFailure(session, user, allowPasswordChange);
  if (failure === 'invalid-account' || failure === 'stale-session') {
    return {
      user: null,
      response: NextResponse.json(
        { success: false, error: 'Session is no longer valid. Please sign in again.' },
        { status: authorizationFailureStatus(failure) }
      ),
    };
  }

  if (failure === 'password-change-required') {
    return {
      user: null,
      response: NextResponse.json(
        { success: false, error: 'Change your password before continuing.' },
        { status: authorizationFailureStatus(failure) }
      ),
    };
  }

  return { user, response: null };
}

export async function requireRoles(roles, options = {}) {
  const result = await getCurrentUser(options);
  if (result.response) return result;
  if (!roleAllowed(result.user.role, roles)) {
    return {
      user: null,
      response: NextResponse.json(
        { success: false, error: 'Insufficient permission.' },
        { status: authorizationFailureStatus('insufficient-role') }
      ),
    };
  }
  return result;
}
