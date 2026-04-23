/**
 * Role-based access control middleware.
 * Usage: router.use(requireRole('admin', 'member'))
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, data: null, message: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        data: null,
        message: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
}

module.exports = { requireRole };
