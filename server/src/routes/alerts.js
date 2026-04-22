const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

const ALERT_TYPES = [
  'SUCCESS_RATE_DROP', 'HIGH_FAILURE_RATE', 'GATEWAY_DOWN', 'LATENCY_SPIKE',
  'CHARGEBACK_SPIKE', 'REFUND_SPIKE', 'VOLUME_ANOMALY', 'SETTLEMENT_DELAY',
  'HIGH_DECLINE_RATE', 'FRAUD_DETECTION',
];

const SEVERITY_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const CHANNELS = ['EMAIL', 'SLACK', 'WEBHOOK', 'SMS', 'IN_APP'];

// GET /api/alerts/rules - List alert rules
router.get('/rules', authenticate, requirePermission('monitoring'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM monitoring_alerts WHERE merchant_id = $1 ORDER BY created_at DESC`,
      ['MERCH_001']
    );

    // If none exist, return simulated rules
    if (result.rows.length === 0) {
      return res.json({ rules: getSimulatedRules() });
    }
    res.json({ rules: result.rows });
  } catch (error) {
    res.json({ rules: getSimulatedRules() });
  }
});

// POST /api/alerts/rules - Create alert rule
router.post('/rules', authenticate, requirePermission('monitoring', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { alert_name, alert_type, severity, condition, threshold, gateway_filter,
            payment_method_filter, channels, cooldown_minutes, description } = req.body;

    if (!alert_name || !alert_type || !severity) {
      return res.status(400).json({ error: 'alert_name, alert_type, and severity are required' });
    }
    if (!ALERT_TYPES.includes(alert_type)) {
      return res.status(400).json({ error: `Invalid alert_type. Must be one of: ${ALERT_TYPES.join(', ')}` });
    }

    const alertId = `ALR_${uuidv4().substring(0, 8).toUpperCase()}`;

    const result = await query(
      `INSERT INTO monitoring_alerts (alert_id, merchant_id, alert_name, alert_type, severity,
        condition_config, threshold_value, gateway_filter, payment_method_filter,
        notification_channels, cooldown_minutes, description, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
       RETURNING *`,
      [
        alertId, 'MERCH_001', alert_name, alert_type, severity,
        JSON.stringify(condition || {}), threshold || null,
        gateway_filter || null, payment_method_filter || null,
        JSON.stringify(channels || ['IN_APP']), cooldown_minutes || 15,
        description || '',
      ]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'ALERT_RULE_CREATE', 'MONITORING', 'alert_rule', $2, $3, $4)`,
      [req.user.id, alertId, JSON.stringify({ alert_name, alert_type, severity }), req.ip]
    );

    res.status(201).json({ rule: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/alerts/rules/:id - Update alert rule
router.put('/rules/:id', authenticate, requirePermission('monitoring', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { alert_name, severity, threshold, channels, cooldown_minutes, is_active, description } = req.body;

    const existing = await query('SELECT * FROM monitoring_alerts WHERE id = $1 OR alert_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Alert rule not found' });

    const alert = existing.rows[0];
    const result = await query(
      `UPDATE monitoring_alerts SET
        alert_name = COALESCE($1, alert_name),
        severity = COALESCE($2, severity),
        threshold_value = COALESCE($3, threshold_value),
        notification_channels = COALESCE($4, notification_channels),
        cooldown_minutes = COALESCE($5, cooldown_minutes),
        is_active = COALESCE($6, is_active),
        description = COALESCE($7, description),
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        alert_name || null, severity || null, threshold || null,
        channels ? JSON.stringify(channels) : null, cooldown_minutes || null,
        is_active !== undefined ? is_active : null, description !== undefined ? description : null,
        alert.id,
      ]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'ALERT_RULE_UPDATE', 'MONITORING', 'alert_rule', $2, $3, $4)`,
      [req.user.id, alert.alert_id, JSON.stringify(req.body), req.ip]
    );

    res.json({ rule: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/alerts/rules/:id
router.delete('/rules/:id', authenticate, requirePermission('monitoring', 'READ_WRITE'), async (req, res, next) => {
  try {
    const existing = await query('SELECT * FROM monitoring_alerts WHERE id = $1 OR alert_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Alert rule not found' });

    await query('DELETE FROM monitoring_alerts WHERE id = $1', [existing.rows[0].id]);

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, ip_address)
       VALUES ($1, 'ALERT_RULE_DELETE', 'MONITORING', 'alert_rule', $2, $3)`,
      [req.user.id, existing.rows[0].alert_id, req.ip]
    );

    res.json({ message: 'Alert rule deleted' });
  } catch (error) {
    next(error);
  }
});

// GET /api/alerts/history - Alert history (simulated triggered alerts)
router.get('/history', authenticate, requirePermission('monitoring'), async (req, res, next) => {
  try {
    const { severity, alert_type, status, limit = 50 } = req.query;

    let alerts = getSimulatedAlertHistory();

    if (severity) alerts = alerts.filter(a => a.severity === severity);
    if (alert_type) alerts = alerts.filter(a => a.alert_type === alert_type);
    if (status) alerts = alerts.filter(a => a.status === status);

    res.json({
      alerts: alerts.slice(0, parseInt(limit)),
      summary: {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === 'CRITICAL').length,
        high: alerts.filter(a => a.severity === 'HIGH').length,
        medium: alerts.filter(a => a.severity === 'MEDIUM').length,
        acknowledged: alerts.filter(a => a.status === 'ACKNOWLEDGED').length,
        resolved: alerts.filter(a => a.status === 'RESOLVED').length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/alerts/history/:id/acknowledge
router.put('/history/:id/acknowledge', authenticate, requirePermission('monitoring', 'READ_WRITE'), async (req, res, next) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, ip_address)
       VALUES ($1, 'ALERT_ACKNOWLEDGE', 'MONITORING', 'alert', $2, $3)`,
      [req.user.id, req.params.id, req.ip]
    );
    res.json({ message: 'Alert acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by: req.user.email });
  } catch (error) {
    next(error);
  }
});

// GET /api/alerts/types - Available alert types
router.get('/types', authenticate, async (req, res) => {
  const types = ALERT_TYPES.map(t => ({
    value: t,
    label: t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: getAlertTypeDescription(t),
  }));
  res.json({ types, severities: SEVERITY_LEVELS, channels: CHANNELS });
});

function getAlertTypeDescription(type) {
  const descs = {
    SUCCESS_RATE_DROP: 'Triggers when success rate falls below threshold',
    HIGH_FAILURE_RATE: 'Triggers when failure rate exceeds threshold',
    GATEWAY_DOWN: 'Triggers when a gateway becomes unreachable',
    LATENCY_SPIKE: 'Triggers when average response time exceeds threshold',
    CHARGEBACK_SPIKE: 'Triggers when chargeback count spikes above normal',
    REFUND_SPIKE: 'Triggers when refund rate exceeds threshold',
    VOLUME_ANOMALY: 'Triggers on unusual transaction volume changes',
    SETTLEMENT_DELAY: 'Triggers when settlements are delayed beyond SLA',
    HIGH_DECLINE_RATE: 'Triggers when bank decline rate is unusually high',
    FRAUD_DETECTION: 'Triggers on suspected fraudulent activity patterns',
  };
  return descs[type] || '';
}

function getSimulatedRules() {
  return [
    {
      id: 1, alert_id: 'ALR_001', alert_name: 'Critical Success Rate Drop',
      alert_type: 'SUCCESS_RATE_DROP', severity: 'CRITICAL',
      threshold_value: 85, gateway_filter: null, payment_method_filter: null,
      notification_channels: JSON.stringify(['EMAIL', 'SLACK', 'IN_APP']),
      cooldown_minutes: 5, is_active: true, description: 'Alert when overall success rate drops below 85%',
      created_at: '2025-06-01T10:00:00Z',
    },
    {
      id: 2, alert_id: 'ALR_002', alert_name: 'Gateway Down Alert',
      alert_type: 'GATEWAY_DOWN', severity: 'CRITICAL',
      threshold_value: null, gateway_filter: null, payment_method_filter: null,
      notification_channels: JSON.stringify(['EMAIL', 'SLACK', 'SMS', 'IN_APP']),
      cooldown_minutes: 1, is_active: true, description: 'Immediate alert when any gateway goes down',
      created_at: '2025-06-01T10:05:00Z',
    },
    {
      id: 3, alert_id: 'ALR_003', alert_name: 'High Chargeback Rate',
      alert_type: 'CHARGEBACK_SPIKE', severity: 'HIGH',
      threshold_value: 1.5, gateway_filter: null, payment_method_filter: 'CARD',
      notification_channels: JSON.stringify(['EMAIL', 'IN_APP']),
      cooldown_minutes: 60, is_active: true, description: 'Alert when chargeback rate exceeds 1.5% for card payments',
      created_at: '2025-07-15T08:00:00Z',
    },
    {
      id: 4, alert_id: 'ALR_004', alert_name: 'UPI Latency Warning',
      alert_type: 'LATENCY_SPIKE', severity: 'MEDIUM',
      threshold_value: 5000, gateway_filter: null, payment_method_filter: 'UPI',
      notification_channels: JSON.stringify(['SLACK', 'IN_APP']),
      cooldown_minutes: 15, is_active: true, description: 'Alert when UPI payment latency exceeds 5 seconds',
      created_at: '2025-08-10T12:00:00Z',
    },
    {
      id: 5, alert_id: 'ALR_005', alert_name: 'Refund Volume Spike',
      alert_type: 'REFUND_SPIKE', severity: 'MEDIUM',
      threshold_value: 200, gateway_filter: null, payment_method_filter: null,
      notification_channels: JSON.stringify(['EMAIL', 'IN_APP']),
      cooldown_minutes: 30, is_active: false, description: 'Alert when refund count exceeds 200% of daily average',
      created_at: '2025-09-05T14:00:00Z',
    },
  ];
}

function getSimulatedAlertHistory() {
  const now = new Date();
  return [
    {
      id: 'ALH_001', alert_type: 'SUCCESS_RATE_DROP', severity: 'CRITICAL',
      message: 'Success rate dropped to 78.3% (threshold: 85%)',
      gateway: 'Razorpay', value: 78.3, threshold: 85,
      status: 'RESOLVED', triggered_at: new Date(now - 2 * 3600000).toISOString(),
      resolved_at: new Date(now - 1.5 * 3600000).toISOString(),
    },
    {
      id: 'ALH_002', alert_type: 'LATENCY_SPIKE', severity: 'HIGH',
      message: 'Average UPI latency spiked to 8200ms (threshold: 5000ms)',
      gateway: 'PhonePe', value: 8200, threshold: 5000,
      status: 'ACKNOWLEDGED', triggered_at: new Date(now - 4 * 3600000).toISOString(),
      acknowledged_by: 'admin@juspay.in',
    },
    {
      id: 'ALH_003', alert_type: 'GATEWAY_DOWN', severity: 'CRITICAL',
      message: 'Paytm gateway is unreachable — all traffic rerouted',
      gateway: 'Paytm', value: null, threshold: null,
      status: 'RESOLVED', triggered_at: new Date(now - 24 * 3600000).toISOString(),
      resolved_at: new Date(now - 22 * 3600000).toISOString(),
    },
    {
      id: 'ALH_004', alert_type: 'CHARGEBACK_SPIKE', severity: 'HIGH',
      message: 'Chargeback rate reached 2.1% on card payments (threshold: 1.5%)',
      gateway: null, value: 2.1, threshold: 1.5,
      status: 'TRIGGERED', triggered_at: new Date(now - 6 * 3600000).toISOString(),
    },
    {
      id: 'ALH_005', alert_type: 'VOLUME_ANOMALY', severity: 'MEDIUM',
      message: 'Transaction volume 45% below expected for this hour',
      gateway: null, value: -45, threshold: -30,
      status: 'RESOLVED', triggered_at: new Date(now - 48 * 3600000).toISOString(),
      resolved_at: new Date(now - 47 * 3600000).toISOString(),
    },
    {
      id: 'ALH_006', alert_type: 'HIGH_FAILURE_RATE', severity: 'HIGH',
      message: 'Stripe failure rate at 22% over last 30 minutes',
      gateway: 'Stripe', value: 22, threshold: 15,
      status: 'RESOLVED', triggered_at: new Date(now - 72 * 3600000).toISOString(),
      resolved_at: new Date(now - 71 * 3600000).toISOString(),
    },
    {
      id: 'ALH_007', alert_type: 'REFUND_SPIKE', severity: 'LOW',
      message: 'Refund count is 180% of daily average',
      gateway: null, value: 180, threshold: 200,
      status: 'RESOLVED', triggered_at: new Date(now - 96 * 3600000).toISOString(),
      resolved_at: new Date(now - 95 * 3600000).toISOString(),
    },
    {
      id: 'ALH_008', alert_type: 'FRAUD_DETECTION', severity: 'CRITICAL',
      message: 'Suspicious pattern detected: 15 transactions from same IP in 2 min',
      gateway: 'Razorpay', value: 15, threshold: 10,
      status: 'ACKNOWLEDGED', triggered_at: new Date(now - 120 * 3600000).toISOString(),
      acknowledged_by: 'ops.manager@juspay.in',
    },
  ];
}

module.exports = router;
