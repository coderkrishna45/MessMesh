import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import WasteLog from '@/lib/models/WasteLog';
import { requireRoles } from '@/lib/authorization';
import { demoMutationResponse } from '@/lib/demoLimits';
import { socketEventRoom } from '@/lib/accessPolicy';
import { applicationDateStart, getApplicationTime } from '@/lib/applicationTime';
import { recordCleanPlateScoreDelta } from '@/lib/weeklyScoreReset';

// POST /api/waste — log plate waste and update Clean Plate Score
export async function POST(req) {
  try {
    await dbConnect();

    const { user, response } = await requireRoles(['STUDENT']);
    if (response) return response;
    const rateLimitError = await demoMutationResponse(user);
    if (rateLimitError) return NextResponse.json(rateLimitError, { status: 429 });

    const { dishId, wasteLevel, imageUrl } = await req.json();

    if (!dishId || !wasteLevel) {
      return NextResponse.json(
        { success: false, error: 'Missing dishId or wasteLevel' },
        { status: 400 }
      );
    }

    const parsedWasteLevel = parseInt(wasteLevel, 10);
    if (isNaN(parsedWasteLevel) || parsedWasteLevel < 1 || parsedWasteLevel > 5) {
      return NextResponse.json(
        { success: false, error: 'wasteLevel must be between 1 and 5' },
        { status: 400 }
      );
    }

    // Clean Plate Score delta by waste level (1 clean … 5 heavy)
    let pointsDelta = 0;
    switch (parsedWasteLevel) {
      case 1: pointsDelta = 10; break;
      case 2: pointsDelta = 5; break;
      case 3: pointsDelta = 0; break;
      case 4: pointsDelta = -5; break;
      case 5: pointsDelta = -15; break;
    }

    const logDate = applicationDateStart(await getApplicationTime());
    const updatedUser = await recordCleanPlateScoreDelta(
      user._id,
      pointsDelta,
      logDate
    );
    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: 'Student account no longer exists.' },
        { status: 404 }
      );
    }

    const newLog = await WasteLog.create({
      user: user._id,
      dish: dishId,
      wasteLevel: parsedWasteLevel,
      imageUrl: imageUrl || '',
      wing: user.wing,
      date: logDate,
    });

    // Notify wardens on high waste (4 moderate / 5 heavy)
    const alertRoom = socketEventRoom('high-waste-logged', user.wing);
    if (parsedWasteLevel >= 4 && global.io && alertRoom) {
      global.io.to(alertRoom).emit('high-waste-logged', {
        wing: user.wing,
        wasteLevel: parsedWasteLevel,
        studentName: user.name,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Waste log submitted successfully!',
      log: newLog,
      pointsEarned: pointsDelta,
      newScore: updatedUser.cleanPlateScore,
    });
  } catch (error) {
    console.error('[API Waste POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
