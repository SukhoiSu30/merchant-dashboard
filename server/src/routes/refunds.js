const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validateRefund, validatePagination } = require('../middleware/validation');

const router = express.Router();

// GET /api/refunds - List refunds
router.get('/', authenticate, requirePermission('refunds'), validatePagination, async (req, res, next) => {
  try {
    const { limit, offset, page } = req.pagination;
    const { search, status, refund_type, date_from, date_to } = req.query;

    let where = ['1=1'];
    let params = [];
    let pc = 0;

    if (search) { pc++; where.push(`(r.refund_id ILIKE $${pc} OR o.order_id ILIKE $${pc})`); params.push(`%${search}%`); }
    if (status) { pc++; where.push(`r.status = $${pc}`); params.push(status); }
    if (refund_type) { pc++; where.push(`r.refund_type = $${pc}`); params.push(refund_type); }
    if (date_from) { pc++; where.push(`r.created_at >= $${pc}`); params.push(date_from); }
    if (date_to) { pc++; where.push(`r.created_at <= $${pc}`); params.push(date_to); }

    const whereClause = where.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) FROM refunds r LEFT JOIN orders o ON r.order_id = o.id WHERE ${whereClause}`, params
    );

    const result = await query(
      `SELECT r.*, o.order_id as order_code, o.amount as order_amount, o.customer_email,
              u1.email as initiated_by_email, u2.email as approved_by_email
       FROM refunds r
       LEFT JOIN orders o ON r.order_id = o.id
       LEFT JOIN users u1 ON r.initiated_by = u1.id
       LEFT JOIN users u2 ON r.approved_by = u2.id
       WHERE ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${pc + 1} OFFSET $${pc + 2}`,
      [...params, limit, offset]
    );

    res.json({
      refunds: result.rows,
      pagination: { page, limit, total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/refunds - Create refund
router.post('/', authenticate, requirePermission('refunds', 'READ_WRITE'), validateRefund, async (req, res, next) => {
  try {
    const { order_id, amount, reason, refund_type = 'FULL' } = req.body;

    // Validate order exists
    const orderResult = await query('SELECT * FROM orders WHERE id = $1 OR order_id = $1', [order_id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderResult.rows[0];
    if (order.status !== 'CHARGED') {
      return res.status(400).json({ error: 'Only charged orders can be refunded' });
    }

    const remainingRefundable = parseFloat(order.amount) - parseFloat(order.refunded_amount);
    if (amount > remainingRefundable) {
      return res.status(400).json({ error: `Maximum refundable amount is ${remainingRefundable}` });
    }

    const refundId = `REF_${uuidv4().substring(0, 12).toUpperCase()}`;

    const result = await query(
      `INSERT INTO refunds (refund_id, order_id, amount, currency, refund_type, reason, gateway, initiated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [refundId, order.id, amount, order.currency, refund_type, reason, order.gateway, req.user.id]
    );

    // Update order refunded amount (simulated - mark as success immediately)
    await query(
      `UPDATE refunds SET status = 'SUCCESS' WHERE id = $1`,
      [result.rows[0].id]
    );
    await query(
      `UPDATE orders SET refunded_amount = refunded_amount + $1,
        status = CASE WHEN refunded_amount + $1 >= amount THEN 'REFUNDED' ELSE status END,
        updated_at = NOW()
       WHERE id = $2`,
      [amount, order.id]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'CREATE_REFUND', 'REFUNDS', 'refund', $2, $3, $4)`,
      [req.user.id, refundId, JSON.stringify({ amount, reason, refund_type }), req.ip]
    );

    res.status(201).json({ refund: result.rows[0], message: 'Refund processed successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /api/refunds/:id - Refund details
router.get('/:id', authenticate, requirePermission('refunds'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const result = await query(
      `SELECT r.*, o.order_id as order_code, o.amount as order_amount, o.customer_email, o.customer_name,
              u1.email as initiated_by_email, u2.email as approved_by_email
       FROM refunds r
       LEFT JOIN orders o ON r.order_id = o.id
       LEFT JOIN users u1 ON r.initiated_by = u1.id
       LEFT JOIN users u2 ON r.approved_by = u2.id
       WHERE ${isUUID ? 'r.id = $1' : 'r.refund_id = $1'}`,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Refund not found' });

    // Audit trail
    const audit = await query(
      `SELECT al.*, u.email as user_email FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.entity_type = 'refund' AND al.entity_id = $1
       ORDER BY al.created_at DESC`,
      [result.rows[0].refund_id]
    );

    res.json({ refund: result.rows[0], auditTrail: audit.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
