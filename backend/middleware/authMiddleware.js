const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect routes — requires Bearer JWT.
 */
const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Not authorized, no token',
      });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ success: false, data: null, message: 'User not found' });
    }
    next();
  } catch (err) {
    console.log('[Auth] JWT verify failed:', err.message);
    return res.status(401).json({ success: false, data: null, message: 'Not authorized' });
  }
};

module.exports = authMiddleware;
