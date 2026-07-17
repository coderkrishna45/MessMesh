import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import dbConnect from '@/lib/db';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import MealRating from '@/lib/models/MealRating';
import User from '@/lib/models/User';
import SystemState from '@/lib/models/SystemState';
import { authOptions } from '@/lib/auth';

// GET /api/vote/history?weekOffset=0|1|2 — student's weekly rating history
export async function GET(req) {
  try {
    await dbConnect();

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please login.' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Resolve stale session ID via email after reseeds
    let user = await User.findById(userId);
    if (!user && session.user.email) {
      user = await User.findOne({ email: session.user.email });
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const offsetParam = searchParams.get('weekOffset') || '0';
    let weekOffset = parseInt(offsetParam, 10);
    if (isNaN(weekOffset) || weekOffset < 0 || weekOffset > 2) {
      weekOffset = 0;
    }

    // Target Monday relative to simulated date (UTC); weekOffset steps back by full weeks
    let state = await SystemState.findOne();
    if (!state) {
      state = await SystemState.create({});
    }
    const today = new Date(state.simulatedDate);
    const day = today.getUTCDay();
    const diff = today.getUTCDate() - day + (day === 0 ? -6 : 1);
    const currentMonday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), diff));
    currentMonday.setUTCHours(0, 0, 0, 0);

    const targetMonday = new Date(currentMonday);
    targetMonday.setUTCDate(targetMonday.getUTCDate() - (weekOffset * 7));

    const endOfWeek = new Date(targetMonday);
    endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 7);

    const menuItems = await WeeklyMenu.find({
      weekStartDate: targetMonday,
    })
      .populate('dish')
      .exec();

    const userRatings = await MealRating.find({
      user: user._id,
      date: { $gte: targetMonday, $lt: endOfWeek },
    }).exec();

    const weekdaysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const historyData = menuItems.map((item) => {
      const dayIndex = weekdaysMap.indexOf(item.dayOfWeek);
      
      // Monday = targetMonday + 0 … Sunday = targetMonday + 6
      const dayOffset = dayIndex === 0 ? 6 : dayIndex - 1;
      const mealDate = new Date(targetMonday);
      mealDate.setUTCDate(mealDate.getUTCDate() + dayOffset);
      mealDate.setUTCHours(0, 0, 0, 0);

      const ratingDoc = userRatings.find((r) => {
        const ratingDate = new Date(r.date);
        ratingDate.setUTCHours(0, 0, 0, 0);
        return r.dish.toString() === item.dish._id.toString() && ratingDate.getTime() === mealDate.getTime();
      });

      return {
        dayOfWeek: item.dayOfWeek,
        mealType: item.mealType,
        dishName: item.dish.name,
        rating: ratingDoc ? ratingDoc.rating : 0,
      };
    });

    let weekLabel = 'Current Week';
    if (weekOffset === 1) weekLabel = '1 Week Ago';
    if (weekOffset === 2) weekLabel = '2 Weeks Ago';

    return NextResponse.json({
      success: true,
      weekStartDate: targetMonday.toISOString().split('T')[0],
      weekLabel,
      history: historyData,
    });
  } catch (error) {
    console.error('[API History GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
