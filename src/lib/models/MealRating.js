import mongoose from 'mongoose';

const MealRatingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dish: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dish',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
  },
  { timestamps: true }
);

// Ensure a user can only submit one rating per dish per day
MealRatingSchema.index({ user: 1, dish: 1, date: 1 }, { unique: true });

export default mongoose.models.MealRating ||
  mongoose.model('MealRating', MealRatingSchema);
