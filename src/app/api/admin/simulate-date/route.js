import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import SystemState from '@/lib/models/SystemState';
import User from '@/lib/models/User';
import Dish from '@/lib/models/Dish';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import MealRating from '@/lib/models/MealRating';
import WasteLog from '@/lib/models/WasteLog';

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
    await dbConnect();

    let state = await SystemState.findOne();
    if (!state) {
      state = await SystemState.create({});
    }

    const prevDate = new Date(state.simulatedDate);
    const nextDate = new Date(prevDate.getTime() + 24 * 60 * 60 * 1000);
    state.simulatedDate = nextDate;
    await state.save();

    const formattedDate = nextDate.toISOString().split('T')[0];
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekName = weekdays[nextDate.getUTCDay()];

    // Monday of target week (UTC; Sunday maps to previous Monday)
    const tempDate = new Date(nextDate);
    const day = tempDate.getUTCDay();
    const diff = tempDate.getUTCDate() - day + (day === 0 ? -6 : 1);
    const weekStartDate = new Date(Date.UTC(tempDate.getUTCFullYear(), tempDate.getUTCMonth(), diff));
    weekStartDate.setUTCHours(0, 0, 0, 0);

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
          { upsert: true, new: true }
        );
      }

      // Waste: 1 = zero waste (clean plate), 2 = minimal
      const simulatedWaste = Math.random() > 0.6 ? 2 : 1; // 60% chance of clean plate
      const activeDish = resolvedDishes[0] || fallbackDish;

      await WasteLog.findOneAndUpdate(
        { user: student._id, date: nextDate },
        { 
          wasteLevel: simulatedWaste,
          dish: activeDish?._id,
          wing: studentWing,
          imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60',
        },
        { upsert: true, new: true }
      );

      // Clean plate progress (capped at 100; feast unlock needs wing avg 90+)
      const pointsGained = simulatedWaste === 1 ? 5 : 2;
      student.cleanPlateScore = Math.min(100, student.cleanPlateScore + pointsGained);
      await student.save();
    }

    if (global.io) {
      global.io.emit('date-simulated', {
        date: formattedDate,
        dayOfWeek: dayOfWeekName,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Simulated date advanced to ${formattedDate} (${dayOfWeekName}). Rating reviews and waste logs successfully simulated for all ${students.length} students!`,
      date: formattedDate,
      dayOfWeekName,
    });
  } catch (error) {
    console.error('[API Simulate Date POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
