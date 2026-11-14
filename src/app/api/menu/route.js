import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import dbConnect from '@/lib/db';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import Dish from '@/lib/models/Dish';
import SystemState from '@/lib/models/SystemState';
import { authOptions } from '@/lib/auth';
import { getCurrentUser, VALID_WINGS } from '@/lib/authorization';

// GET /api/menu?date=YYYY-MM-DD — daily menu for a wing
export async function GET(req) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    let wingParam = null;
    
    let targetDate;
    if (dateParam) {
      targetDate = new Date(dateParam);
    } else {
      // Default to globally synchronized simulated date
      let state = await SystemState.findOne();
      if (!state) {
        state = await SystemState.create({});
      }
      targetDate = new Date(state.simulatedDate);
    }

    if (isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid date parameter' },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    if (session?.user) {
      const { user, response } = await getCurrentUser();
      if (response) return response;
      wingParam =
        user.role === 'ADMIN'
          ? searchParams.get('wing') || 'ALL'
          : user.wing;
    }
    if (wingParam && wingParam !== 'ALL' && !VALID_WINGS.includes(wingParam)) {
      return NextResponse.json({ success: false, error: 'Invalid wing.' }, { status: 400 });
    }
    const activeWing = wingParam || 'ALL';

    // Monday of target date (UTC) + ensure a full varied menu exists for the week
    const { getMondayUTC } = await import('@/lib/weekUtils');
    const { ensureWeeklyMenu } = await import('@/lib/ensureWeeklyMenu');
    const weekStartDate = getMondayUTC(targetDate);
    await ensureWeeklyMenu(weekStartDate);

    const weekdays = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const dayOfWeekName = weekdays[targetDate.getUTCDay()];

    const allWeeklyItems = await WeeklyMenu.find({
      weekStartDate,
      dayOfWeek: dayOfWeekName,
    })
      .populate('dish')
      .exec();

    // Wing-specific entries override wing === 'ALL' for each meal slot
    let menuItems = [];
    const mealSlots = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];
    
    mealSlots.forEach((slot) => {
      let match = allWeeklyItems.find((item) => item.mealType === slot && item.wing === activeWing);
      if (!match) {
        match = allWeeklyItems.find((item) => item.mealType === slot && item.wing === 'ALL');
      }
      if (match) {
        menuItems.push(match);
      }
    });

    // Fallback when no WeeklyMenu rows exist for this week
    if (menuItems.length === 0) {
      const defaultDishes = await Dish.find({}).limit(4);
      const mockTypes = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];
      
      menuItems = defaultDishes.map((dish, i) => ({
        weekStartDate,
        dayOfWeek: dayOfWeekName,
        mealType: mockTypes[i] || 'LUNCH',
        dish: dish,
      }));
    }

    return NextResponse.json({
      success: true,
      date: targetDate.toISOString().split('T')[0],
      dayOfWeek: dayOfWeekName,
      weekStartDate: weekStartDate.toISOString().split('T')[0],
      resolvedWing: activeWing,
      menu: menuItems.map((item) => ({
        mealType: item.mealType,
        dish: item.dish,
        isPremium: item.isPremium || false,
      })),
    });
  } catch (error) {
    console.error('[API Menu GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
