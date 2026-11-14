import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { requireRoles, VALID_WINGS } from '@/lib/authorization';
import { canAccessWing } from '@/lib/accessPolicy';
import { demoMutationResponse } from '@/lib/demoLimits';
import AccountAudit from '@/lib/models/AccountAudit';

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

// GET: Retrieve students visible to the current manager.
export async function GET(req) {
  try {
    await dbConnect();
    const { user, response } = await requireRoles(['ADMIN', 'WARDEN']);
    if (response) return response;
    const requestedWing = new URL(req.url).searchParams.get('wing');
    if (user.role === 'WARDEN' && !VALID_WINGS.includes(user.wing)) {
      return NextResponse.json(
        { success: false, error: 'Warden account must have a valid assigned wing.' },
        { status: 403 }
      );
    }
    const wing = user.role === 'WARDEN' ? user.wing : requestedWing;
    if (requestedWing && !canAccessWing(user, requestedWing)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permission.' },
        { status: 403 }
      );
    }
    if (wing && !VALID_WINGS.includes(wing)) {
      return NextResponse.json({ success: false, error: 'Invalid wing.' }, { status: 400 });
    }
    const filter = { role: 'STUDENT' };
    if (wing) filter.wing = wing;
    const students = await User.find(filter)
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

    const { user, response } = await requireRoles(['ADMIN', 'WARDEN']);
    if (response) return response;
    const rateLimitError = await demoMutationResponse(user);
    if (rateLimitError) return NextResponse.json(rateLimitError, { status: 429 });

    const body = await req.json();
    const { students } = body;

    if (!students) {
      return NextResponse.json(
        { success: false, error: 'Missing students parameter' },
        { status: 400 }
      );
    }

    const studentsList = Array.isArray(students) ? students : [students];
    if (process.env.DEMO_MODE === 'true' && studentsList.length > 25) {
      return NextResponse.json(
        { success: false, error: 'Demo imports are limited to 25 students per request.' },
        { status: 400 }
      );
    }
    if (process.env.DEMO_MODE === 'true') {
      const currentCount = await User.countDocuments({ role: 'STUDENT', isDemoData: true });
      if (currentCount >= 200) {
        return NextResponse.json(
          { success: false, error: 'Demo student account limit reached.' },
          { status: 400 }
        );
      }
    }
    if (
      user.role === 'WARDEN' &&
      studentsList.some((student) => {
        const targetWing = normalizeWing(student?.wing);
        return targetWing && !canAccessWing(user, targetWing);
      })
    ) {
      return NextResponse.json(
        { success: false, error: 'Wardens may only import students for their assigned wing.' },
        { status: 403 }
      );
    }
    const registered = [];
    const failed = [];

    // Detect duplicates within a single bulk/CSV upload batch
    const seenRolls = new Set();
    const seenEmails = new Set();

    for (const s of studentsList) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) {
        failed.push({ rollNumber: '—', name: '—', reason: 'Invalid student row' });
        continue;
      }
      const name = typeof s.name === 'string' ? s.name.trim() : '';
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
      if (user.role === 'WARDEN' && !canAccessWing(user, wing)) {
        return NextResponse.json(
          { success: false, error: 'Wardens may only add students to their assigned wing.' },
          { status: 403 }
        );
      }
      if (process.env.DEMO_MODE === 'true') {
        const demoCount = await User.countDocuments({ role: 'STUDENT', isDemoData: true });
        if (demoCount >= 200) {
          failed.push({ rollNumber, name, reason: 'Demo student account limit reached.' });
          continue;
        }
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
        const passwordText = randomBytes(18).toString('base64url');
        const hashedPassword = await bcrypt.hash(passwordText, 10);

        const newUser = await User.create({
          name,
          rollNumber,
          wing,
          email: finalEmail,
          phone,
          password: hashedPassword,
          role: 'STUDENT',
          cleanPlateScore: 0,
          needsPasswordChange: true,
          isDemoData: process.env.DEMO_MODE === 'true',
        });
        await AccountAudit.create({
          actor: user._id,
          target: newUser._id,
          action: 'ACCOUNT_CREATED',
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
