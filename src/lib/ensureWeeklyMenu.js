import Dish from '@/lib/models/Dish';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import { DISHES_CATALOG, PREMIUM_DISH_NAMES } from '@/lib/dishesCatalog';
import { getMondayUTC } from '@/lib/weekUtils';

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const SLOTS = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];

/**
 * Ensure dish catalog exists in DB (upsert by name).
 */
export async function ensureDishCatalog() {
  for (const d of DISHES_CATALOG) {
    await Dish.findOneAndUpdate(
      { name: d.name },
      {
        name: d.name,
        category: d.category,
        isVeg: d.isVeg,
        image: d.image,
      },
      { upsert: true, returnDocument: 'after' }
    );
  }
  return Dish.find({});
}

function pickRotated(list, dayIndex, weekSalt, slotSalt) {
  if (!list.length) return null;
  // Offset by week so consecutive weeks don't clone the same Mon→Sun sequence
  const start = (weekSalt + slotSalt) % list.length;
  return list[(start + dayIndex) % list.length];
}

/**
 * Build a varied Mon–Sun menu for weekStart (Monday UTC).
 * Each day gets different Indian-heavy dishes; dinner includes Chinese options.
 * Premium dishes are excluded from the regular rotation.
 */
export async function buildWeeklyMenuAssignments(weekStartDate) {
  const weekStart = getMondayUTC(weekStartDate);
  weekStart.setUTCHours(0, 0, 0, 0);

  await ensureDishCatalog();

  const allDishes = await Dish.find({
    name: { $nin: PREMIUM_DISH_NAMES },
  });

  const byCat = {
    BREAKFAST: allDishes.filter((d) => d.category === 'BREAKFAST'),
    LUNCH: allDishes.filter((d) => d.category === 'LUNCH'),
    SNACKS: allDishes.filter((d) => d.category === 'SNACKS'),
    DINNER: allDishes.filter((d) => d.category === 'DINNER'),
  };

  // Fallback: any non-premium dish
  const any = allDishes.length ? allDishes : await Dish.find({});
  const weekSalt = Math.floor(weekStart.getTime() / (7 * 24 * 60 * 60 * 1000));

  const assignments = [];
  const usedNamesPerDay = {};

  WEEKDAYS.forEach((dayName, dayIndex) => {
    usedNamesPerDay[dayName] = new Set();
    SLOTS.forEach((slot, slotIndex) => {
      const pool = byCat[slot]?.length ? byCat[slot] : any;
      let dish = pickRotated(pool, dayIndex, weekSalt, slotIndex * 3 + 1);

      // Avoid duplicate dish name on the same day across slots
      let attempts = 0;
      while (
        dish &&
        usedNamesPerDay[dayName].has(dish.name) &&
        attempts < pool.length
      ) {
        dish = pool[(dayIndex + slotIndex + attempts + 1) % pool.length];
        attempts += 1;
      }
      if (dish) usedNamesPerDay[dayName].add(dish.name);

      if (dish) {
        assignments.push({
          weekStartDate: weekStart,
          dayOfWeek: dayName,
          mealType: slot,
          dish: dish._id,
          wing: 'ALL',
          isPremium: false,
        });
      }
    });
  });

  return { weekStart, assignments };
}

/**
 * If no menu exists for this week, create a full varied schedule.
 * @returns {Promise<boolean>} true if menu was created
 */
export async function ensureWeeklyMenu(weekStartDate) {
  const weekStart = getMondayUTC(weekStartDate);
  weekStart.setUTCHours(0, 0, 0, 0);

  await ensureDishCatalog();

  const existingRows = await WeeklyMenu.find({
    weekStartDate: weekStart,
    wing: 'ALL',
    isPremium: { $ne: true },
  }).select('dish');

  const uniqueDishes = new Set(
    existingRows.map((r) => r.dish?.toString()).filter(Boolean)
  );

  // Full week = 7 days × 4 meals = 28 rows; need real variety across days
  if (existingRows.length >= 28 && uniqueDishes.size >= 14) {
    return false;
  }

  // Wipe thin / repetitive week menus and rebuild with the full catalog
  await WeeklyMenu.deleteMany({
    weekStartDate: weekStart,
    wing: 'ALL',
    isPremium: { $ne: true },
  });

  const { assignments } = await buildWeeklyMenuAssignments(weekStart);
  if (assignments.length) {
    await WeeklyMenu.insertMany(assignments);
  }
  return true;
}
