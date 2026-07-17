import mongoose from 'mongoose';

const DishSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide the dish name.'],
    },
    image: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      enum: ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'],
      default: 'LUNCH',
    },
    isVeg: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Dish || mongoose.model('Dish', DishSchema);
