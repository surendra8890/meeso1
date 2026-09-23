const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'smartproperty-dev-secret';

async function findUserByEmail(email) {
  return User.findOne({ email: String(email).toLowerCase() }).lean();
}

async function createUser({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email: String(email).toLowerCase(),
    password: passwordHash
  });

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email
  };
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id || user._id,
      email: user.email,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const exists = await findUserByEmail(email);
    if (exists) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const user = await createUser({ name, email, password });
    const token = createToken(user);

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: error.message || 'Unable to create account. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const safeUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email
    };

    return res.json({
      token: createToken(safeUser),
      user: safeUser
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Unable to sign in. Please try again.' });
  }
});

router.put('/profile-photo', requireAuth, async (req, res) => {
  try {
    const { profilePhoto } = req.body || {};

    if (!profilePhoto) {
      return res.status(400).json({ error: 'A profile photo is required.' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { profilePhoto },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        profilePhoto: user.profilePhoto
      }
    });
  } catch (error) {
    console.error('Profile photo update error:', error);
    return res.status(500).json({ error: 'Unable to update profile photo.' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication token missing.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id).lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        profilePhoto: user.profilePhoto || ''
      }
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

module.exports = router;
