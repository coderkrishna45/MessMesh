import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import Dish from '@/lib/models/Dish';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import { requireRoles, VALID_WINGS } from '@/lib/authorization';
import { demoMutationResponse } from '@/lib/demoLimits';
import { socketEventRoom } from '@/lib/accessPolicy';
import {
  applicationDateStart,
  getApplicationTime,
  isDateSimulationEnabled,
  scoreForApplicationWeek,
} from '@/lib/applicationTime';
import { formatISODate, getMondayUTC } from '@/lib/weekUtils';

// POST: Unlock Sunday Premium Feast for the warden's wing (Saturday-only, score 90+)
export async function POST(req) {
  try {
    await dbConnect();

    const { user, response } = await requireRoles(['WARDEN']);
    if (response) return response;
    const rateLimitError = await demoMutationResponse(user);
    if (rateLimitError) return NextResponse.json(rateLimitError, { status: 429 });

    const requestBody = await req.json().catch(() => ({}));
    const wardenWing = user.wing;
    if (!wardenWing || !VALID_WINGS.includes(wardenWing)) {
      return NextResponse.json(
        { success: false, error: 'Warden must be assigned to a specific hostel wing (A, B, C, or D).' },
        { status: 400 }
      );
    }

    const { simulateSunday, date } = requestBody;
    const simulationEnabled = isDateSimulationEnabled();
    if ((simulateSunday || date) && !simulationEnabled) {
      return NextResponse.json(
        { success: false, error: 'Date overrides are disabled in this environment.' },
        { status: 403 }
      );
    }

    const targetDate = applicationDateStart(
      date ? new Date(date) : await getApplicationTime()
    );
    if (Number.isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid date override.' },
        { status: 400 }
      );
    }

    // Business rule: feast unlock is Saturday-only (plans Sunday meals)
    const isSaturday = targetDate.getUTCDay() === 6;

    if (!isSaturday && !simulateSunday) {
      return NextResponse.json(
        { success: false, error: 'Premium menu unlocks are only permitted on Saturdays (to plan Sunday meals).' },
        { status: 400 }
      );
    }

    // Business rule: wing average Clean Plate Score must be 90+
    const wingStudents = await User.find({
      role: 'STUDENT',
      active: { $ne: false },
      wing: wardenWing,
    })
      .select('cleanPlateScore cleanPlateScoreWeekStart')
      .lean();
    const scoreTotal = wingStudents.reduce(
      (sum, student) => sum + scoreForApplicationWeek(student, targetDate),
      0
    );
    const avgScore = wingStudents.length
      ? Math.round(scoreTotal / wingStudents.length)
      : 0;

    if (avgScore < 90) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Eligibility block: ${wardenWing} average score is currently ${avgScore}/100. It must be 90+ to unlock the Sunday Feast.` 
        },
        { status: 400 }
      );
    }

    const premiumLunch = await Dish.findOne({ name: 'Sunday Premium Paneer Feast' });
    const premiumDinner = await Dish.findOne({ name: 'Sunday Premium Chicken Feast' });

    if (!premiumLunch || !premiumDinner) {
      return NextResponse.json(
        { success: false, error: 'Premium Sunday dishes are not seeded in the database. Please re-seed first.' },
        { status: 400 }
      );
    }

    // Monday of this week (UTC) — weekStartDate key for WeeklyMenu
    const weekStartDate = getMondayUTC(targetDate);

    // Wing-specific Sunday LUNCH/DINNER overrides (isPremium)
    await WeeklyMenu.findOneAndUpdate(
      { weekStartDate, dayOfWeek: 'Sunday', mealType: 'LUNCH', wing: wardenWing },
      { dish: premiumLunch._id, isPremium: true },
      { upsert: true, returnDocument: 'after' }
    );

    await WeeklyMenu.findOneAndUpdate(
      { weekStartDate, dayOfWeek: 'Sunday', mealType: 'DINNER', wing: wardenWing },
      { dish: premiumDinner._id, isPremium: true },
      { upsert: true, returnDocument: 'after' }
    );

    if (global.io) {
      global.io.to(socketEventRoom('feast-unlocked', wardenWing))
        .emit('feast-unlocked', { wing: wardenWing });
    }

    return NextResponse.json({
      success: true,
      message: `🎉 Premium Sunday Feast unlocked successfully for tomorrow in ${wardenWing}! Serving Sunday Premium Paneer Feast (Lunch) and Sunday Premium Chicken Feast (Dinner).`,
      wing: wardenWing,
      avgScore,
      weekStartDate: formatISODate(weekStartDate),
    });
  } catch (error) {
    console.error('[API Unlock Premium POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
