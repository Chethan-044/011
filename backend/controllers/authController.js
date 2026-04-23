const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

function avatarUrl(name) {
  const initials = (name || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=6366f1&color=fff&bold=true&size=128`;
}

/**
 * Register a new ReviewSense user.
 */
exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    console.log('[auth] register attempt', email, 'role:', role || 'analyst');
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
    const allowedRoles = ['analyst', 'admin', 'member'];
    const userRole = allowedRoles.includes(role) ? role : 'analyst';
    const avatar = avatarUrl(name);
    const user = await User.create({ name, email, password, role: userRole, avatar });
    const token = signToken(user._id);
    return res.status(201).json({
      success: true,
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
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
    // Generate avatar if missing
    if (!user.avatar) {
      user.avatar = avatarUrl(user.name);
      await user.save();
    }
    const token = signToken(user._id);
    return res.json({
      success: true,
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
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
      data: {
        user: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role || 'analyst',
          avatar: req.user.avatar || avatarUrl(req.user.name),
        },
      },
      message: 'OK',
    });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

