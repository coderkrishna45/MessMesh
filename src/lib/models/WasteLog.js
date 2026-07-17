import mongoose from 'mongoose';

const WasteLogSchema = new mongoose.Schema(
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
      default: Date.now,
    },
    wasteLevel: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    wing: {
      type: String,
      required: true, // Denormalized wing field for faster leaderboard aggregation
    },
  },
  { timestamps: true }
);

export default mongoose.models.WasteLog ||
  mongoose.model('WasteLog', WasteLogSchema);
