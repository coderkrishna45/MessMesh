import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import dbConnect from '@/lib/db';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import Dish from '@/lib/models/Dish';
import MealRating from '@/lib/models/MealRating';
import User from '@/lib/models/User';
import SystemState from '@/lib/models/SystemState';
import { authOptions } from '@/lib/auth';

// GET /api/vote?date=YYYY-MM-DD — menu dishes with average and user ratings
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
      let state = await SystemState.findOne();
      if (!state) {
        state = await SystemState.create({});
      }
      targetDate = new Date(state.simulatedDate);
    }
    targetDate.setUTCHours(0, 0, 0, 0);

    if (isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid date parameter' },
        { status: 400 }
      );
    }

    // Resolve stale session ID via email after reseeds; also read wing for menu override
    let studentWing = 'ALL';
    if (userId) {
      let dbUser = await User.findById(userId);
      if (!dbUser && session?.user?.email) {
        dbUser = await User.findOne({ email: session.user.email });
      }
      if (dbUser) {
        userId = dbUser._id.toString();
        studentWing = dbUser.wing || 'ALL';
      }
    }

    // Monday weekStartDate (UTC)
    const tempDate = new Date(targetDate);
    const day = tempDate.getUTCDay();
    const diff = tempDate.getUTCDate() - day + (day === 0 ? -6 : 1);
    const weekStartDate = new Date(Date.UTC(tempDate.getUTCFullYear(), tempDate.getUTCMonth(), diff));
    weekStartDate.setUTCHours(0, 0, 0, 0);

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekName = weekdays[targetDate.getUTCDay()];

    const allWeeklyItems = await WeeklyMenu.find({
      weekStartDate,
      dayOfWeek: dayOfWeekName,
    })
      .populate('dish')
      .exec();

    // Wing-specific menu overrides ALL
    let menuItems = [];
    const mealSlots = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];
    
    mealSlots.forEach((slot) => {
      let match = allWeeklyItems.find((item) => item.mealType === slot && item.wing === studentWing);
      if (!match) {
        match = allWeeklyItems.find((item) => item.mealType === slot && item.wing === 'ALL');
      }
      if (match) {
        menuItems.push(match);
      }
    });

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

    const menuWithRatings = await Promise.all(
      menuItems.map(async (item) => {
        const dishId = item.dish._id;

        const allRatings = await MealRating.find({ dish: dishId });
        const totalRatings = allRatings.length;
        const sum = allRatings.reduce((acc, curr) => acc + curr.rating, 0);
        const avgRating = totalRatings > 0 ? parseFloat((sum / totalRatings).toFixed(1)) : 0;

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
      date: targetDate.toISOString().split('T')[0],
      dayOfWeek: dayOfWeekName,
      weekStartDate: weekStartDate.toISOString().split('T')[0],
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

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please login.' },
        { status: 401 }
      );
    }

    const { dishId, rating, date } = await req.json();

    if (!dishId || rating === undefined || !date) {
      return NextResponse.json(
        { success: false, error: 'Missing dishId, rating, or date' },
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

    const userId = session.user.id;

    let user = await User.findById(userId);
    if (!user && session.user.email) {
      user = await User.findOne({ email: session.user.email });
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found. Please sign out and sign back in.' },
        { status: 404 }
      );
    }

    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    await MealRating.findOneAndUpdate(
      { user: user._id, dish: dishId, date: targetDate },
      { rating: ratingVal },
      { upsert: true, new: true }
    );

    const allRatings = await MealRating.find({ dish: dishId });
    const totalRatings = allRatings.length;
    const sum = allRatings.reduce((acc, curr) => acc + curr.rating, 0);
    const avgRating = totalRatings > 0 ? parseFloat((sum / totalRatings).toFixed(1)) : 0;

    if (global.io) {
      global.io.emit('rate-updated', {
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
