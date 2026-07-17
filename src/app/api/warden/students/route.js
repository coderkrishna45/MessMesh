import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import { authOptions } from '@/lib/auth';
import bcrypt from 'bcryptjs';

const VALID_WINGS = ['A-Wing', 'B-Wing', 'C-Wing', 'D-Wing'];

/** Normalize wing input: A / A-Wing / a-wing → A-Wing */
export function normalizeWing(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (['A', 'A-WING', 'AWING'].includes(cleaned)) return 'A-Wing';
  if (['B', 'B-WING', 'BWING'].includes(cleaned)) return 'B-Wing';
  if (['C', 'C-WING', 'CWING'].includes(cleaned)) return 'C-Wing';
  if (['D', 'D-WING', 'DWING'].includes(cleaned)) return 'D-Wing';
  return null;
}

function defaultPassword(rollNumber) {
  return `${rollNumber.trim()}@Mess2026`;
}

// GET: Retrieve all students (Warden only)
export async function GET() {
  try {
    await dbConnect();

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'WARDEN') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Warden only.' },
        { status: 403 }
      );
    }

    const students = await User.find({ role: 'STUDENT' })
      .select(
        'name email rollNumber wing phone needsPasswordChange cleanPlateScore createdAt'
      )
      .sort({ rollNumber: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      students: students.map((s) => ({
        ...s,
        id: s._id.toString(),
        _id: s._id.toString(),
      })),
    });
  } catch (error) {
    console.error('[API Warden Students GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST: Add new student(s) manually or in bulk (Warden only)
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

    const body = await req.json();
    const { students } = body;

    if (!students) {
      return NextResponse.json(
        { success: false, error: 'Missing students parameter' },
        { status: 400 }
      );
    }

    const studentsList = Array.isArray(students) ? students : [students];
    const registered = [];
    const failed = [];

    // Detect duplicates within a single bulk/CSV upload batch
    const seenRolls = new Set();
    const seenEmails = new Set();

    for (const s of studentsList) {
      const name = (s.name || '').trim();
      const rollNumber = (s.rollNumber || s.roll || '').toString().trim();
      const emailRaw = (s.email || '').toString().trim().toLowerCase();
      const phone = (s.phone || '').toString().trim();
      const wing = normalizeWing(s.wing);

      if (!name || !rollNumber) {
        failed.push({
          rollNumber: rollNumber || '—',
          name: name || '—',
          reason: 'Missing name or roll number',
        });
        continue;
      }

      if (!wing || !VALID_WINGS.includes(wing)) {
        failed.push({
          rollNumber,
          name,
          reason: `Invalid wing "${s.wing || ''}". Must be A, B, C, or D`,
        });
        continue;
      }

      if (seenRolls.has(rollNumber.toLowerCase())) {
        failed.push({
          rollNumber,
          name,
          reason: 'Duplicate roll number in upload batch',
        });
        continue;
      }

      const finalEmail =
        emailRaw || `${rollNumber.toLowerCase().replace(/\s+/g, '')}@messmesh.com`;

      if (seenEmails.has(finalEmail)) {
        failed.push({
          rollNumber,
          name,
          reason: `Duplicate email in upload batch (${finalEmail})`,
        });
        continue;
      }

      const existingRoll = await User.findOne({ rollNumber });
      if (existingRoll) {
        failed.push({
          rollNumber,
          name,
          reason: 'Roll number already registered',
        });
        continue;
      }

      const existingEmail = await User.findOne({ email: finalEmail });
      if (existingEmail) {
        failed.push({
          rollNumber,
          name,
          reason: `Email already registered (${finalEmail})`,
        });
        continue;
      }

      try {
        const passwordText = defaultPassword(rollNumber);
        const hashedPassword = await bcrypt.hash(passwordText, 10);

        const newUser = await User.create({
          name,
          rollNumber,
          wing,
          email: finalEmail,
          phone,
          password: hashedPassword,
          role: 'STUDENT',
          cleanPlateScore: 100,
          needsPasswordChange: true,
        });

        seenRolls.add(rollNumber.toLowerCase());
        seenEmails.add(finalEmail);

        registered.push({
          id: newUser._id.toString(),
          name: newUser.name,
          rollNumber: newUser.rollNumber,
          username: newUser.rollNumber,
          password: passwordText,
          email: newUser.email,
          wing: newUser.wing,
          phone: newUser.phone,
        });
      } catch (createErr) {
        failed.push({
          rollNumber,
          name,
          reason: createErr.message || 'Database create failed',
        });
      }
    }

    if (registered.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            failed.length > 0
              ? `No students registered. ${failed.length} failed.`
              : 'No students provided.',
          registered: [],
          failed,
          successCount: 0,
          failCount: failed.length,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Registered ${registered.length} student(s)${
        failed.length ? `, ${failed.length} failed` : ''
      }.`,
      registered,
      failed,
      successCount: registered.length,
      failCount: failed.length,
    });
  } catch (error) {
    console.error('[API Warden Students POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
