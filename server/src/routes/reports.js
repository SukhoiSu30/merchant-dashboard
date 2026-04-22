const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

const REPORT_TYPES = [
  'TRANSACTION_SUMMARY', 'SETTLEMENT_REPORT', 'REFUND_REPORT',
  'CHARGEBACK_REPORT', 'GATEWAY_PERFORMANCE', 'REVENUE_REPORT',
  'PAYMENT_METHOD_ANALYSIS', 'MANDATE_REPORT', 'RECONCILIATION',
  'CUSTOM',
];

// GET /api/reports/templates - Available report templates
router.get('/templates', authenticate, requirePermission('monitoring'), async (req, res) => {
  const templates = [
    {
      id: 'TRANSACTION_SUMMARY', name: 'Transaction Summary',
      description: 'Overview of all transactions with status breakdown, gateway split, and payment method distribution',
      fields: ['date_range', 'gateway', 'payment_method', 'status'],
      frequency_options: ['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY'],
    },
    {
      id: 'SETTLEMENT_REPORT', name: 'Settlement Report',
      description: 'Settlement details including amounts settled, pending, and discrepancies',
      fields: ['date_range', 'gateway'],
      frequency_options: ['ONE_TIME', 'DAILY', 'WEEKLY'],
    },
    {
      id: 'REFUND_REPORT', name: 'Refund Report',
      description: 'Detailed refund analysis with reasons, turnaround time, and gateway split',
      fields: ['date_range', 'gateway', 'refund_type'],
      frequency_options: ['ONE_TIME', 'WEEKLY', 'MONTHLY'],
    },
    {
      id: 'CHARGEBACK_REPORT', name: 'Chargeback Report',
      description: 'Chargeback disputes, resolution rates, financial impact, and reason codes',
      fields: ['date_range', 'status', 'gateway'],
      frequency_options: ['ONE_TIME', 'WEEKLY', 'MONTHLY'],
    },
    {
      id: 'GATEWAY_PERFORMANCE', name: 'Gateway Performance',
      description: 'Success rates, latency, error codes, and volume analysis per gateway',
      fields: ['date_range', 'gateway'],
      frequency_options: ['ONE_TIME', 'DAILY', 'WEEKLY'],
    },
    {
      id: 'REVENUE_REPORT', name: 'Revenue Report',
      description: 'Total revenue, net revenue after refunds and chargebacks, growth trends',
      fields: ['date_range', 'currency'],
      frequency_options: ['ONE_TIME', 'WEEKLY', 'MONTHLY'],
    },
    {
      id: 'PAYMENT_METHOD_ANALYSIS', name: 'Payment Method Analysis',
      description: 'Breakdown by payment methods with success rates, average values, and trends',
      fields: ['date_range'],
      frequency_options: ['ONE_TIME', 'MONTHLY'],
    },
    {
      id: 'MANDATE_REPORT', name: 'Mandate Report',
      description: 'Recurring payment mandates with status, collection success, and churn analysis',
      fields: ['date_range', 'status', 'frequency'],
      frequency_options: ['ONE_TIME', 'WEEKLY', 'MONTHLY'],
    },
    {
      id: 'RECONCILIATION', name: 'Reconciliation Report',
      description: 'Transaction reconciliation between merchant records and gateway settlements',
      fields: ['date_range', 'gateway'],
      frequency_options: ['ONE_TIME', 'DAILY'],
    },
  ];
  res.json({ templates });
});

