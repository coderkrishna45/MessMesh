import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import dbConnect from '@/lib/db';
import WeeklyPoll from '@/lib/models/WeeklyPoll';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import Dish from '@/lib/models/Dish';
import SystemState from '@/lib/models/SystemState';
import { authOptions } from '@/lib/auth';

// POST: Preview or publish next week's menu from the active poll
export async function POST(req) {
  try {
    await dbConnect();

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'WARDEN') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Warden privileges required.' },
        { status: 403 }
      );
    }

    const { action } = await req.json();

    if (action !== 'preview' && action !== 'publish') {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Specify "preview" or "publish".' },
        { status: 400 }
      );
    }

    const activePoll = await WeeklyPoll.findOne({ status: 'ACTIVE' }).populate('dishes.dish').exec();
    if (!activePoll) {
      return NextResponse.json(
        { success: false, error: 'No active poll found to compile menu from.' },
        { status: 400 }
      );
    }

    const sortedOptions = [...activePoll.dishes].sort((a, b) => b.votes - a.votes);
    
    if (sortedOptions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Active poll has no dish options listed.' },
        { status: 400 }
      );
    }

    // Next week's Monday relative to simulated date (UTC)
    let state = await SystemState.findOne();
    if (!state) {
      state = await SystemState.create({});
    }
    const today = new Date(state.simulatedDate);
    const day = today.getUTCDay();
    const diff = today.getUTCDate() - day + (day === 0 ? -6 : 1);
    const thisMonday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), diff));
    thisMonday.setUTCHours(0, 0, 0, 0);

    const nextMonday = new Date(thisMonday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    if (action === 'preview') {
      const draftMenu = [];

      weekdays.forEach((dayName, index) => {
        const breakfastDish = sortedOptions[index % sortedOptions.length].dish;
        const lunchDish = sortedOptions[(index + 1) % sortedOptions.length].dish;
        const snacksDish = sortedOptions[(index + 2) % sortedOptions.length].dish;
        const dinnerDish = sortedOptions[(index + 3) % sortedOptions.length].dish;

        draftMenu.push(
          { dayOfWeek: dayName, mealType: 'BREAKFAST', dish: { name: breakfastDish.name, category: breakfastDish.category } },
          { dayOfWeek: dayName, mealType: 'LUNCH', dish: { name: lunchDish.name, category: lunchDish.category } },
          { dayOfWeek: dayName, mealType: 'SNACKS', dish: { name: snacksDish.name, category: snacksDish.category } },
          { dayOfWeek: dayName, mealType: 'DINNER', dish: { name: dinnerDish.name, category: dinnerDish.category } }
        );
      });

      return NextResponse.json({
        success: true,
        weekStartDate: nextMonday.toISOString().split('T')[0],
        draftMenu,
      });
    }

    const menuAssignments = [];

    weekdays.forEach((dayName, index) => {
      const breakfastDishId = sortedOptions[index % sortedOptions.length].dish._id;
      const lunchDishId = sortedOptions[(index + 1) % sortedOptions.length].dish._id;
      const snacksDishId = sortedOptions[(index + 2) % sortedOptions.length].dish._id;
      const dinnerDishId = sortedOptions[(index + 3) % sortedOptions.length].dish._id;

      menuAssignments.push(
        { weekStartDate: nextMonday, dayOfWeek: dayName, mealType: 'BREAKFAST', dish: breakfastDishId },
        { weekStartDate: nextMonday, dayOfWeek: dayName, mealType: 'LUNCH', dish: lunchDishId },
        { weekStartDate: nextMonday, dayOfWeek: dayName, mealType: 'SNACKS', dish: snacksDishId },
        { weekStartDate: nextMonday, dayOfWeek: dayName, mealType: 'DINNER', dish: dinnerDishId }
      );
    });

    await WeeklyMenu.deleteMany({ weekStartDate: nextMonday });
    const compiledMenu = await WeeklyMenu.create(menuAssignments);

    // SAFETY CHECK: only archive the active poll and open a new one if next week's poll
    // was not already generated in a previous publish cycle.
    const existingNextPoll = await WeeklyPoll.findOne({ weekStartDate: nextMonday });
    
    if (!existingNextPoll) {
      activePoll.status = 'ARCHIVED';
      await activePoll.save();

      const allDishes = await Dish.find({});
      const freshPollDishes = allDishes.map((dish) => ({
        dish: dish._id,
        votes: 0,
        voters: [],
      }));

      await WeeklyPoll.create({
        weekStartDate: nextMonday,
        dishes: freshPollDishes,
        status: 'ACTIVE',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Next week\'s menu published successfully!',
      weekStartDate: nextMonday.toISOString().split('T')[0],
      dishesScheduled: compiledMenu.length,
      nextPollGenerated: !existingNextPoll,
    });
  } catch (error) {
    console.error('[API Generate Menu POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
