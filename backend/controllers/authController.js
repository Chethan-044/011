const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

/**
 * Register a new ReviewSense user.
 */
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    console.log('[auth] register attempt', email);
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Please provide name, email, and password',
      });
    }
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ success: false, data: null, message: 'Email already registered' });
    }
    const user = await User.create({ name, email, password });
    const token = signToken(user._id);
    return res.status(201).json({
      success: true,
      data: {
        user: { id: user._id, name: user.name, email: user.email },
        token,
      },
      message: 'Registration successful',
    });
  } catch (err) {
    console.error('[auth] register error', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * Login and issue JWT.
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('[auth] login attempt', email);
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, data: null, message: 'Invalid credentials' });
    }
    const token = signToken(user._id);
    return res.json({
      success: true,
      data: {
        user: { id: user._id, name: user.name, email: user.email },
        token,
      },
      message: 'Login successful',
    });
  } catch (err) {
    console.error('[auth] login error', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * Return current user profile.
 */
exports.me = async (req, res) => {
  try {
    return res.json({
      success: true,
      data: { user: { id: req.user._id, name: req.user.name, email: req.user.email } },
      message: 'OK',
    });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};
