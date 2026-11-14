import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { requireRoles } from '@/lib/authorization';
import { canAccessWing, canMutateAccount } from '@/lib/accessPolicy';
import AccountAudit from '@/lib/models/AccountAudit';
import { demoMutationResponse } from '@/lib/demoLimits';

// POST: Reset student password (Warden only)
export async function POST(req) {
  try {
    await dbConnect();

    const { user: actor, response } = await requireRoles(['ADMIN', 'WARDEN']);
    if (response) return response;
    const rateLimitError = await demoMutationResponse(actor);
    if (rateLimitError) return NextResponse.json(rateLimitError, { status: 429 });

    const { studentId } = await req.json();

    if (!studentId) {
      return NextResponse.json(
        { success: false, error: 'Missing studentId parameter' },
        { status: 400 }
      );
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== 'STUDENT') {
      return NextResponse.json(
        { success: false, error: 'Student user not found' },
        { status: 404 }
      );
    }
    if (!canAccessWing(actor, student.wing)) {
      return NextResponse.json(
        { success: false, error: 'Wardens may only reset passwords in their assigned wing.' },
        { status: 403 }
      );
    }
    if (!canMutateAccount(student)) {
      return NextResponse.json(
        { success: false, error: 'Protected demo accounts cannot be reset.' },
        { status: 403 }
      );
    }

    const defaultPasswordText = randomBytes(18).toString('base64url');
    const hashedPassword = await bcrypt.hash(defaultPasswordText, 10);

    student.password = hashedPassword;
    student.needsPasswordChange = true;
    student.authVersion = (student.authVersion || 0) + 1;
    await student.save();
    await AccountAudit.create({
      actor: actor._id,
      target: student._id,
      action: 'PASSWORD_RESET',
    });
    if (global.io) global.io.in(`user:${student._id}`).disconnectSockets(true);

    return NextResponse.json({
      success: true,
      message: `Password reset successfully for ${student.name}!`,
      username: student.rollNumber || student.email,
      password: defaultPasswordText,
      name: student.name,
    });
  } catch (error) {
    console.error('[API Reset Password POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
