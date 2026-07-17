import mongoose from 'mongoose';

const WeeklyPollSchema = new mongoose.Schema(
  {
    weekStartDate: {
      type: Date,
      required: true,
    },
    dishes: [
      {
        dish: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Dish',
          required: true,
        },
        votes: {
          type: Number,
          default: 0,
        },
        voters: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
        ],
      },
    ],
    status: {
      type: String,
      enum: ['ACTIVE', 'ARCHIVED'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

export default mongoose.models.WeeklyPoll ||
  mongoose.model('WeeklyPoll', WeeklyPollSchema);
