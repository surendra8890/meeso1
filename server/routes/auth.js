const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'smartproperty-dev-secret';

async function findUserByEmail(email) {
  return User.findOne({ email: String(email).toLowerCase() }).lean();
}

async function createUser({ name, email, password, phone = '' }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email: String(email).toLowerCase(),
    password: passwordHash,
    phone
  });

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    phoneVerified: user.phoneVerified || false
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
    const { name, email, password, phone = '' } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const normalizedPhone = String(phone || '').replace(/[\s()-]/g, '');
    if (normalizedPhone && !/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Enter a valid mobile number with its country code.' });
    }

    const exists = await findUserByEmail(email);
    if (exists) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const user = await createUser({ name, email, password, phone: normalizedPhone });
    const token = createToken(user);

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        phoneVerified: user.phoneVerified
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

    const validPassword = user.password && await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const safeUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      phoneVerified: user.phoneVerified || false
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

router.get('/google/config', (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || '' });
});

router.post('/google', async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const { accessToken } = req.body || {};
    if (!clientId) {
      return res.status(503).json({ error: 'Google sign-in is not configured on this server.' });
    }
    if (!accessToken) {
      return res.status(400).json({ error: 'Google sign-in did not return an access token.' });
    }

    const tokenInfoResponse = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken));
    const tokenInfo = await tokenInfoResponse.json();
    const tokenAudience = tokenInfo.aud || tokenInfo.issued_to;
    if (!tokenInfoResponse.ok || tokenAudience !== clientId) {
      return res.status(401).json({ error: 'Google could not verify this account. Please try again.' });
    }

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || profile.email_verified !== true || !profile.email) {
      return res.status(401).json({ error: 'Google could not verify this account. Please try again.' });
    }

    let user = await User.findOne({ email: profile.email.toLowerCase() });
    if (!user) {
      const randomPassword = require('crypto').randomBytes(32).toString('hex');
      user = await User.create({
        name: profile.name || profile.email.split('@')[0],
        email: profile.email.toLowerCase(),
        password: await bcrypt.hash(randomPassword, 10)
      });
    }

    const safeUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      phoneVerified: user.phoneVerified || false
    };
    return res.json({ token: createToken(safeUser), user: safeUser });
  } catch (error) {
    console.error('Google sign-in error:', error);
    return res.status(500).json({ error: 'Unable to sign in with Google. Please try again.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Enter your email address.' });
    }
    if (!process.env.RESEND_API_KEY || !process.env.PASSWORD_RESET_FROM || !process.env.APP_BASE_URL) {
      return res.status(503).json({ error: 'Password recovery email is not configured on this server.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: 'If an account exists for this email, a reset link will be sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    user.passwordResetTokenHash = resetTokenHash;
    user.passwordResetExpiresAt = resetExpiresAt;
    await user.save();

    const appBaseUrl = process.env.APP_BASE_URL.replace(/\/$/, '');
    const resetUrl = appBaseUrl + '/?resetToken=' + encodeURIComponent(resetToken);
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.PASSWORD_RESET_FROM,
        to: [email],
        subject: 'Reset your SmartProperty password',
        html: '<p>Use the link below to reset your SmartProperty password. This link expires in 30 minutes.</p><p><a href="' + resetUrl + '">Reset password</a></p>'
      })
    });

    if (!emailResponse.ok) {
      user.passwordResetTokenHash = '';
      user.passwordResetExpiresAt = null;
      await user.save();
      return res.status(502).json({ error: 'Could not send the reset email. Check the email provider configuration.' });
    }

    return res.json({ message: 'If an account exists for this email, a reset link will be sent.' });
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({ error: 'Unable to request a password reset. Please try again.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetTokenHash: resetTokenHash,
      passwordResetExpiresAt: { $gt: new Date() }
    });
    if (!user) {
      return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
    }

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetTokenHash = '';
    user.passwordResetExpiresAt = null;
    await user.save();
    return res.json({ message: 'Password updated. You can now sign in.' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ error: 'Unable to reset the password. Please try again.' });
  }
});

router.post('/phone/send-code', requireAuth, async (req, res) => {
  try {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      return res.status(503).json({ error: 'SMS verification is not configured on this server.' });
    }

    const user = await User.findById(req.userId);
    if (!user || !user.phone) {
      return res.status(400).json({ error: 'Add a mobile number with its country code first.' });
    }

    const credentials = Buffer.from(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN).toString('base64');
    const twilioResponse = await fetch('https://verify.twilio.com/v2/Services/' + TWILIO_VERIFY_SERVICE_SID + '/Verifications', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + credentials,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: user.phone, Channel: 'sms' })
    });
    if (!twilioResponse.ok) {
      return res.status(502).json({ error: 'Could not send a verification code. Check the SMS provider settings.' });
    }
    return res.json({ message: 'A verification code was sent to ' + user.phone + '.' });
  } catch (error) {
    console.error('SMS send error:', error);
    return res.status(500).json({ error: 'Unable to send a verification code. Please try again.' });
  }
});

router.post('/phone/verify-code', requireAuth, async (req, res) => {
  try {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      return res.status(503).json({ error: 'SMS verification is not configured on this server.' });
    }

    const code = String((req.body || {}).code || '').trim();
    if (!/^\d{4,10}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the verification code from your text message.' });
    }

    const user = await User.findById(req.userId);
    if (!user || !user.phone) {
      return res.status(400).json({ error: 'No mobile number is associated with this account.' });
    }

    const credentials = Buffer.from(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN).toString('base64');
    const twilioResponse = await fetch('https://verify.twilio.com/v2/Services/' + TWILIO_VERIFY_SERVICE_SID + '/VerificationCheck', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + credentials,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: user.phone, Code: code })
    });
    const verification = await twilioResponse.json();
    if (!twilioResponse.ok || verification.status !== 'approved') {
      return res.status(400).json({ error: 'That verification code is invalid or expired.' });
    }

    user.phoneVerified = true;
    await user.save();
    return res.json({ message: 'Mobile number verified.' });
  } catch (error) {
    console.error('SMS verification error:', error);
    return res.status(500).json({ error: 'Unable to verify the mobile number. Please try again.' });
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
        profilePhoto: user.profilePhoto || '',
        phone: user.phone || '',
        phoneVerified: user.phoneVerified || false
      }
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

module.exports = router;
