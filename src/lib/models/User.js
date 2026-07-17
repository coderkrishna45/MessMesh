import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name.'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email.'],
      unique: true,
    },
    password: {
      type: String,
      required: [true, 'Please provide a password.'],
    },
    role: {
      type: String,
      enum: ['STUDENT', 'WARDEN'],
      default: 'STUDENT',
    },
    wing: {
      type: String,
      default: 'A-Wing', // A-Wing | B-Wing | C-Wing | D-Wing
    },
    cleanPlateScore: {
      type: Number,
      default: 100,
    },
    rollNumber: {
      type: String,
      unique: true,
      sparse: true, // Allows null/missing values for Warden accounts without duplicates
    },
    phone: {
      type: String,
      default: '',
    },
    needsPasswordChange: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

if (mongoose.models.User) {
  delete mongoose.models.User;
}

export default mongoose.models.User || mongoose.model('User', UserSchema);
