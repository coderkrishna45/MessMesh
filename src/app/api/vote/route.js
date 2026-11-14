import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import dbConnect from '@/lib/db';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import MealRating from '@/lib/models/MealRating';
import { authOptions } from '@/lib/auth';
import { getMondayUTC, formatISODate } from '@/lib/weekUtils';
import { getCurrentUser, requireRoles } from '@/lib/authorization';
import { demoMutationResponse } from '@/lib/demoLimits';
import { socketEventRoom } from '@/lib/accessPolicy';
import { applicationDateStart, getApplicationTime } from '@/lib/applicationTime';

// GET /api/vote?date=YYYY-MM-DD — menu dishes with cumulative taste averages
// (Meal ratings never weekly-reset; Clean Plate Score is separate.)
export async function GET(req) {
  try {
    await dbConnect();

    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');

    let targetDate;
    if (dateParam) {
      targetDate = new Date(dateParam);
    } else {
      targetDate = await getApplicationTime();
    }
    targetDate = applicationDateStart(targetDate);

    if (isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid date parameter' },
        { status: 400 }
      );
    }

    let studentWing = 'ALL';
    if (userId) {
      const { user, response } = await getCurrentUser();
      if (response) return response;
      userId = user._id.toString();
      studentWing = user.wing || 'ALL';
    }

    const weekStartDate = getMondayUTC(targetDate);
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

    let menuItems = [];
    const mealSlots = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];

    mealSlots.forEach((slot) => {
      let match = allWeeklyItems.find(
        (item) => item.mealType === slot && item.wing === studentWing
      );
      if (!match) {
        match = allWeeklyItems.find(
          (item) => item.mealType === slot && item.wing === 'ALL'
        );
      }
      if (match) {
        menuItems.push(match);
      }
    });

    const menuWithRatings = await Promise.all(
      menuItems.map(async (item) => {
        const dishId = item.dish._id;

        // Cumulative taste ratings (all history — never weekly-reset)
        const allRatings = await MealRating.find({ dish: dishId });
        const totalRatings = allRatings.length;
        const sum = allRatings.reduce((acc, curr) => acc + curr.rating, 0);
        const avgRating =
          totalRatings > 0 ? parseFloat((sum / totalRatings).toFixed(1)) : 0;

        let userRating = 0;
        if (userId) {
          const ratingDoc = await MealRating.findOne({
            user: userId,
            dish: dishId,
            date: targetDate,
          });
          if (ratingDoc) {
            userRating = ratingDoc.rating;
          }
        }

        return {
          mealType: item.mealType,
          dish: item.dish,
          isPremium: item.isPremium || false,
          avgRating,
          totalRatings,
          userRating,
        };
      })
    );

    return NextResponse.json({
      success: true,
      date: formatISODate(targetDate),
      dayOfWeek: dayOfWeekName,
      weekStartDate: formatISODate(weekStartDate),
      menu: menuWithRatings,
    });
  } catch (error) {
    console.error('[API Vote GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/vote — submit or update a taste rating
export async function POST(req) {
  try {
    await dbConnect();

    const { user, response } = await requireRoles(['STUDENT']);
    if (response) return response;
    const rateLimitError = await demoMutationResponse(user);
    if (rateLimitError) return NextResponse.json(rateLimitError, { status: 429 });

    const { dishId, rating } = await req.json();

    if (!dishId || rating === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing dishId or rating' },
        { status: 400 }
      );
    }

    const ratingVal = parseInt(rating, 10);
    if (isNaN(ratingVal) || ratingVal < 1 || ratingVal > 5) {
      return NextResponse.json(
        { success: false, error: 'Rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    const targetDate = applicationDateStart(await getApplicationTime());

    await MealRating.findOneAndUpdate(
      { user: user._id, dish: dishId, date: targetDate },
      { rating: ratingVal },
      { upsert: true, returnDocument: 'after' }
    );

    const allRatings = await MealRating.find({ dish: dishId });
    const totalRatings = allRatings.length;
    const sum = allRatings.reduce((acc, curr) => acc + curr.rating, 0);
    const avgRating =
      totalRatings > 0 ? parseFloat((sum / totalRatings).toFixed(1)) : 0;

    if (global.io) {
      global.io.to(socketEventRoom('rate-updated')).emit('rate-updated', {
        dishId,
        avgRating,
        totalRatings,
      });
    }

    return NextResponse.json({
      success: true,
      userRating: ratingVal,
      avgRating,
      totalRatings,
    });
  } catch (error) {
    console.error('[API Vote POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
