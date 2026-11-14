import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import AccountSetupToken from '@/lib/models/AccountSetupToken';
import { checkDemoLimit } from '@/lib/demoLimits';
import { canMutateAccount, setupTokenClaimFilter } from '@/lib/accessPolicy';

export async function POST(req) {
  try {
    await dbConnect();
    if (process.env.DEMO_MODE === 'true') {
      const requestIp =
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        req.headers.get('x-real-ip') ||
        'unknown';
      const rateLimit = await checkDemoLimit(`setup:${requestIp}`, 8);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { success: false, error: 'Demo setup rate limit reached.' },
          { status: 429 }
        );
      }
    }
    const { token, password } = await req.json();
    if (
      typeof token !== 'string' ||
      typeof password !== 'string' ||
      password.trim().length < 10
    ) {
      return NextResponse.json(
        { success: false, error: 'A valid setup link and a password of at least 10 characters are required.' },
        { status: 400 }
      );
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const setupToken = await AccountSetupToken.findOneAndUpdate(
      setupTokenClaimFilter(tokenHash),
      { $set: { consumedAt: new Date() } },
      { new: true }
    );
    if (!setupToken) {
      return NextResponse.json(
        { success: false, error: 'This setup link is invalid, expired, or already used.' },
        { status: 400 }
      );
    }

    const user = await User.findOne({
      _id: setupToken.user,
      role: 'WARDEN',
      active: { $ne: false },
    });
    if (!user || !canMutateAccount(user)) {
      return NextResponse.json(
        { success: false, error: 'This account cannot be set up using this link.' },
        { status: 400 }
      );
    }
    user.password = await bcrypt.hash(password.trim(), 12);
    user.needsPasswordChange = false;
    user.authVersion = (user.authVersion || 0) + 1;
    await user.save();
    if (global.io) global.io.in(`user:${user._id}`).disconnectSockets(true);

    return NextResponse.json({
      success: true,
      message: 'Password set. Sign in with your account to continue.',
      reauthenticationRequired: true,
    });
  } catch (error) {
    console.error('[API Account Setup POST] Error:', error);
    return NextResponse.json({ success: false, error: 'Unable to set up this account.' }, { status: 500 });
  }
}
