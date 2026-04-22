const express = require('express');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');

const router = express.Router();

// GET /api/orders - List orders with search & filters
router.get('/', authenticate, requirePermission('orders'), validatePagination, async (req, res, next) => {
  try {
    const { limit, offset, page } = req.pagination;
    const { search, status, gateway, payment_method, date_from, date_to, amount_min, amount_max } = req.query;

    let where = ['1=1'];
    let params = [];
    let paramCount = 0;

    // Basic search (order_id, customer_email, customer_phone)
    if (search) {
      paramCount++;
      where.push(`(o.order_id ILIKE $${paramCount} OR o.customer_email ILIKE $${paramCount} OR o.customer_phone ILIKE $${paramCount} OR o.customer_name ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }

    // Advanced filters
    if (status) {
      paramCount++;
      where.push(`o.status = $${paramCount}`);
      params.push(status);
    }
    if (gateway) {
      paramCount++;
      where.push(`o.gateway = $${paramCount}`);
      params.push(gateway);
    }
    if (payment_method) {
      paramCount++;
      where.push(`o.payment_method = $${paramCount}`);
      params.push(payment_method);
    }
    if (date_from) {
      paramCount++;
      where.push(`o.created_at >= $${paramCount}`);
      params.push(date_from);
    }
    if (date_to) {
      paramCount++;
      where.push(`o.created_at <= $${paramCount}`);
      params.push(date_to);
    }
    if (amount_min) {
      paramCount++;
      where.push(`o.amount >= $${paramCount}`);
      params.push(parseFloat(amount_min));
    }
    if (amount_max) {
      paramCount++;
      where.push(`o.amount <= $${paramCount}`);
      params.push(parseFloat(amount_max));
    }

    const whereClause = where.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) FROM orders o WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT o.*, m.name as merchant_name, m.merchant_id as merchant_code
       FROM orders o
       LEFT JOIN merchants m ON o.merchant_id = m.id
       WHERE ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, limit, offset]
    );

    res.json({
      orders: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/orders/stats - Order statistics
router.get('/stats', authenticate, requirePermission('orders'), async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;
    let interval;
    switch (period) {
      case '1d': interval = '1 day'; break;
      case '7d': interval = '7 days'; break;
      case '30d': interval = '30 days'; break;
      case '90d': interval = '90 days'; break;
      default: interval = '7 days';
    }

    const stats = await query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'CHARGED') as successful_orders,
        COUNT(*) FILTER (WHERE status IN ('AUTHENTICATION_FAILED','AUTHORIZATION_FAILED','JUSPAY_DECLINED')) as failed_orders,
        COUNT(*) FILTER (WHERE status = 'PENDING_VBV') as pending_orders,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CHARGED'), 0) as total_revenue,
        COALESCE(AVG(amount) FILTER (WHERE status = 'CHARGED'), 0) as avg_order_value,
        ROUND(COUNT(*) FILTER (WHERE status = 'CHARGED')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}'
    `);

    // Daily breakdown
    const daily = await query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'CHARGED') as successful,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CHARGED'), 0) as revenue
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // By gateway
    const byGateway = await query(`
      SELECT
        gateway,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'CHARGED') as successful,
        ROUND(COUNT(*) FILTER (WHERE status = 'CHARGED')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}' AND gateway IS NOT NULL
      GROUP BY gateway
      ORDER BY total DESC
    `);

    // By payment method
    const byPaymentMethod = await query(`
      SELECT
        payment_method,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'CHARGED') as successful,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CHARGED'), 0) as revenue
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}' AND payment_method IS NOT NULL
      GROUP BY payment_method
      ORDER BY total DESC
    `);

    // By status distribution
    const byStatus = await query(`
      SELECT status, COUNT(*) as count
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY status
      ORDER BY count DESC
    `);

    res.json({
      summary: stats.rows[0],
      daily: daily.rows,
      byGateway: byGateway.rows,
      byPaymentMethod: byPaymentMethod.rows,
      byStatus: byStatus.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/orders/:id - Order details with transactions, refunds, audit trail
router.get('/:id', authenticate, requirePermission('orders'), async (req, res, next) => {
  try {
    const orderId = req.params.id;

    const orderResult = await query(
      `SELECT o.*, m.name as merchant_name, m.merchant_id as merchant_code
       FROM orders o
       LEFT JOIN merchants m ON o.merchant_id = m.id
       WHERE o.id = $1 OR o.order_id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Get transactions
    const txns = await query(
      'SELECT * FROM transactions WHERE order_id = $1 ORDER BY created_at DESC',
      [order.id]
    );

    // Get refunds
    const refunds = await query(
      `SELECT r.*, u1.email as initiated_by_email, u2.email as approved_by_email
       FROM refunds r
       LEFT JOIN users u1 ON r.initiated_by = u1.id
       LEFT JOIN users u2 ON r.approved_by = u2.id
       WHERE r.order_id = $1 ORDER BY r.created_at DESC`,
      [order.id]
    );

    // Get chargebacks
    const chargebacks = await query(
      'SELECT * FROM chargebacks WHERE order_id = $1 ORDER BY created_at DESC',
      [order.id]
    );

    // Get audit trail
    const auditTrail = await query(
      `SELECT al.*, u.email as user_email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.entity_type = 'order' AND al.entity_id = $1
       ORDER BY al.created_at DESC LIMIT 50`,
      [order.order_id]
    );

    res.json({
      order,
      transactions: txns.rows,
      refunds: refunds.rows,
      chargebacks: chargebacks.rows,
      auditTrail: auditTrail.rows,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
