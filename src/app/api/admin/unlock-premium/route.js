import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import Dish from '@/lib/models/Dish';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import SystemState from '@/lib/models/SystemState';
import { requireRoles, VALID_WINGS } from '@/lib/authorization';
import { demoMutationResponse } from '@/lib/demoLimits';
import { socketEventRoom } from '@/lib/accessPolicy';

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
    const simulationEnabled =
      process.env.ENABLE_DATE_SIMULATION === 'true' &&
      (process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true');
    if ((simulateSunday || date) && !simulationEnabled) {
      return NextResponse.json(
        { success: false, error: 'Date overrides are disabled in this environment.' },
        { status: 403 }
      );
    }

    let targetDate;
    if (date) {
      targetDate = new Date(date);
    } else {
      let state = await SystemState.findOne();
      if (!state) {
        state = await SystemState.create({});
      }
      targetDate = new Date(state.simulatedDate);
    }
    targetDate.setUTCHours(0, 0, 0, 0);

    // Business rule: feast unlock is Saturday-only (plans Sunday meals)
    const isSaturday = targetDate.getUTCDay() === 6;

    if (!isSaturday && !simulateSunday) {
      return NextResponse.json(
        { success: false, error: 'Premium menu unlocks are only permitted on Saturdays (to plan Sunday meals).' },
        { status: 400 }
      );
    }

    // Business rule: wing average Clean Plate Score must be 90+
    const wingAvgResult = await User.aggregate([
      { $match: { role: 'STUDENT', wing: wardenWing } },
      { $group: { _id: null, avgScore: { $avg: '$cleanPlateScore' } } },
    ]);
    const avgScore = wingAvgResult.length > 0 ? Math.round(wingAvgResult[0].avgScore) : 0;

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
    const tempDate = new Date(targetDate);
    const dayOfWeek = tempDate.getUTCDay();
    const diff = tempDate.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStartDate = new Date(Date.UTC(tempDate.getUTCFullYear(), tempDate.getUTCMonth(), diff));
    weekStartDate.setUTCHours(0, 0, 0, 0);

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
    });
  } catch (error) {
    console.error('[API Unlock Premium POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
