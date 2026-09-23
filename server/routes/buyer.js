const express = require('express');
const path = require('path');
const Buyer = require('../models/Buyer');
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

function mediaFromFiles(files) {
  const videoExts = ['.mp4', '.mov', '.webm'];
  return (files || []).map((file) => {
    const ext = path.extname(file.filename).toLowerCase();
    return { url: '/uploads/' + file.filename, type: videoExts.includes(ext) ? 'video' : 'image' };
  });
}

function mapBuyer(row) {
  return {
    _id: row._id.toString(),
    user: row.user ? {
      id: row.user._id ? row.user._id.toString() : row.user.id,
      name: row.user.name,
      email: row.user.email,
      photo: row.user.profilePhoto,
      profilePhoto: row.user.profilePhoto
    } : undefined,
    location: row.location,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    propertyType: row.propertyType,
    bedrooms: row.bedrooms,
    purpose: row.purpose,
    description: row.description,
    media: row.media || [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

router.post('/', requireAuth, upload.array('media', 10), async (req, res) => {
  try {
    const { location, budgetMin, budgetMax, propertyType, bedrooms, purpose, description, profilePhoto } = req.body;
    if (!location) return res.status(400).json({ error: 'Location is required.' });

    if (profilePhoto) {
      await User.findByIdAndUpdate(req.userId, { profilePhoto });
    }

    const buyer = await Buyer.findOneAndUpdate(
      { user: req.userId },
      {
        user: req.userId,
        location,
        budgetMin: budgetMin ? Number(budgetMin) : null,
        budgetMax: budgetMax ? Number(budgetMax) : null,
        propertyType: normalizePropertyType(propertyType),
        bedrooms,
        purpose: purpose || 'Buy',
        description: description || '',
        media: mediaFromFiles(req.files)
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate('user', 'name email profilePhoto');

    res.status(201).json({ buyer: mapBuyer(buyer) });
  } catch (err) {
    console.error('Buyer save error:', err);
    res.status(500).json({ error: err.message || 'Could not save your buyer profile.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const buyer = await Buyer.findOne({ user: req.userId }).populate('user', 'name email profilePhoto');
    res.json({ buyer: buyer ? mapBuyer(buyer) : null });
  } catch (err) {
    res.status(500).json({ error: 'Could not load your buyer profile.' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const buyers = await Buyer.find({ user: req.userId }).populate('user', 'name email profilePhoto').sort({ createdAt: -1 });
    res.json({ buyers: buyers.map(mapBuyer) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load your posts.' });
  }
});

router.put('/:id', requireAuth, upload.array('media', 10), async (req, res) => {
  try {
    const { location, budgetMin, budgetMax, propertyType, bedrooms, purpose, description } = req.body || {};
    if (!location) return res.status(400).json({ error: 'Location is required.' });

    const update = {
      location,
      budgetMin: budgetMin ? Number(budgetMin) : null,
      budgetMax: budgetMax ? Number(budgetMax) : null,
      propertyType: normalizePropertyType(propertyType),
      bedrooms,
      purpose: purpose || 'Buy',
      description: description || ''
    };
    const newMedia = mediaFromFiles(req.files);
    if (newMedia.length) update.media = newMedia;

    const buyer = await Buyer.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      update,
      { new: true }
    ).populate('user', 'name email profilePhoto');

    if (!buyer) return res.status(404).json({ error: 'Post not found.' });
    res.json({ buyer: mapBuyer(buyer) });
  } catch (err) {
    res.status(500).json({ error: 'Could not update your post.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await Buyer.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!result) return res.status(404).json({ error: 'Post not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete your post.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const buyers = await Buyer.find({}).populate('user', 'name email profilePhoto').sort({ createdAt: -1 }).limit(50);
    res.json({ buyers: buyers.map(mapBuyer) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load buyer listings.' });
  }
});

module.exports = router;
