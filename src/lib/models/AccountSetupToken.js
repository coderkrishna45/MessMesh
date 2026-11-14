import mongoose from 'mongoose';

const AccountSetupTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ['INVITATION', 'PASSWORD_RESET'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AccountSetupTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.AccountSetupToken ||
  mongoose.model('AccountSetupToken', AccountSetupTokenSchema);
