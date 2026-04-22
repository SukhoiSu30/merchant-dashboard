const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validateUser, validatePagination } = require('../middleware/validation');
const authConfig = require('../config/auth');

const router = express.Router();

// GET /api/users - List all users
router.get('/', authenticate, requirePermission('users'), validatePagination, async (req, res, next) => {
  try {
    const { limit, offset, page } = req.pagination;
    const { search, status, role } = req.query;

    let where = ['1=1'];
    let params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      where.push(`(u.email ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }
    if (status) {
      paramCount++;
      where.push(`u.status = $${paramCount}`);
      params.push(status);
    }
    if (role) {
      paramCount++;
      where.push(`r.name = $${paramCount}`);
      params.push(role);
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE ${where.join(' AND ')}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.totp_enabled,
              u.last_login, u.created_at, u.updated_at, r.name as role_name,
              m.name as merchant_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN merchants m ON u.merchant_id = m.id
       WHERE ${where.join(' AND ')}
       ORDER BY u.created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, limit, offset]
    );

    res.json({
      users: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id - Get user details
router.get('/:id', authenticate, requirePermission('users'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.totp_enabled,
              u.last_login, u.failed_login_attempts, u.created_at, u.updated_at,
              u.role_id, r.name as role_name, m.name as merchant_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN merchants m ON u.merchant_id = m.id
       WHERE u.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get permissions
    const permResult = await query(
      'SELECT module, access_level FROM permissions WHERE role_id = $1',
      [result.rows[0].role_id]
    );

    res.json({ user: result.rows[0], permissions: permResult.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/users - Create user
router.post('/', authenticate, requirePermission('users', 'READ_WRITE'), validateUser, async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, role_id, merchant_id } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const hash = await bcrypt.hash(password, authConfig.password.saltRounds);

    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role_id, merchant_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, first_name, last_name, status, created_at`,
      [email.toLowerCase(), hash, first_name, last_name || '', role_id, merchant_id || null, req.user.id]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'CREATE_USER', 'USERS', 'user', $2, $3, $4)`,
      [req.user.id, result.rows[0].id, JSON.stringify({ email, first_name, last_name }), req.ip]
    );

    res.status(201).json({ user: result.rows[0], message: 'User created successfully' });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', authenticate, requirePermission('users', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { first_name, last_name, role_id, status } = req.body;
    const userId = req.params.id;

    // Get current values for audit log
    const current = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (first_name !== undefined) { paramCount++; updates.push(`first_name = $${paramCount}`); values.push(first_name); }
    if (last_name !== undefined) { paramCount++; updates.push(`last_name = $${paramCount}`); values.push(last_name); }
    if (role_id !== undefined) { paramCount++; updates.push(`role_id = $${paramCount}`); values.push(role_id); }
    if (status !== undefined) { paramCount++; updates.push(`status = $${paramCount}`); values.push(status); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    paramCount++;
    updates.push(`updated_at = NOW()`);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, email, first_name, last_name, status`,
      [...values, userId]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES ($1, 'UPDATE_USER', 'USERS', 'user', $2, $3, $4, $5)`,
      [req.user.id, userId, JSON.stringify({ status: current.rows[0].status }), JSON.stringify(req.body), req.ip]
    );

    res.json({ user: result.rows[0], message: 'User updated successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/:id/lock - Lock user
router.post('/:id/lock', authenticate, requirePermission('users', 'READ_WRITE'), async (req, res, next) => {
  try {
    await query("UPDATE users SET status = 'LOCKED', updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ message: 'User locked successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/:id/unlock - Unlock user
router.post('/:id/unlock', authenticate, requirePermission('users', 'READ_WRITE'), async (req, res, next) => {
  try {
    await query(
      "UPDATE users SET status = 'ACTIVE', failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1",
      [req.params.id]
    );
    res.json({ message: 'User unlocked successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/roles/list - Get all roles
router.get('/roles/list', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.*,
        (SELECT COUNT(*) FROM users WHERE role_id = r.id) as user_count,
        json_agg(json_build_object('module', p.module, 'access_level', p.access_level)) as permissions
       FROM roles r
       LEFT JOIN permissions p ON r.id = p.id
       GROUP BY r.id
       ORDER BY r.name`
    );
    res.json({ roles: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
