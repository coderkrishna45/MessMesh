import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import bcrypt from 'bcryptjs';
import { getCurrentUser } from '@/lib/authorization';
import { canMutateAccount } from '@/lib/accessPolicy';

// POST: Student change password
export async function POST(req) {
  try {
    await dbConnect();

    const { user, response } = await getCurrentUser({ allowPasswordChange: true });
    if (response) return response;
    if (!canMutateAccount(user)) {
      return NextResponse.json(
        { success: false, error: 'Demo entry account credentials are protected.' },
        { status: 403 }
      );
    }

    const { newPassword } = await req.json();

    if (!newPassword || newPassword.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 10 characters long' },
        { status: 400 }
      );
    }

    // Block default-pattern passwords so students don't reuse the warden default
    const trimmed = newPassword.trim();
    if (/@Mess2026$/i.test(trimmed)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please choose a personal password (do not reuse the default format).',
        },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(trimmed, 10);
    user.password = hashedPassword;
    user.needsPasswordChange = false;
    user.authVersion = (user.authVersion || 0) + 1;
    await user.save();
    if (global.io) global.io.in(`user:${user._id}`).disconnectSockets(true);

    return NextResponse.json({
      success: true,
      message: 'Password updated. Sign in again to continue.',
      reauthenticationRequired: true,
    });
  } catch (error) {
    console.error('[API Student Change Password POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
