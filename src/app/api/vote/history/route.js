import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import MealRating from '@/lib/models/MealRating';
import { formatISODate, getMondayUTC } from '@/lib/weekUtils';
import { requireRoles } from '@/lib/authorization';
import { getApplicationTime } from '@/lib/applicationTime';

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];

function dayKey(d) {
  return new Date(d).toISOString().split('T')[0];
}

// GET /api/vote/history?weekOffset=0|1|2|3 — student's weekly rating history matrix
export async function GET(req) {
  try {
    await dbConnect();

    const { user, response } = await requireRoles(['STUDENT']);
    if (response) return response;

    const { searchParams } = new URL(req.url);
    let weekOffset = parseInt(searchParams.get('weekOffset') || '0', 10);
    if (isNaN(weekOffset) || weekOffset < 0 || weekOffset > 3) weekOffset = 0;

    const currentMonday = getMondayUTC(await getApplicationTime());
    const targetMonday = new Date(currentMonday);
    targetMonday.setUTCDate(targetMonday.getUTCDate() - weekOffset * 7);

    const endOfWeek = new Date(targetMonday);
    endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 7);

    const menuItems = await WeeklyMenu.find({
      weekStartDate: targetMonday,
      $or: [{ wing: 'ALL' }, { wing: user.wing }, { wing: { $exists: false } }],
    })
      .populate('dish')
      .exec();

    // Prefer wing-specific rows, else ALL
    const pickMenu = (dayOfWeek, mealType) => {
      const wingMatch = menuItems.find(
        (m) =>
          m.dayOfWeek === dayOfWeek &&
          m.mealType === mealType &&
          m.wing === user.wing &&
          m.dish
      );
      if (wingMatch) return wingMatch;
      return menuItems.find(
        (m) =>
          m.dayOfWeek === dayOfWeek &&
          m.mealType === mealType &&
          (m.wing === 'ALL' || !m.wing) &&
          m.dish
      );
    };

    const userRatings = await MealRating.find({
      user: user._id,
      date: { $gte: targetMonday, $lt: endOfWeek },
    }).exec();

    const ratingsByDayDish = new Map();
    userRatings.forEach((r) => {
      const key = `${dayKey(r.date)}::${r.dish.toString()}`;
      ratingsByDayDish.set(key, r.rating);
    });

    const historyData = [];

    for (const dayOfWeek of WEEKDAYS) {
      const dayIndex = WEEKDAYS.indexOf(dayOfWeek);
      const mealDate = new Date(targetMonday);
      mealDate.setUTCDate(mealDate.getUTCDate() + dayIndex);
      mealDate.setUTCHours(0, 0, 0, 0);
      const dateStr = formatISODate(mealDate);

      for (const mealType of MEAL_TYPES) {
        const menuRow = pickMenu(dayOfWeek, mealType);
        if (!menuRow?.dish) {
          historyData.push({
            dayOfWeek,
            mealType,
            dishName: '—',
            dishId: null,
            date: dateStr,
            rating: 0,
          });
          continue;
        }

        const dishId = menuRow.dish._id.toString();
        const rating =
          ratingsByDayDish.get(`${dateStr}::${dishId}`) || 0;

        historyData.push({
          dayOfWeek,
          mealType,
          dishName: menuRow.dish.name,
          dishId,
          date: dateStr,
          rating,
          isPremium: !!menuRow.isPremium,
        });
      }
    }

    let weekLabel = 'Current Week';
    if (weekOffset === 1) weekLabel = '1 Week Ago';
    if (weekOffset === 2) weekLabel = '2 Weeks Ago';
    if (weekOffset === 3) weekLabel = '3 Weeks Ago';

    return NextResponse.json({
      success: true,
      weekStartDate: formatISODate(targetMonday),
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
