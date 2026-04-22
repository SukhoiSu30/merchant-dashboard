const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/overview - Main dashboard data
router.get('/overview', authenticate, async (req, res, next) => {
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

    // Overall metrics
    const metrics = await query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'CHARGED') as success_count,
        COUNT(*) FILTER (WHERE status IN ('AUTHENTICATION_FAILED','AUTHORIZATION_FAILED','JUSPAY_DECLINED')) as failed_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CHARGED'), 0) as total_revenue,
        COALESCE(SUM(refunded_amount), 0) as total_refunds,
        COALESCE(AVG(amount) FILTER (WHERE status = 'CHARGED'), 0) as avg_order_value,
        ROUND(COUNT(*) FILTER (WHERE status = 'CHARGED')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}'
    `);

    // Previous period for comparison
    const prevMetrics = await query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CHARGED'), 0) as total_revenue,
        ROUND(COUNT(*) FILTER (WHERE status = 'CHARGED')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}' * 2
        AND created_at < NOW() - INTERVAL '${interval}'
    `);

    // Hourly/Daily trend
    const trend = await query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'CHARGED') as successful,
        COUNT(*) FILTER (WHERE status IN ('AUTHENTICATION_FAILED','AUTHORIZATION_FAILED','JUSPAY_DECLINED')) as failed,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CHARGED'), 0) as revenue,
        ROUND(COUNT(*) FILTER (WHERE status = 'CHARGED')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // Gateway performance
    const gateways = await query(`
      SELECT
        gateway,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'CHARGED') as successful,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CHARGED'), 0) as revenue,
        ROUND(COUNT(*) FILTER (WHERE status = 'CHARGED')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}' AND gateway IS NOT NULL
      GROUP BY gateway
      ORDER BY total DESC
      LIMIT 10
    `);

    // Payment method split
    const paymentMethods = await query(`
      SELECT
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CHARGED'), 0) as revenue,
        ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '${interval}'), 0) * 100, 2) as percentage
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}' AND payment_method IS NOT NULL
      GROUP BY payment_method
      ORDER BY count DESC
    `);

    // Recent orders
    const recentOrders = await query(`
      SELECT o.order_id, o.amount, o.currency, o.status, o.payment_method, o.gateway,
             o.customer_email, o.created_at, m.name as merchant_name
      FROM orders o
      LEFT JOIN merchants m ON o.merchant_id = m.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    // Active refunds count
    const refundStats = await query(`
      SELECT
        COUNT(*) as total_refunds,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending_refunds,
        COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'), 0) as refunded_amount
      FROM refunds
      WHERE created_at >= NOW() - INTERVAL '${interval}'
    `);

    res.json({
      metrics: metrics.rows[0],
      previousPeriod: prevMetrics.rows[0],
      trend: trend.rows,
      gateways: gateways.rows,
      paymentMethods: paymentMethods.rows,
      recentOrders: recentOrders.rows,
      refundStats: refundStats.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/live - Real-time stats (last 1 hour)
router.get('/live', authenticate, async (req, res, next) => {
  try {
    const live = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'CHARGED') as successful,
        COUNT(*) FILTER (WHERE status IN ('AUTHENTICATION_FAILED','AUTHORIZATION_FAILED')) as failed,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CHARGED'), 0) as revenue
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `);

    // Per-minute breakdown for last hour
    const perMinute = await query(`
      SELECT
        date_trunc('minute', created_at) as minute,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'CHARGED') as successful
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '1 hour'
      GROUP BY date_trunc('minute', created_at)
      ORDER BY minute
    `);

    res.json({ live: live.rows[0], perMinute: perMinute.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
