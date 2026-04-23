const express = require('express');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');

const router = express.Router();

// GET /api/mandates - List mandates
router.get('/', authenticate, requirePermission('mandates'), validatePagination, async (req, res, next) => {
  try {
    const { limit, offset, page } = req.pagination;
    const { search, status, frequency, gateway } = req.query;

    let where = ['1=1'];
    let params = [];
    let pc = 0;

    if (search) {
      pc++;
      where.push(`(md.mandate_id ILIKE $${pc} OR md.customer_id ILIKE $${pc})`);
      params.push(`%${search}%`);
    }
    if (status) { pc++; where.push(`md.status = $${pc}`); params.push(status); }
    if (frequency) { pc++; where.push(`md.frequency = $${pc}`); params.push(frequency); }
    if (gateway) { pc++; where.push(`md.gateway = $${pc}`); params.push(gateway); }

    const whereClause = where.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) FROM mandates md WHERE ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT md.*, m.name as merchant_name, m.merchant_id as merchant_code
       FROM mandates md
       LEFT JOIN merchants m ON md.merchant_id = m.id
       WHERE ${whereClause}
       ORDER BY md.created_at DESC
       LIMIT $${pc + 1} OFFSET $${pc + 2}`,
      [...params, limit, offset]
    );

    res.json({
      mandates: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/mandates/stats
router.get('/stats', authenticate, requirePermission('mandates'), async (req, res, next) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
        COUNT(*) FILTER (WHERE status = 'PAUSED') as paused,
        COUNT(*) FILTER (WHERE status = 'REVOKED') as revoked,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
        COUNT(*) FILTER (WHERE status = 'CREATED') as created,
        COUNT(*) FILTER (WHERE status = 'EXPIRED') as expired,
        COALESCE(SUM(amount) FILTER (WHERE status = 'ACTIVE'), 0) as active_amount
      FROM mandates
    `);

    const byFrequency = await query(`
      SELECT frequency, COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active
      FROM mandates WHERE frequency IS NOT NULL
      GROUP BY frequency ORDER BY count DESC
    `);

    const byGateway = await query(`
      SELECT gateway, COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active
      FROM mandates WHERE gateway IS NOT NULL
      GROUP BY gateway ORDER BY count DESC
    `);

    res.json({ summary: stats.rows[0], byFrequency: byFrequency.rows, byGateway: byGateway.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/mandates/:id - Mandate details
router.get('/:id', authenticate, requirePermission('mandates'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const result = await query(
      `SELECT md.*, m.name as merchant_name, m.merchant_id as merchant_code
       FROM mandates md
       LEFT JOIN merchants m ON md.merchant_id = m.id
       WHERE ${isUUID ? 'md.id = $1' : 'md.mandate_id = $1'}`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mandate not found' });
    }

    const mandate = result.rows[0];

    // Get related orders
    const orders = await query(
      `SELECT * FROM orders WHERE mandate_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [mandate.id]
    );

    // Audit trail
    const audit = await query(
      `SELECT al.*, u.email as user_email FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.entity_type = 'mandate' AND al.entity_id = $1
       ORDER BY al.created_at DESC`,
      [mandate.mandate_id]
    );

    res.json({ mandate, orders: orders.rows, auditTrail: audit.rows });
  } catch (error) {
    next(error);
  }
});

// PUT /api/mandates/:id/pause - Pause mandate
router.put('/:id/pause', authenticate, requirePermission('mandates', 'READ_WRITE'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const current = await query(`SELECT * FROM mandates WHERE ${isUUID ? 'id = $1' : 'mandate_id = $1'}`, [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Mandate not found' });

    const mandate = current.rows[0];
    if (mandate.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active mandates can be paused' });
    }

    await query("UPDATE mandates SET status = 'PAUSED', updated_at = NOW() WHERE id = $1", [mandate.id]);

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES ($1, 'PAUSE_MANDATE', 'MANDATES', 'mandate', $2, $3, $4, $5)`,
      [req.user.id, mandate.mandate_id, JSON.stringify({ status: 'ACTIVE' }), JSON.stringify({ status: 'PAUSED' }), req.ip]
    );

    res.json({ message: 'Mandate paused successfully' });
  } catch (error) {
    next(error);
  }
});

// PUT /api/mandates/:id/resume - Resume mandate
router.put('/:id/resume', authenticate, requirePermission('mandates', 'READ_WRITE'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const current = await query(`SELECT * FROM mandates WHERE ${isUUID ? 'id = $1' : 'mandate_id = $1'}`, [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Mandate not found' });

    const mandate = current.rows[0];
    if (mandate.status !== 'PAUSED') {
      return res.status(400).json({ error: 'Only paused mandates can be resumed' });
    }

    await query("UPDATE mandates SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1", [mandate.id]);

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES ($1, 'RESUME_MANDATE', 'MANDATES', 'mandate', $2, $3, $4, $5)`,
      [req.user.id, mandate.mandate_id, JSON.stringify({ status: 'PAUSED' }), JSON.stringify({ status: 'ACTIVE' }), req.ip]
    );

    res.json({ message: 'Mandate resumed successfully' });
  } catch (error) {
    next(error);
  }
});

// PUT /api/mandates/:id/revoke - Revoke mandate (permanent)
router.put('/:id/revoke', authenticate, requirePermission('mandates', 'READ_WRITE'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const current = await query(`SELECT * FROM mandates WHERE ${isUUID ? 'id = $1' : 'mandate_id = $1'}`, [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Mandate not found' });

    const mandate = current.rows[0];
    if (mandate.status === 'REVOKED') {
      return res.status(400).json({ error: 'Mandate is already revoked' });
    }

    await query("UPDATE mandates SET status = 'REVOKED', updated_at = NOW() WHERE id = $1", [mandate.id]);

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES ($1, 'REVOKE_MANDATE', 'MANDATES', 'mandate', $2, $3, $4, $5)`,
      [req.user.id, mandate.mandate_id, JSON.stringify({ status: mandate.status }), JSON.stringify({ status: 'REVOKED' }), req.ip]
    );

    res.json({ message: 'Mandate revoked permanently' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
