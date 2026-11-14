import mongoose from 'mongoose';

const AccountAuditSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    target: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: [
        'ACCOUNT_CREATED',
        'WARDEN_WING_CHANGED',
        'ACCOUNT_ACTIVATED',
        'ACCOUNT_DEACTIVATED',
        'PASSWORD_RESET',
        'INVITATION_ISSUED',
      ],
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.models.AccountAudit ||
  mongoose.model('AccountAudit', AccountAuditSchema);
