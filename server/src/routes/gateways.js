const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

// GET /api/gateways - List gateways
router.get('/', authenticate, requirePermission('gateways'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT g.*, m.name as merchant_name, m.merchant_id as merchant_code
       FROM gateways g
       LEFT JOIN merchants m ON g.merchant_id = m.id
       ORDER BY g.priority ASC, g.created_at DESC`
    );

    // Get transaction stats per gateway
    const stats = await query(`
      SELECT gateway, COUNT(*) as total_txns,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful,
        ROUND(COUNT(*) FILTER (WHERE status = 'SUCCESS')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate,
        COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'), 0) as total_volume
      FROM transactions
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY gateway
    `);

    const statsMap = stats.rows.reduce((acc, s) => { acc[s.gateway] = s; return acc; }, {});

    const gateways = result.rows.map(g => ({
      ...g,
      stats: statsMap[g.gateway_name] || { total_txns: 0, successful: 0, success_rate: 0, total_volume: 0 },
    }));

    res.json({ gateways });
  } catch (error) {
    next(error);
  }
});

// GET /api/gateways/:id - Gateway details
router.get('/:id', authenticate, requirePermission('gateways'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT g.*, m.name as merchant_name FROM gateways g
       LEFT JOIN merchants m ON g.merchant_id = m.id
       WHERE g.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Gateway not found' });

    // Performance stats for this gateway
    const performance = await query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful,
        ROUND(COUNT(*) FILTER (WHERE status = 'SUCCESS')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate,
        COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'), 0) as volume
      FROM transactions
      WHERE gateway = $1 AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [result.rows[0].gateway_name]);

    // Payment method breakdown
    const byMethod = await query(`
      SELECT payment_method, COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful,
        ROUND(COUNT(*) FILTER (WHERE status = 'SUCCESS')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM transactions
      WHERE gateway = $1 AND created_at >= NOW() - INTERVAL '30 days' AND payment_method IS NOT NULL
      GROUP BY payment_method ORDER BY total DESC
    `, [result.rows[0].gateway_name]);

    // Error analysis
    const errors = await query(`
      SELECT error_code, error_message, COUNT(*) as count
      FROM transactions
      WHERE gateway = $1 AND status = 'FAILED' AND created_at >= NOW() - INTERVAL '30 days'
        AND error_code IS NOT NULL
      GROUP BY error_code, error_message
      ORDER BY count DESC LIMIT 10
    `, [result.rows[0].gateway_name]);

    res.json({
      gateway: result.rows[0],
      performance: performance.rows,
      byPaymentMethod: byMethod.rows,
      topErrors: errors.rows,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/gateways - Create gateway
router.post('/', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { merchant_id, gateway_name, gateway_type, credentials, payment_methods, priority } = req.body;

    if (!gateway_name || !gateway_type) {
      return res.status(400).json({ error: 'Gateway name and type are required' });
    }

    const result = await query(
      `INSERT INTO gateways (merchant_id, gateway_name, gateway_type, credentials, payment_methods, priority)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        merchant_id, gateway_name, gateway_type,
        JSON.stringify(credentials || {}),
        JSON.stringify(payment_methods || []),
        priority || 0
      ]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'CREATE_GATEWAY', 'GATEWAYS', 'gateway', $2, $3, $4)`,
      [req.user.id, result.rows[0].id, JSON.stringify({ gateway_name, gateway_type }), req.ip]
    );

    res.status(201).json({ gateway: result.rows[0], message: 'Gateway created successfully' });
  } catch (error) {
    next(error);
  }
});

// PUT /api/gateways/:id - Update gateway
router.put('/:id', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { credentials, payment_methods, is_active, priority } = req.body;

    const current = await query('SELECT * FROM gateways WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Gateway not found' });

    const updates = [];
    const values = [];
    let pc = 0;

    if (credentials !== undefined) { pc++; updates.push(`credentials = $${pc}`); values.push(JSON.stringify(credentials)); }
    if (payment_methods !== undefined) { pc++; updates.push(`payment_methods = $${pc}`); values.push(JSON.stringify(payment_methods)); }
    if (is_active !== undefined) { pc++; updates.push(`is_active = $${pc}`); values.push(is_active); }
    if (priority !== undefined) { pc++; updates.push(`priority = $${pc}`); values.push(priority); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    updates.push('updated_at = NOW()');

    pc++;
    const result = await query(
      `UPDATE gateways SET ${updates.join(', ')} WHERE id = $${pc} RETURNING *`,
      [...values, req.params.id]
    );

    res.json({ gateway: result.rows[0], message: 'Gateway updated successfully' });
  } catch (error) {
    next(error);
  }
});

// PUT /api/gateways/:id/toggle - Toggle gateway active/inactive
router.put('/:id/toggle', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE gateways SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Gateway not found' });
    res.json({ gateway: result.rows[0], message: `Gateway ${result.rows[0].is_active ? 'activated' : 'deactivated'}` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
