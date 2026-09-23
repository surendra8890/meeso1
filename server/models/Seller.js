const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },       // e.g. /uploads/167xxx-house.jpg
    type: { type: String, enum: ['image', 'video'], required: true }
  },
  { _id: false }
);

const sellerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    propertyAddress: { type: String, trim: true, required: true },
    price: { type: Number, required: true },
    area: { type: Number }, // sq.ft
    propertyType: {
      type: String,
      enum: ['Apartment', 'Independent House', 'Villa', 'Plot', 'Other'],
      default: 'Apartment'
    },
    bedrooms: { type: String, trim: true }, // e.g. "3 BHK"
    description: { type: String, trim: true, default: '' },
    media: [mediaSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Seller', sellerSchema);
