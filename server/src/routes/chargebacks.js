const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');

const router = express.Router();

// GET /api/chargebacks - List chargebacks
router.get('/', authenticate, requirePermission('chargebacks'), validatePagination, async (req, res, next) => {
  try {
    const { limit, offset, page } = req.pagination;
    const { search, status, date_from, date_to } = req.query;

    let where = ['1=1'];
    let params = [];
    let pc = 0;

    if (search) {
      pc++;
      where.push(`(c.chargeback_id ILIKE $${pc} OR o.order_id ILIKE $${pc} OR o.customer_email ILIKE $${pc})`);
      params.push(`%${search}%`);
    }
    if (status) { pc++; where.push(`c.status = $${pc}`); params.push(status); }
    if (date_from) { pc++; where.push(`c.created_at >= $${pc}`); params.push(date_from); }
    if (date_to) { pc++; where.push(`c.created_at <= $${pc}`); params.push(date_to); }

    const whereClause = where.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) FROM chargebacks c LEFT JOIN orders o ON c.order_id = o.id WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT c.*, o.order_id as order_code, o.customer_email, o.customer_name,
              o.amount as order_amount, o.currency, o.gateway, o.payment_method,
              m.name as merchant_name
       FROM chargebacks c
       LEFT JOIN orders o ON c.order_id = o.id
       LEFT JOIN merchants m ON o.merchant_id = m.id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${pc + 1} OFFSET $${pc + 2}`,
      [...params, limit, offset]
    );

    res.json({
      chargebacks: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/chargebacks/stats - Chargeback statistics
router.get('/stats', authenticate, requirePermission('chargebacks'), async (req, res, next) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'RECEIVED') as received,
        COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW') as under_review,
        COUNT(*) FILTER (WHERE status = 'RESOLVED_IN_MERCHANT_FAVOUR') as won,
        COUNT(*) FILTER (WHERE status = 'RESOLVED_IN_CUSTOMER_FAVOUR') as lost,
        COUNT(*) FILTER (WHERE status = 'ESCALATED') as escalated,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(amount) FILTER (WHERE status = 'RESOLVED_IN_CUSTOMER_FAVOUR'), 0) as lost_amount
      FROM chargebacks
    `);

    const byReason = await query(`
      SELECT reason, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
      FROM chargebacks
      GROUP BY reason ORDER BY count DESC
    `);

    res.json({ summary: stats.rows[0], byReason: byReason.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/chargebacks/:id - Chargeback details
router.get('/:id', authenticate, requirePermission('chargebacks'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const result = await query(
      `SELECT c.*, o.order_id as order_code, o.customer_email, o.customer_name,
              o.customer_phone, o.amount as order_amount, o.currency, o.gateway,
              o.payment_method, o.payment_method_type, o.card_brand, o.card_last_four,
              m.name as merchant_name
       FROM chargebacks c
       LEFT JOIN orders o ON c.order_id = o.id
       LEFT JOIN merchants m ON o.merchant_id = m.id
       WHERE ${isUUID ? 'c.id = $1' : 'c.chargeback_id = $1'}`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chargeback not found' });
    }

    const cb = result.rows[0];

    // Get order transactions
    const txns = await query(
      'SELECT * FROM transactions WHERE order_id = $1 ORDER BY created_at',
      [cb.order_id]
    );

    // Get audit trail
    const audit = await query(
      `SELECT al.*, u.email as user_email FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.entity_type = 'chargeback' AND al.entity_id = $1
       ORDER BY al.created_at DESC`,
      [cb.chargeback_id]
    );

    res.json({ chargeback: cb, transactions: txns.rows, auditTrail: audit.rows });
  } catch (error) {
    next(error);
  }
});

// PUT /api/chargebacks/:id/status - Update chargeback status
router.put('/:id/status', authenticate, requirePermission('chargebacks', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['RECEIVED', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED_IN_MERCHANT_FAVOUR', 'RESOLVED_IN_CUSTOMER_FAVOUR'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const current = await query(`SELECT * FROM chargebacks WHERE ${isUUID ? 'id = $1' : 'chargeback_id = $1'}`, [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Chargeback not found' });

    const cb = current.rows[0];
    const updates = { status };
    if (status.startsWith('RESOLVED')) updates.resolved_at = new Date().toISOString();

    const result = await query(
      `UPDATE chargebacks SET status = $1, resolved_at = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, updates.resolved_at || cb.resolved_at, cb.id]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, old_values, new_values, description, ip_address)
       VALUES ($1, 'UPDATE_CHARGEBACK_STATUS', 'CHARGEBACKS', 'chargeback', $2, $3, $4, $5, $6)`,
      [
        req.user.id, cb.chargeback_id,
        JSON.stringify({ status: cb.status }),
        JSON.stringify({ status }),
        notes || `Status changed from ${cb.status} to ${status}`,
        req.ip
      ]
    );

    res.json({ chargeback: result.rows[0], message: 'Chargeback status updated' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
