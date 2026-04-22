const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const { query } = require('../config/database');

// Verify JWT access token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, authConfig.jwt.secret);

    const userResult = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.merchant_id,
              u.role_id, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: `Account is ${user.status.toLowerCase()}` });
    }

    // Load permissions
    const permResult = await query(
      'SELECT module, access_level FROM permissions WHERE role_id = $1',
      [user.role_id]
    );

    req.user = {
      ...user,
      permissions: permResult.rows.reduce((acc, p) => {
        acc[p.module] = p.access_level;
        return acc;
      }, {}),
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next(error);
  }
};

// Check module-level permission
const requirePermission = (module, level = 'READ') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admin role has full access
    if (req.user.role_name === 'Admin') {
      return next();
    }

    const userLevel = req.user.permissions[module];
    if (!userLevel) {
      return res.status(403).json({ error: `No access to ${module} module` });
    }

    if (level === 'READ_WRITE' && userLevel === 'READ') {
      return res.status(403).json({ error: `Write access required for ${module} module` });
    }

    next();
  };
};

// Maker-checker workflow middleware
const requireApproval = (module) => {
  return async (req, res, next) => {
    // Check if maker-checker is enabled for this merchant
    if (req.user.role_name === 'Admin') {
      req.requiresApproval = false;
      return next();
    }
    req.requiresApproval = true;
    next();
  };
};

module.exports = { authenticate, requirePermission, requireApproval };
