import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import SystemState from '@/lib/models/SystemState';
import { requireRoles } from '@/lib/authorization';
import { demoMutationResponse } from '@/lib/demoLimits';
import { socketEventRoom } from '@/lib/accessPolicy';
import {
  getApplicationTime,
  isDateSimulationEnabled,
} from '@/lib/applicationTime';
import { formatISODate } from '@/lib/weekUtils';
import {
  ensureWeeklyScorePeriod,
  maybeResetScoresOnWeekRollover,
} from '@/lib/weeklyScoreReset';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// GET: Read the effective application date without creating state.
export async function GET() {
  try {
    await dbConnect();
    const applicationTime = await getApplicationTime();
    return NextResponse.json({
      success: true,
      date: formatISODate(applicationTime),
      dayOfWeekName: WEEKDAYS[applicationTime.getUTCDay()],
      simulationEnabled: isDateSimulationEnabled(),
    });
  } catch (error) {
    console.error('[API Simulate Date GET] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Advance simulated time without fabricating ratings or waste activity.
export async function POST() {
  try {
    const { user, response } = await requireRoles(['ADMIN']);
    if (response) return response;

    if (!isDateSimulationEnabled()) {
      return NextResponse.json(
        { success: false, error: 'Date simulation is disabled in this environment.' },
        { status: 403 }
      );
    }

    const rateLimitError = await demoMutationResponse(user);
    if (rateLimitError) return NextResponse.json(rateLimitError, { status: 429 });
    await dbConnect();
    await ensureWeeklyScorePeriod(await getApplicationTime());

    let prevDate;
    let nextDate;
    let advanced = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let state = await SystemState.findOne();
      if (!state) state = await SystemState.create({});

      prevDate = new Date(state.simulatedDate);
      nextDate = new Date(prevDate.getTime() + 24 * 60 * 60 * 1000);
      const result = await SystemState.updateOne(
        { _id: state._id, simulatedDate: prevDate },
        { $set: { simulatedDate: nextDate } }
      );
      if (result.modifiedCount === 1) {
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      return NextResponse.json(
        { success: false, error: 'Could not advance simulated time because it changed concurrently.' },
        { status: 409 }
      );
    }

    const scoreReset = await maybeResetScoresOnWeekRollover(prevDate, nextDate);
    const date = formatISODate(nextDate);
    const dayOfWeekName = WEEKDAYS[nextDate.getUTCDay()];

    if (global.io) {
      global.io.to(socketEventRoom('date-simulated')).emit('date-simulated', {
        date,
        dayOfWeek: dayOfWeekName,
        cleanPlateReset: !!scoreReset.rolled,
      });
    }

    let message = `Simulated date advanced to ${date} (${dayOfWeekName}).`;
    if (scoreReset.rolled && scoreReset.archived) {
      message += ` New week: Clean Plate Scores archived (hostel average ${scoreReset.hostelAvg}) and reset to 0.`;
    }

    return NextResponse.json({
      success: true,
      message,
      date,
      dayOfWeekName,
      cleanPlateReset: scoreReset.rolled
        ? {
            archived: scoreReset.archived,
            hostelAvg: scoreReset.hostelAvg,
            studentsReset: scoreReset.studentsReset,
            weekStart: scoreReset.weekStart,
          }
        : null,
    });
  } catch (error) {
    console.error('[API Simulate Date POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
