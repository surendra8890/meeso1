const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: __dirname + '/.env' });
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });

const authRoutes = require('./routes/auth');
const buyerRoutes = require('./routes/buyer');
const sellerRoutes = require('./routes/seller');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'inedx.html'));
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'SmartProperty API is running',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/buyer', buyerRoutes);
app.use('/api/seller', sellerRoutes);

app.use((error, req, res, next) => {
  console.error('Unhandled API error:', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: error.message || 'Unexpected server error.' });
});

const startServer = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri);
      console.log('MongoDB connected successfully.');
    } catch (error) {
      console.error('MongoDB connection failed; falling back to in-memory auth storage:', error.message);
    }
  } else {
    console.log('No MONGODB_URI found. Using in-memory auth storage for demo mode.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartProperty server is running on port ${PORT}`);
  });
};

startServer();
