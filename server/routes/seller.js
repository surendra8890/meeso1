const express = require('express');
const path = require('path');
const Seller = require('../models/Seller');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const upload = require('../middleware/upload');

const router = express.Router();

function normalizePropertyType(value) {
  const types = {
    apartment: 'Apartment',
    'independent house': 'Independent House',
    villa: 'Villa',
    plot: 'Plot',
    other: 'Other'
  };
  return types[String(value || '').trim().toLowerCase()] || 'Other';
}

function mapSeller(row) {
  return {
    _id: row._id.toString(),
    user: row.user ? {
      id: row.user._id ? row.user._id.toString() : row.user.id,
      name: row.user.name,
      email: row.user.email,
      photo: row.user.profilePhoto,
      profilePhoto: row.user.profilePhoto
    } : undefined,
    propertyAddress: row.propertyAddress,
    price: row.price,
    budgetDetails: row.budgetDetails,
    area: row.area,
    propertyType: row.propertyType,
    bedrooms: row.bedrooms,
    description: row.description,
    extraDetails: row.extraDetails,
    media: row.media || [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mediaFromFiles(files) {
  const videoExts = ['.mp4', '.mov', '.webm'];
  return (files || []).map((file) => {
    const ext = path.extname(file.filename).toLowerCase();
    return { url: '/uploads/' + file.filename, type: videoExts.includes(ext) ? 'video' : 'image' };
  });
}

router.post('/', requireAuth, upload.array('media', 10), async (req, res) => {
  try {
    const { propertyAddress, price, budgetDetails, area, propertyType, bedrooms, description, extraDetails, profilePhoto } = req.body;
    if (!propertyAddress || !price) return res.status(400).json({ error: 'Property address and price are required.' });

    if (profilePhoto) {
      await User.findByIdAndUpdate(req.userId, { profilePhoto });
    }

    const seller = await Seller.create({
      user: req.userId,
      propertyAddress,
      price: Number(price),
      budgetDetails: budgetDetails || '',
      area: area ? Number(area) : null,
      propertyType: normalizePropertyType(propertyType),
      bedrooms,
      description: description || '',
      extraDetails: extraDetails || '',
      media: mediaFromFiles(req.files)
    });

    const populated = await Seller.findById(seller._id).populate('user', 'name email profilePhoto');
    res.status(201).json({ seller: mapSeller(populated) });
  } catch (err) {
    console.error('Seller save error:', err);
    res.status(500).json({ error: err.message || 'Could not save your listing.' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const sellers = await Seller.find({ user: req.userId }).populate('user', 'name email profilePhoto').sort({ createdAt: -1 });
    res.json({ sellers: sellers.map(mapSeller) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load your listings.' });
  }
});

router.put('/:id', requireAuth, upload.array('media', 10), async (req, res) => {
  try {
    const { propertyAddress, price, budgetDetails, area, propertyType, bedrooms, description, extraDetails } = req.body;
    if (!propertyAddress || !price) return res.status(400).json({ error: 'Property address and price are required.' });

    const update = {
      propertyAddress,
      price: Number(price),
      budgetDetails: budgetDetails || '',
      area: area ? Number(area) : null,
      propertyType: normalizePropertyType(propertyType),
      bedrooms,
      description: description || '',
      extraDetails: extraDetails || ''
    };

    const newMedia = mediaFromFiles(req.files);
    if (newMedia.length) update.media = newMedia;

    const seller = await Seller.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      update,
      { new: true }
    ).populate('user', 'name email profilePhoto');

    if (!seller) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ seller: mapSeller(seller) });
  } catch (err) {
    res.status(500).json({ error: 'Could not update your listing.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await Seller.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!result) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete your listing.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const sellers = await Seller.find({}).populate('user', 'name email profilePhoto').sort({ createdAt: -1 }).limit(50);
    res.json({ sellers: sellers.map(mapSeller) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load listings.' });
  }
});

module.exports = router;
