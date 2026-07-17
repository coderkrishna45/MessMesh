import mongoose from 'mongoose';

const WeeklyMenuSchema = new mongoose.Schema(
  {
    weekStartDate: {
      type: Date,
      required: true,
    },
    dayOfWeek: {
      type: String,
      enum: [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ],
      required: true,
    },
    mealType: {
      type: String,
      enum: ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'],
      required: true,
    },
    dish: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dish',
      required: true,
    },
    wing: {
      type: String,
      enum: ['A-Wing', 'B-Wing', 'C-Wing', 'D-Wing', 'ALL'],
      default: 'ALL',
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

if (mongoose.models.WeeklyMenu) {
  delete mongoose.models.WeeklyMenu;
}

export default mongoose.model('WeeklyMenu', WeeklyMenuSchema);
