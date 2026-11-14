import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import SystemState from '@/lib/models/SystemState';
import User from '@/lib/models/User';
import Dish from '@/lib/models/Dish';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import MealRating from '@/lib/models/MealRating';
import WasteLog from '@/lib/models/WasteLog';
import { maybeResetScoresOnWeekRollover } from '@/lib/weeklyScoreReset';
import { ensureWeeklyMenu } from '@/lib/ensureWeeklyMenu';
import { requireRoles } from '@/lib/authorization';
import { demoMutationResponse } from '@/lib/demoLimits';
import { socketEventRoom } from '@/lib/accessPolicy';

// GET: Fetch current simulated date
export async function GET() {
  try {
    await dbConnect();

    let state = await SystemState.findOne();
    if (!state) {
      state = await SystemState.create({});
    }

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekName = weekdays[state.simulatedDate.getUTCDay()];

    return NextResponse.json({
      success: true,
      date: state.simulatedDate.toISOString().split('T')[0],
      dayOfWeekName,
    });
  } catch (error) {
    console.error('[API Simulate Date GET] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Increment date and simulate global logs for all accounts
export async function POST() {
  try {
    const simulationEnabled =
      process.env.ENABLE_DATE_SIMULATION === 'true' &&
      (process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true');
    if (!simulationEnabled) {
      return NextResponse.json(
        { success: false, error: 'Date simulation is disabled in this environment.' },
        { status: 403 }
      );
    }
    const { user, response } = await requireRoles(['ADMIN']);
    if (response) return response;
    const rateLimitError = await demoMutationResponse(user);
    if (rateLimitError) return NextResponse.json(rateLimitError, { status: 429 });
    await dbConnect();

    let state = await SystemState.findOne();
    if (!state) {
      state = await SystemState.create({});
    }

    const prevDate = new Date(state.simulatedDate);
    const nextDate = new Date(prevDate.getTime() + 24 * 60 * 60 * 1000);
    state.simulatedDate = nextDate;
    await state.save();

    // Sunday → Monday: archive Clean Plate Scores, reset all students to 0 for the new week
    // (Meal taste ratings are never reset — they stay in MealRating forever.)
    const scoreReset = await maybeResetScoresOnWeekRollover(prevDate, nextDate);

    const formattedDate = nextDate.toISOString().split('T')[0];
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekName = weekdays[nextDate.getUTCDay()];

    // Monday of target week (UTC; Sunday maps to previous Monday)
    const tempDate = new Date(nextDate);
    const day = tempDate.getUTCDay();
    const diff = tempDate.getUTCDate() - day + (day === 0 ? -6 : 1);
    const weekStartDate = new Date(Date.UTC(tempDate.getUTCFullYear(), tempDate.getUTCMonth(), diff));
    weekStartDate.setUTCHours(0, 0, 0, 0);

    await ensureWeeklyMenu(weekStartDate);

    const allWeeklyItems = await WeeklyMenu.find({
      weekStartDate,
      dayOfWeek: dayOfWeekName,
    }).populate('dish');

    const students = await User.find({ role: 'STUDENT' });
    const fallbackDish = await Dish.findOne({});

    for (const student of students) {
      const studentWing = student.wing || 'ALL';

      // Wing-specific menu overrides ALL for each meal slot
      const resolvedDishes = [];
      const slots = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];
      slots.forEach((slot) => {
        let match = allWeeklyItems.find((item) => item.mealType === slot && item.wing === studentWing);
        if (!match) {
          match = allWeeklyItems.find((item) => item.mealType === slot && item.wing === 'ALL');
        }
        if (match && match.dish) {
          resolvedDishes.push(match.dish);
        }
      });

      for (const dish of resolvedDishes) {
        const simulatedRating = Math.floor(Math.random() * 3) + 3; // 3, 4, or 5
        await MealRating.findOneAndUpdate(
          { user: student._id, dish: dish._id, date: nextDate },
          { rating: simulatedRating },
          { upsert: true, returnDocument: 'after' }
        );
      }

      // Simulate up to 4 meals/day with the same point map as /api/waste:
      // clean +10, minimal +5, ok 0, moderate -5, heavy -15
      // Typical net: ~+20–35 on good days; occasional -5 to -12 on bad days
      // so demos can climb from 0 → 90+ within a week of "Next Day" clicks.
      const wastePointDelta = (level) => {
        switch (level) {
          case 1: return 10;
          case 2: return 5;
          case 3: return 0;
          case 4: return -5;
          case 5: return -15;
          default: return 0;
        }
      };

      // Weighted waste level: mostly clean plates, rare heavy waste
      const rollWasteLevel = () => {
        const r = Math.random();
        if (r < 0.55) return 1; // clean
        if (r < 0.78) return 2; // minimal
        if (r < 0.90) return 3; // ok
        if (r < 0.97) return 4; // moderate
        return 5; // heavy
      };

      const mealCount = Math.max(resolvedDishes.length, 4);
      let dayPoints = 0;
      let wasteSum = 0;
      for (let m = 0; m < mealCount; m++) {
        const level = rollWasteLevel();
        wasteSum += level;
        dayPoints += wastePointDelta(level);
      }
      const avgWasteLevel = Math.max(1, Math.min(5, Math.round(wasteSum / mealCount)));

      const activeDish = resolvedDishes[0] || fallbackDish;
      await WasteLog.findOneAndUpdate(
        { user: student._id, date: nextDate },
        {
          wasteLevel: avgWasteLevel,
          dish: activeDish?._id,
          wing: studentWing,
          imageUrl:
            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60',
        },
        { upsert: true, returnDocument: 'after' }
      );

      const current = student.cleanPlateScore ?? 0;
      student.cleanPlateScore = Math.max(0, Math.min(100, current + dayPoints));
      await student.save();
    }

    if (global.io) {
      global.io.to(socketEventRoom('date-simulated')).emit('date-simulated', {
        date: formattedDate,
        dayOfWeek: dayOfWeekName,
        cleanPlateReset: !!scoreReset.rolled,
      });
    }

    let message = `Simulated date advanced to ${formattedDate} (${dayOfWeekName}). Ratings and waste logs simulated for ${students.length} students.`;
    if (scoreReset.rolled && scoreReset.archived) {
      message += ` New week: Clean Plate Scores archived (hostel avg was ${scoreReset.hostelAvg}) and reset to 0.`;
    }

    return NextResponse.json({
      success: true,
      message,
      date: formattedDate,
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
