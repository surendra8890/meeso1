const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], required: true }
  },
  { _id: false }
);

const buyerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    location: { type: String, trim: true, required: true },
    budgetMin: { type: Number },
    budgetMax: { type: Number },
    propertyType: {
      type: String,
      enum: ['Apartment', 'Independent House', 'Villa', 'Plot', 'Other'],
      default: 'Apartment'
    },
    bedrooms: { type: String, trim: true }, // e.g. "2 BHK"
    purpose: {
      type: String,
      enum: ['Buy', 'Rent'],
      default: 'Buy'
    },
    description: { type: String, trim: true, default: '' },
    media: [mediaSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Buyer', buyerSchema);
