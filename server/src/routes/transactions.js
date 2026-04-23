const express = require('express');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');

const router = express.Router();

// GET /api/transactions - List transactions with search & filters
router.get('/', authenticate, requirePermission('orders'), validatePagination, async (req, res, next) => {
  try {
    const { limit, offset, page } = req.pagination;
    const { search, status, txn_type, gateway, payment_method, date_from, date_to } = req.query;

    let where = ['1=1'];
    let params = [];
    let pc = 0;

    if (search) {
      pc++;
      where.push(`(t.txn_id ILIKE $${pc} OR o.order_id ILIKE $${pc} OR t.gateway_txn_id ILIKE $${pc})`);
      params.push(`%${search}%`);
    }
    if (status) { pc++; where.push(`t.status = $${pc}`); params.push(status); }
    if (txn_type) { pc++; where.push(`t.txn_type = $${pc}`); params.push(txn_type); }
    if (gateway) { pc++; where.push(`t.gateway = $${pc}`); params.push(gateway); }
    if (payment_method) { pc++; where.push(`t.payment_method = $${pc}`); params.push(payment_method); }
    if (date_from) { pc++; where.push(`t.created_at >= $${pc}`); params.push(date_from); }
    if (date_to) { pc++; where.push(`t.created_at <= $${pc}`); params.push(date_to); }

    const whereClause = where.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) FROM transactions t LEFT JOIN orders o ON t.order_id = o.id WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT t.*, o.order_id as order_code, o.customer_email, o.customer_name,
              o.amount as order_amount, o.currency, o.card_brand, o.card_last_four,
              o.payment_method_type, m.name as merchant_name
       FROM transactions t
       LEFT JOIN orders o ON t.order_id = o.id
       LEFT JOIN merchants m ON o.merchant_id = m.id
       WHERE ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT $${pc + 1} OFFSET $${pc + 2}`,
      [...params, limit, offset]
    );

    res.json({
      transactions: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/transactions/stats - Transaction statistics
router.get('/stats', authenticate, requirePermission('orders'), async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;
    let interval;
    switch (period) {
      case '1d': interval = '1 day'; break;
      case '7d': interval = '7 days'; break;
      case '30d': interval = '30 days'; break;
      default: interval = '7 days';
    }

    const stats = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'), 0) as success_amount,
        ROUND(COUNT(*) FILTER (WHERE status = 'SUCCESS')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM transactions
      WHERE created_at >= NOW() - INTERVAL '${interval}'
    `);

    const byGateway = await query(`
      SELECT gateway, COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful,
        ROUND(COUNT(*) FILTER (WHERE status = 'SUCCESS')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM transactions
      WHERE created_at >= NOW() - INTERVAL '${interval}' AND gateway IS NOT NULL
      GROUP BY gateway ORDER BY total DESC
    `);

    const byType = await query(`
      SELECT txn_type, COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful
      FROM transactions
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY txn_type ORDER BY total DESC
    `);

    res.json({ summary: stats.rows[0], byGateway: byGateway.rows, byType: byType.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/transactions/:id - Transaction details
router.get('/:id', authenticate, requirePermission('orders'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const result = await query(
      `SELECT t.*, o.order_id as order_code, o.customer_email, o.customer_name,
              o.customer_phone, o.customer_id, o.amount as order_amount, o.currency,
              o.card_brand, o.card_last_four, o.card_type, o.payment_method_type,
              o.billing_address, o.shipping_address, o.risk_score, o.risk_status,
              o.error_code as order_error_code, o.error_message as order_error_message,
              o.gateway_reference_id, o.gateway_order_id,
              o.udf1, o.udf2, o.udf3, o.udf4, o.udf5,
              m.name as merchant_name, m.merchant_id as merchant_code
       FROM transactions t
       LEFT JOIN orders o ON t.order_id = o.id
       LEFT JOIN merchants m ON o.merchant_id = m.id
       WHERE ${isUUID ? 't.id = $1' : 't.txn_id = $1'}`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const txn = result.rows[0];

    // Get related transactions for the same order
    const relatedTxns = await query(
      `SELECT * FROM transactions WHERE order_id = $1 AND id != $2 ORDER BY created_at`,
      [txn.order_id, txn.id]
    );

    // Get refunds for this order
    const refunds = await query(
      `SELECT r.*, u.email as initiated_by_email FROM refunds r
       LEFT JOIN users u ON r.initiated_by = u.id
       WHERE r.order_id = $1 ORDER BY r.created_at DESC`,
      [txn.order_id]
    );

    res.json({
      transaction: txn,
      relatedTransactions: relatedTxns.rows,
      refunds: refunds.rows,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
