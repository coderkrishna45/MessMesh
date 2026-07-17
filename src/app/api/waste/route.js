import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import dbConnect from '@/lib/db';
import WasteLog from '@/lib/models/WasteLog';
import User from '@/lib/models/User';
import SystemState from '@/lib/models/SystemState';
import { authOptions } from '@/lib/auth';

// POST /api/waste — log plate waste and update Clean Plate Score
export async function POST(req) {
  try {
    await dbConnect();

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please login.' },
        { status: 401 }
      );
    }

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

    const userId = session.user.id;

    // Fall back to email if session ID is stale after a reseed
    let user = await User.findById(userId);
    if (!user && session.user.email) {
      user = await User.findOne({ email: session.user.email });
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found. Please sign out and sign back in.' },
        { status: 404 }
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

    // Score clamped to 0–100
    const oldScore = user.cleanPlateScore || 100;
    const newScore = Math.max(0, Math.min(100, oldScore + pointsDelta));
    user.cleanPlateScore = newScore;
    await user.save();

    let state = await SystemState.findOne();
    if (!state) {
      state = await SystemState.create({});
    }
    const logDate = new Date(state.simulatedDate);

    const newLog = await WasteLog.create({
      user: user._id,
      dish: dishId,
      wasteLevel: parsedWasteLevel,
      imageUrl: imageUrl || '',
      wing: user.wing,
      date: logDate,
    });

    // Notify wardens on high waste (4 moderate / 5 heavy)
    if (parsedWasteLevel >= 4 && global.io) {
      global.io.emit('high-waste-logged', {
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
      newScore: user.cleanPlateScore,
    });
  } catch (error) {
    console.error('[API Waste POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
