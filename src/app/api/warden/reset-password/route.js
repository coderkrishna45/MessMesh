import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import { authOptions } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// POST: Reset student password (Warden only)
export async function POST(req) {
  try {
    await dbConnect();

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'WARDEN') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Warden only.' },
        { status: 403 }
      );
    }

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

    if (!student.rollNumber) {
      return NextResponse.json(
        {
          success: false,
          error: 'Student has no roll number; cannot generate default password.',
        },
        { status: 400 }
      );
    }

    // Default password = rollNumber + "@Mess2026"
    const defaultPasswordText = `${student.rollNumber}@Mess2026`;
    const hashedPassword = await bcrypt.hash(defaultPasswordText, 10);

    student.password = hashedPassword;
    student.needsPasswordChange = true;
    await student.save();

    return NextResponse.json({
      success: true,
      message: `Password reset successfully for ${student.name}!`,
      username: student.rollNumber,
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
