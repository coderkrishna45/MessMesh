import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import WeeklyPoll from '@/lib/models/WeeklyPoll';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import Dish from '@/lib/models/Dish';
import MealRating from '@/lib/models/MealRating';
import { getMondayUTC, formatISODate } from '@/lib/weekUtils';
import { requireRoles } from '@/lib/authorization';
import { demoMutationResponse } from '@/lib/demoLimits';
import { getApplicationTime } from '@/lib/applicationTime';
import { ensureWeeklyMenu, withWeeklyMenuLock } from '@/lib/ensureWeeklyMenu';

/**
 * Rank dishes for next week's menu primarily by *previous week* taste ratings.
 * Poll votes are a fallback/tie-breaker so historical ratings stay available
 * but only last week's stars drive the new schedule.
 */
async function rankDishesForNextWeek(activePoll, thisMonday) {
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const prevWeekEnd = new Date(thisMonday); // exclusive end = this Monday

  const weekRatings = await MealRating.aggregate([
    {
      $match: {
        date: { $gte: prevMonday, $lt: prevWeekEnd },
      },
    },
    {
      $group: {
        _id: '$dish',
        avgRating: { $avg: '$rating' },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  const ratingByDish = new Map(
    weekRatings.map((r) => [
      r._id.toString(),
      {
        avgRating: r.avgRating || 0,
        ratingCount: r.ratingCount || 0,
      },
    ])
  );

  const scored = activePoll.dishes.map((entry) => {
    const dish = entry.dish;
    const id = dish._id.toString();
    const r = ratingByDish.get(id) || { avgRating: 0, ratingCount: 0 };
    return {
      dish,
      votes: entry.votes || 0,
      weekAvgRating: r.avgRating,
      weekRatingCount: r.ratingCount,
    };
  });

  // Prefer previous-week taste avg, then sample size, then poll votes
  scored.sort((a, b) => {
    if (b.weekAvgRating !== a.weekAvgRating) return b.weekAvgRating - a.weekAvgRating;
    if (b.weekRatingCount !== a.weekRatingCount) return b.weekRatingCount - a.weekRatingCount;
    return b.votes - a.votes;
  });

  return {
    sortedOptions: scored,
    rankingSource:
      weekRatings.length > 0
        ? 'previous_week_meal_ratings'
        : 'poll_votes_fallback',
    previousWeekStart: formatISODate(prevMonday),
  };
}

// POST: Preview or publish next week's menu
export async function POST(req) {
  try {
    await dbConnect();

    const { user, response } = await requireRoles(['ADMIN', 'WARDEN']);
    if (response) return response;
    const rateLimitError = await demoMutationResponse(user);
    if (rateLimitError) return NextResponse.json(rateLimitError, { status: 429 });

    const body = await req.json();
    const { action } = body;
    if (action === 'publish' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Only administrators may publish the shared menu.' },
        { status: 403 }
      );
    }

    if (action === 'initialize') {
      if (user.role !== 'ADMIN') {
        return NextResponse.json(
          { success: false, error: 'Only administrators may initialize a menu.' },
          { status: 403 }
        );
      }

      const applicationTime = await getApplicationTime();
      if (
        body.weekStartDate !== undefined &&
        !/^\d{4}-\d{2}-\d{2}$/.test(body.weekStartDate)
      ) {
        return NextResponse.json(
          { success: false, error: 'weekStartDate must be a Monday in YYYY-MM-DD format.' },
          { status: 400 }
        );
      }
      const weekStart = body.weekStartDate
        ? new Date(`${body.weekStartDate}T00:00:00.000Z`)
        : getMondayUTC(applicationTime);
      if (
        Number.isNaN(weekStart.getTime()) ||
        formatISODate(getMondayUTC(weekStart)) !== formatISODate(weekStart)
      ) {
        return NextResponse.json(
          { success: false, error: 'weekStartDate must be a Monday in YYYY-MM-DD format.' },
          { status: 400 }
        );
      }
      const initialized = await ensureWeeklyMenu(weekStart);
      return NextResponse.json({
        success: true,
        initialized,
        weekStartDate: formatISODate(weekStart),
      });
    }

    if (action !== 'preview' && action !== 'publish') {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Specify "preview" or "publish".' },
        { status: 400 }
      );
    }

    const activePoll = await WeeklyPoll.findOne({ status: 'ACTIVE' })
      .populate('dishes.dish')
      .exec();
    if (!activePoll) {
      return NextResponse.json(
        { success: false, error: 'No active poll found to compile menu from.' },
        { status: 400 }
      );
    }

    if (!activePoll.dishes?.length) {
      return NextResponse.json(
        { success: false, error: 'Active poll has no dish options listed.' },
        { status: 400 }
      );
    }

    const thisMonday = getMondayUTC(await getApplicationTime());
    const nextMonday = new Date(thisMonday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    const { sortedOptions, rankingSource, previousWeekStart } =
      await rankDishesForNextWeek(activePoll, thisMonday);

    const weekdays = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];

    if (action === 'preview') {
      const draftMenu = [];

      weekdays.forEach((dayName, index) => {
        const breakfastDish = sortedOptions[index % sortedOptions.length].dish;
        const lunchDish = sortedOptions[(index + 1) % sortedOptions.length].dish;
        const snacksDish = sortedOptions[(index + 2) % sortedOptions.length].dish;
        const dinnerDish = sortedOptions[(index + 3) % sortedOptions.length].dish;

        draftMenu.push(
          {
            dayOfWeek: dayName,
            mealType: 'BREAKFAST',
            dish: { name: breakfastDish.name, category: breakfastDish.category },
          },
          {
            dayOfWeek: dayName,
            mealType: 'LUNCH',
            dish: { name: lunchDish.name, category: lunchDish.category },
          },
          {
            dayOfWeek: dayName,
            mealType: 'SNACKS',
            dish: { name: snacksDish.name, category: snacksDish.category },
          },
          {
            dayOfWeek: dayName,
            mealType: 'DINNER',
            dish: { name: dinnerDish.name, category: dinnerDish.category },
          }
        );
      });

      return NextResponse.json({
        success: true,
        weekStartDate: formatISODate(nextMonday),
        draftMenu,
        rankingSource,
        previousWeekStart,
      });
    }

    const publishResult = await withWeeklyMenuLock(nextMonday, async () => {
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

      return {
        compiledMenu,
        nextPollGenerated: !existingNextPoll,
      };
    });

    return NextResponse.json({
      success: true,
      message:
        "Next week's menu published successfully (ranked by previous week's meal ratings).",
      weekStartDate: formatISODate(nextMonday),
      dishesScheduled: publishResult.compiledMenu.length,
      nextPollGenerated: publishResult.nextPollGenerated,
      rankingSource,
      previousWeekStart,
    });
  } catch (error) {
    console.error('[API Generate Menu POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
