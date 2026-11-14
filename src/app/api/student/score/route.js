import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { requireRoles } from '@/lib/authorization';
import { getApplicationTime, scoreForApplicationWeek } from '@/lib/applicationTime';

/** Live Clean Plate Score from DB (JWT can be stale after weekly reset). */
export async function GET() {
  try {
    await dbConnect();

    const { user, response } = await requireRoles(['STUDENT']);
    if (response) return response;

    return NextResponse.json({
      success: true,
      cleanPlateScore: scoreForApplicationWeek(user, await getApplicationTime()),
      wing: user.wing,
      role: user.role,
      name: user.name,
    });
  } catch (error) {
    console.error('[API Student Score GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
