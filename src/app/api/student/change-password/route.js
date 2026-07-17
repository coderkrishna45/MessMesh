import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import { authOptions } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// POST: Student change password
export async function POST(req) {
  try {
    await dbConnect();

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Please login.' }, { status: 401 });
    }

    const { newPassword } = await req.json();

    if (!newPassword || newPassword.trim().length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters long' },
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

    const userId = session.user.id;

    // Resolve user (fall back to email lookup if session has a stale ID)
    let user = await User.findById(userId);
    if (!user && session.user.email) {
      user = await User.findOne({ email: session.user.email });
    }

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const hashedPassword = await bcrypt.hash(trimmed, 10);
    user.password = hashedPassword;
    user.needsPasswordChange = false;
    await user.save();

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully!',
      needsPasswordChange: false,
    });
  } catch (error) {
    console.error('[API Student Change Password POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