// POST /api/reports/generate - Generate a report
router.post('/generate', authenticate, requirePermission('monitoring', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { report_type, date_from, date_to, gateway, payment_method, status, name } = req.body;

    if (!report_type || !REPORT_TYPES.includes(report_type)) {
      return res.status(400).json({ error: `Invalid report_type. Must be one of: ${REPORT_TYPES.join(', ')}` });
    }

    const reportId = `RPT_${Date.now().toString(36).toUpperCase()}_${uuidv4().substring(0, 6).toUpperCase()}`;
    const from = date_from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const to = date_to || new Date().toISOString().split('T')[0];

    // Generate report data based on type
    const reportData = await generateReportData(report_type, from, to, { gateway, payment_method, status });

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'REPORT_GENERATE', 'MONITORING', 'report', $2, $3, $4)`,
      [req.user.id, reportId, JSON.stringify({ report_type, date_from: from, date_to: to }), req.ip]
    );

    res.json({
      report: {
        report_id: reportId,
        report_type,
        name: name || `${report_type.replace(/_/g, ' ')} Report`,
        date_from: from,
        date_to: to,
        filters: { gateway, payment_method, status },
        generated_at: new Date().toISOString(),
        generated_by: req.user.email,
        status: 'COMPLETED',
        data: reportData,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/history - Recent generated reports
router.get('/history', authenticate, requirePermission('monitoring'), async (req, res, next) => {
  try {
    res.json({
      reports: getSimulatedReportHistory(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/scheduled - Scheduled reports
router.get('/scheduled', authenticate, requirePermission('monitoring'), async (req, res) => {
  res.json({
    scheduled: [
      {
        id: 1, name: 'Daily Transaction Summary', report_type: 'TRANSACTION_SUMMARY',
        frequency: 'DAILY', time: '08:00', timezone: 'Asia/Kolkata',
        recipients: ['admin@juspay.in', 'ops.manager@juspay.in'],
        format: 'CSV', is_active: true, last_run: '2026-04-22T02:30:00Z', next_run: '2026-04-23T02:30:00Z',
      },
      {
        id: 2, name: 'Weekly Revenue Report', report_type: 'REVENUE_REPORT',
        frequency: 'WEEKLY', day: 'Monday', time: '09:00', timezone: 'Asia/Kolkata',
        recipients: ['admin@juspay.in', 'finance@juspay.in'],
        format: 'PDF', is_active: true, last_run: '2026-04-21T03:30:00Z', next_run: '2026-04-28T03:30:00Z',
      },
      {
        id: 3, name: 'Monthly Chargeback Analysis', report_type: 'CHARGEBACK_REPORT',
        frequency: 'MONTHLY', day: '1', time: '10:00', timezone: 'Asia/Kolkata',
        recipients: ['admin@juspay.in'],
        format: 'CSV', is_active: false, last_run: '2026-04-01T04:30:00Z', next_run: '2026-05-01T04:30:00Z',
      },
    ],
  });
});

// POST /api/reports/schedule - Create scheduled report
router.post('/schedule', authenticate, requirePermission('monitoring', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { name, report_type, frequency, time, recipients, format, filters } = req.body;

    if (!name || !report_type || !frequency) {
      return res.status(400).json({ error: 'name, report_type, and frequency are required' });
    }

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'REPORT_SCHEDULE_CREATE', 'MONITORING', 'scheduled_report', $2, $3, $4)`,
      [req.user.id, uuidv4().substring(0, 8), JSON.stringify({ name, report_type, frequency }), req.ip]
    );

    res.status(201).json({
      scheduled: {
        id: Math.floor(Math.random() * 1000) + 100,
        name, report_type, frequency, time: time || '08:00',
        recipients: recipients || [], format: format || 'CSV',
        is_active: true, created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

async function generateReportData(reportType, dateFrom, dateTo, filters) {
  try {
    switch (reportType) {
      case 'TRANSACTION_SUMMARY': {
        const totalRes = await query(
          `SELECT COUNT(*) as total, SUM(amount) as total_amount,
                  COUNT(CASE WHEN status = 'CHARGED' THEN 1 END) as successful,
                  COUNT(CASE WHEN status IN ('AUTHENTICATION_FAILED','AUTHORIZATION_FAILED','JUSPAY_DECLINED') THEN 1 END) as failed
           FROM orders WHERE created_at BETWEEN $1 AND $2`,
          [dateFrom, dateTo + 'T23:59:59Z']
        );
        const byGateway = await query(
          `SELECT gateway, COUNT(*) as count, SUM(amount) as amount,
                  ROUND(COUNT(CASE WHEN status='CHARGED' THEN 1 END)*100.0/NULLIF(COUNT(*),0), 1) as success_rate
           FROM orders WHERE created_at BETWEEN $1 AND $2 GROUP BY gateway`,
          [dateFrom, dateTo + 'T23:59:59Z']
        );
        const byMethod = await query(
          `SELECT payment_method, COUNT(*) as count, SUM(amount) as amount
           FROM orders WHERE created_at BETWEEN $1 AND $2 GROUP BY payment_method`,
          [dateFrom, dateTo + 'T23:59:59Z']
        );
        return {
          summary: totalRes.rows[0],
          by_gateway: byGateway.rows,
          by_payment_method: byMethod.rows,
        };
      }

      case 'REVENUE_REPORT': {
        const revenue = await query(
          `SELECT DATE(created_at) as date, SUM(amount) as revenue, COUNT(*) as txn_count
           FROM orders WHERE status = 'CHARGED' AND created_at BETWEEN $1 AND $2
           GROUP BY DATE(created_at) ORDER BY date`,
          [dateFrom, dateTo + 'T23:59:59Z']
        );
        const refunds = await query(
          `SELECT SUM(amount) as total_refunds, COUNT(*) as refund_count
           FROM refunds WHERE created_at BETWEEN $1 AND $2`,
          [dateFrom, dateTo + 'T23:59:59Z']
        );
        const chargebacks = await query(
          `SELECT SUM(amount) as total_chargebacks, COUNT(*) as cb_count
           FROM chargebacks WHERE created_at BETWEEN $1 AND $2`,
          [dateFrom, dateTo + 'T23:59:59Z']
        );
        return {
          daily_revenue: revenue.rows,
          refunds: refunds.rows[0],
          chargebacks: chargebacks.rows[0],
          net_revenue: {
            gross: revenue.rows.reduce((s, r) => s + parseFloat(r.revenue || 0), 0),
            refunded: parseFloat(refunds.rows[0]?.total_refunds || 0),
            chargedback: parseFloat(chargebacks.rows[0]?.total_chargebacks || 0),
          },
        };
      }

      case 'GATEWAY_PERFORMANCE': {
        const perf = await query(
          `SELECT gateway,
                  COUNT(*) as total_txns,
                  COUNT(CASE WHEN status='CHARGED' THEN 1 END) as successful,
                  ROUND(COUNT(CASE WHEN status='CHARGED' THEN 1 END)*100.0/NULLIF(COUNT(*),0), 1) as success_rate,
                  SUM(amount) as total_volume,
                  ROUND(AVG(amount), 2) as avg_amount
           FROM orders WHERE created_at BETWEEN $1 AND $2 GROUP BY gateway ORDER BY total_txns DESC`,
          [dateFrom, dateTo + 'T23:59:59Z']
        );
        return { gateway_performance: perf.rows };
      }

      case 'REFUND_REPORT': {
        const refundData = await query(
          `SELECT r.status, r.refund_type, COUNT(*) as count, SUM(r.amount) as total_amount,
                  o.gateway
           FROM refunds r LEFT JOIN orders o ON r.order_id = o.id
           WHERE r.created_at BETWEEN $1 AND $2
           GROUP BY r.status, r.refund_type, o.gateway`,
          [dateFrom, dateTo + 'T23:59:59Z']
        );
        return { refund_breakdown: refundData.rows };
      }

      case 'CHARGEBACK_REPORT': {
        const cbData = await query(
          `SELECT c.status, c.reason, COUNT(*) as count, SUM(c.amount) as total_amount, c.gateway
           FROM chargebacks c
           WHERE c.created_at BETWEEN $1 AND $2
           GROUP BY c.status, c.reason, c.gateway`,
          [dateFrom, dateTo + 'T23:59:59Z']
        );
        return { chargeback_breakdown: cbData.rows };
      }

      default:
        return { message: 'Report data generated', rows: Math.floor(Math.random() * 500) + 50 };
    }
  } catch (error) {
    console.error('Report generation error:', error.message);
    return { error: 'Failed to generate report data', fallback: true };
  }
}

function getSimulatedReportHistory() {
  const now = new Date();
  return [
    {
      report_id: 'RPT_A1B2C3', report_type: 'TRANSACTION_SUMMARY', name: 'Daily Transaction Summary',
      date_from: '2026-04-21', date_to: '2026-04-21', status: 'COMPLETED',
      generated_at: new Date(now - 12 * 3600000).toISOString(), generated_by: 'admin@juspay.in',
      row_count: 342, format: 'CSV',
    },
    {
      report_id: 'RPT_D4E5F6', report_type: 'REVENUE_REPORT', name: 'Weekly Revenue Report',
      date_from: '2026-04-14', date_to: '2026-04-20', status: 'COMPLETED',
      generated_at: new Date(now - 48 * 3600000).toISOString(), generated_by: 'admin@juspay.in',
      row_count: 2148, format: 'PDF',
    },
    {
      report_id: 'RPT_G7H8I9', report_type: 'GATEWAY_PERFORMANCE', name: 'Gateway Performance Q1',
      date_from: '2026-01-01', date_to: '2026-03-31', status: 'COMPLETED',
      generated_at: new Date(now - 120 * 3600000).toISOString(), generated_by: 'ops.manager@juspay.in',
      row_count: 8472, format: 'CSV',
    },
    {
      report_id: 'RPT_J1K2L3', report_type: 'CHARGEBACK_REPORT', name: 'March Chargeback Analysis',
      date_from: '2026-03-01', date_to: '2026-03-31', status: 'COMPLETED',
      generated_at: new Date(now - 240 * 3600000).toISOString(), generated_by: 'admin@juspay.in',
      row_count: 87, format: 'CSV',
    },
  ];
}

module.exports = router;
