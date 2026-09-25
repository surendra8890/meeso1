const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      default: '',
      trim: true
    },
    phoneVerified: {
      type: Boolean,
      default: false
    },
    password: {
      type: String,
      required: true
    },
    passwordResetTokenHash: {
      type: String,
      default: ''
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null
    },
    profilePhoto: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
