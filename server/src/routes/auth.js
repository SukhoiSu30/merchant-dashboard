const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { query } = require('../config/database');
const authConfig = require('../config/auth');
const { authenticate } = require('../middleware/auth');
const { validateLogin } = require('../middleware/validation');

const router = express.Router();

// Generate tokens
const generateTokens = (userId, email) => {
  const accessToken = jwt.sign(
    { userId, email },
    authConfig.jwt.secret,
    { expiresIn: authConfig.jwt.accessExpiresIn }
  );
  const refreshToken = jwt.sign(
    { userId, email, type: 'refresh' },
    authConfig.jwt.refreshSecret,
    { expiresIn: authConfig.jwt.refreshExpiresIn }
  );
  return { accessToken, refreshToken };
};

// POST /api/auth/login
router.post('/login', validateLogin, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await query(
      `SELECT u.*, r.name as role_name FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check if account is locked
    if (user.status === 'LOCKED') {
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
        return res.status(423).json({ error: `Account locked. Try again in ${mins} minutes` });
      }
      // Unlock if lock period has passed
      await query(
        "UPDATE users SET status = 'ACTIVE', failed_login_attempts = 0, locked_until = NULL WHERE id = $1",
        [user.id]
      );
    }

    if (user.status === 'INACTIVE') {
      return res.status(403).json({ error: 'Account is disabled. Contact administrator.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      const attempts = user.failed_login_attempts + 1;
      if (attempts >= authConfig.password.maxFailedAttempts) {
        const lockUntil = new Date(Date.now() + authConfig.password.lockDurationMinutes * 60000);
        await query(
          "UPDATE users SET failed_login_attempts = $1, status = 'LOCKED', locked_until = $2 WHERE id = $3",
          [attempts, lockUntil, user.id]
        );
        return res.status(423).json({ error: 'Account locked due to too many failed attempts' });
      }
      await query('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [attempts, user.id]);
      return res.status(401).json({
        error: 'Invalid email or password',
        remainingAttempts: authConfig.password.maxFailedAttempts - attempts,
      });
    }

    // Reset failed attempts on successful password
    await query('UPDATE users SET failed_login_attempts = 0 WHERE id = $1', [user.id]);

    // Check if 2FA is enabled
    if (user.totp_enabled) {
      // Return a temporary token for 2FA verification
      const tempToken = jwt.sign(
        { userId: user.id, email: user.email, require2FA: true },
        authConfig.jwt.secret,
        { expiresIn: '5m' }
      );
      return res.json({
        requires2FA: true,
        tempToken,
        message: 'Please enter your 2FA code',
      });
    }

    // No 2FA — issue full tokens
    const tokens = generateTokens(user.id, user.email);
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, module, description, ip_address)
       VALUES ($1, 'LOGIN', 'AUTH', 'User logged in successfully', $2)`,
      [user.id, req.ip]
    );

    res.json({
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role_name,
        merchantId: user.merchant_id,
        totpEnabled: user.totp_enabled,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/verify-2fa
router.post('/verify-2fa', async (req, res, next) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ error: 'Token and 2FA code are required' });
    }

    const decoded = jwt.verify(tempToken, authConfig.jwt.secret);
    if (!decoded.require2FA) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    const result = await query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const isValid = authenticator.verify({ token: code, secret: user.totp_secret });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    const tokens = generateTokens(user.id, user.email);
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const roleResult = await query('SELECT name FROM roles WHERE id = $1', [user.role_id]);

    res.json({
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: roleResult.rows[0]?.name,
        merchantId: user.merchant_id,
        totpEnabled: user.totp_enabled,
      },
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '2FA verification expired. Please login again.' });
    }
    next(error);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, authConfig.jwt.refreshSecret);
    const tokens = generateTokens(decoded.userId, decoded.email);

    res.json(tokens);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired. Please login again.' });
    }
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /api/auth/setup-2fa
router.post('/setup-2fa', authenticate, async (req, res, next) => {
  try {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(req.user.email, authConfig.totp.issuer, secret);
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    // Store secret temporarily (not enabled until verified)
    await query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret, req.user.id]);

    res.json({ secret, qrCodeUrl, otpauth });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/enable-2fa
router.post('/enable-2fa', authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: '2FA code required' });

    const result = await query('SELECT totp_secret FROM users WHERE id = $1', [req.user.id]);
    const secret = result.rows[0]?.totp_secret;

    if (!secret) return res.status(400).json({ error: 'Please setup 2FA first' });

    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) return res.status(400).json({ error: 'Invalid code. Please try again.' });

    await query('UPDATE users SET totp_enabled = true WHERE id = $1', [req.user.id]);

    await query(
      `INSERT INTO audit_logs (user_id, action, module, description, ip_address)
       VALUES ($1, 'ENABLE_2FA', 'AUTH', 'User enabled 2FA', $2)`,
      [req.user.id, req.ip]
    );

    res.json({ message: '2FA enabled successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/disable-2fa
router.post('/disable-2fa', authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: '2FA code required to disable' });

    const result = await query('SELECT totp_secret FROM users WHERE id = $1', [req.user.id]);
    const isValid = authenticator.verify({ token: code, secret: result.rows[0]?.totp_secret });

    if (!isValid) return res.status(400).json({ error: 'Invalid 2FA code' });

    await query('UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1', [req.user.id]);

    res.json({ message: '2FA disabled successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.first_name,
      lastName: req.user.last_name,
      role: req.user.role_name,
      merchantId: req.user.merchant_id,
      permissions: req.user.permissions,
    },
  });
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, authConfig.password.saltRounds);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);

    await query(
      `INSERT INTO audit_logs (user_id, action, module, description, ip_address)
       VALUES ($1, 'CHANGE_PASSWORD', 'AUTH', 'User changed password', $2)`,
      [req.user.id, req.ip]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/verify-token/:token - Verify setup token
router.get('/verify-token/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const result = await query(
      `SELECT pst.*, u.email FROM password_setup_tokens pst
       JOIN users u ON pst.user_id = u.id
       WHERE pst.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.json({ valid: false, error: 'Token not found' });
    }

    const tokenData = result.rows[0];

    // Check if token has been used
    if (tokenData.used_at) {
      return res.json({ valid: false, error: 'Token has already been used' });
    }

    // Check if token has expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.json({ valid: false, error: 'Token has expired' });
    }

    res.json({
      valid: true,
      email: tokenData.email,
      expiresAt: tokenData.expires_at,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/setup-password - Set password using token
router.post('/setup-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Find and validate token
    const tokenResult = await query(
      `SELECT pst.*, u.id as user_id, u.email FROM password_setup_tokens pst
       JOIN users u ON pst.user_id = u.id
       WHERE pst.token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const tokenData = tokenResult.rows[0];

    // Check if token has been used
    if (tokenData.used_at) {
      return res.status(400).json({ error: 'Token has already been used' });
    }

    // Check if token has expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token has expired' });
    }

    // Hash password and update user
    const hash = await bcrypt.hash(password, authConfig.password.saltRounds);

    await query(
      'UPDATE users SET password_hash = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [hash, 'ACTIVE', tokenData.user_id]
    );

    // Mark token as used
    await query(
      'UPDATE password_setup_tokens SET used_at = NOW() WHERE token = $1',
      [token]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, module, description, ip_address)
       VALUES ($1, 'SETUP_PASSWORD', 'AUTH', 'User set password via setup token', $2)`,
      [tokenData.user_id, req.ip]
    );

    res.json({ message: 'Password set successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
