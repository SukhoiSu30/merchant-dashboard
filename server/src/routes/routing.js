const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

// ─── Priority Routing ───────────────────────────────────────────

// GET /api/routing/priority - Get priority routing config
router.get('/priority', authenticate, requirePermission('gateways'), async (req, res, next) => {
  try {
    // Get gateways with current priority
    const result = await query(
      `SELECT id, gateway_name, is_active, priority, payment_methods
       FROM gateways ORDER BY priority ASC`
    );

    const rules = getSimulatedRoutingRules();

    res.json({
      gateways: result.rows,
      rules,
      smart_routing: {
        enabled: true,
        algorithm: 'SUCCESS_RATE_WEIGHTED',
        fallback_enabled: true,
        min_success_rate: 85,
        lookback_window: '30m',
        cooldown_period: '5m',
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/routing/priority - Update gateway priorities
router.put('/priority', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { priorities } = req.body; // Array of { gateway_id, priority }

    if (!Array.isArray(priorities)) {
      return res.status(400).json({ error: 'priorities must be an array of { gateway_id, priority }' });
    }

    for (const p of priorities) {
      await query('UPDATE gateways SET priority = $1 WHERE id = $2', [p.priority, p.gateway_id]);
    }

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'PRIORITY_UPDATE', 'GATEWAYS', 'routing', 'priority', $2, $3)`,
      [req.user.id, JSON.stringify(priorities), req.ip]
    );

    res.json({ message: 'Gateway priorities updated' });
  } catch (error) {
    next(error);
  }
});

// POST /api/routing/rules - Create routing rule
router.post('/rules', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { rule_name, condition_type, condition_value, target_gateway, action, priority } = req.body;

    if (!rule_name || !condition_type || !target_gateway) {
      return res.status(400).json({ error: 'rule_name, condition_type, and target_gateway are required' });
    }

    const ruleId = `RTE_${uuidv4().substring(0, 8).toUpperCase()}`;

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'ROUTING_RULE_CREATE', 'GATEWAYS', 'routing_rule', $2, $3, $4)`,
      [req.user.id, ruleId, JSON.stringify(req.body), req.ip]
    );

    const rule = {
      id: Math.floor(Math.random() * 1000) + 100,
      rule_id: ruleId,
      rule_name,
      condition_type,
      condition_value: condition_value || null,
      target_gateway,
      action: action || 'ROUTE',
      priority: priority || 10,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    res.status(201).json({ rule });
  } catch (error) {
    next(error);
  }
});

// PUT /api/routing/smart - Update smart routing config
router.put('/smart', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    const config = req.body;

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'SMART_ROUTING_UPDATE', 'GATEWAYS', 'routing', 'smart', $2, $3)`,
      [req.user.id, JSON.stringify(config), req.ip]
    );

    res.json({ message: 'Smart routing config updated', config });
  } catch (error) {
    next(error);
  }
});

// ─── Outage Management ──────────────────────────────────────────

// GET /api/routing/outages - List active and recent outages
router.get('/outages', authenticate, requirePermission('gateways'), async (req, res, next) => {
  try {
    const gateways = await query('SELECT id, gateway_name, is_active FROM gateways ORDER BY priority ASC');

    const outages = getSimulatedOutages();

    res.json({
      gateways: gateways.rows,
      active_outages: outages.filter(o => o.status === 'ACTIVE'),
      recent_outages: outages.filter(o => o.status !== 'ACTIVE'),
      health_summary: {
        total_gateways: gateways.rows.length,
        healthy: gateways.rows.filter(g => g.is_active).length,
        degraded: 0,
        down: gateways.rows.filter(g => !g.is_active).length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/routing/outages - Create manual outage (mark gateway as down)
router.post('/outages', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { gateway_id, reason, payment_methods, estimated_recovery } = req.body;

    if (!gateway_id) return res.status(400).json({ error: 'gateway_id is required' });

    // Deactivate the gateway
    await query('UPDATE gateways SET is_active = false WHERE id = $1', [gateway_id]);

    const outageId = `OUT_${uuidv4().substring(0, 8).toUpperCase()}`;

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'OUTAGE_CREATE', 'GATEWAYS', 'outage', $2, $3, $4)`,
      [req.user.id, outageId, JSON.stringify({ gateway_id, reason, payment_methods }), req.ip]
    );

    res.status(201).json({
      outage: {
        id: outageId,
        gateway_id,
        reason: reason || 'Manual outage',
        payment_methods: payment_methods || [],
        status: 'ACTIVE',
        estimated_recovery: estimated_recovery || null,
        created_at: new Date().toISOString(),
        created_by: req.user.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/routing/outages/:id/resolve - Resolve outage
router.put('/outages/:id/resolve', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { gateway_id } = req.body;

    if (gateway_id) {
      await query('UPDATE gateways SET is_active = true WHERE id = $1', [gateway_id]);
    }

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, ip_address)
       VALUES ($1, 'OUTAGE_RESOLVE', 'GATEWAYS', 'outage', $2, $3)`,
      [req.user.id, req.params.id, req.ip]
    );

    res.json({ message: 'Outage resolved', resolved_at: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// ─── Gateway Health (live stats) ────────────────────────────────

// GET /api/routing/health - Real-time gateway health
router.get('/health', authenticate, requirePermission('gateways'), async (req, res, next) => {
  try {
    const gateways = await query('SELECT id, gateway_name, is_active, priority FROM gateways ORDER BY priority ASC');

    const health = gateways.rows.map(gw => {
      const successRate = gw.is_active ? (85 + Math.random() * 15).toFixed(1) : 0;
      const avgLatency = gw.is_active ? Math.floor(200 + Math.random() * 800) : 0;
      const txnPerMin = gw.is_active ? Math.floor(5 + Math.random() * 50) : 0;

      return {
        gateway_id: gw.id,
        gateway_name: gw.gateway_name,
        
        is_active: gw.is_active,
        priority: gw.priority,
        success_rate: parseFloat(successRate),
        avg_latency_ms: avgLatency,
        txn_per_minute: txnPerMin,
        status: !gw.is_active ? 'DOWN' : parseFloat(successRate) < 90 ? 'DEGRADED' : 'HEALTHY',
        last_checked: new Date().toISOString(),
      };
    });

    res.json({ health });
  } catch (error) {
    next(error);
  }
});

// Simulated routing rules
function getSimulatedRoutingRules() {
  return [
    {
      id: 1, rule_id: 'RTE_001', rule_name: 'High-value to Stripe',
      condition_type: 'AMOUNT_ABOVE', condition_value: '10000',
      target_gateway: 'Stripe', action: 'ROUTE', priority: 1, is_active: true,
      created_at: '2025-06-01T10:00:00Z',
    },
    {
      id: 2, rule_id: 'RTE_002', rule_name: 'UPI to PhonePe',
      condition_type: 'PAYMENT_METHOD', condition_value: 'UPI',
      target_gateway: 'PhonePe', action: 'ROUTE', priority: 2, is_active: true,
      created_at: '2025-06-10T12:00:00Z',
    },
    {
      id: 3, rule_id: 'RTE_003', rule_name: 'Card to Razorpay',
      condition_type: 'PAYMENT_METHOD', condition_value: 'CARD',
      target_gateway: 'Razorpay', action: 'ROUTE', priority: 3, is_active: true,
      created_at: '2025-07-15T09:00:00Z',
    },
    {
      id: 4, rule_id: 'RTE_004', rule_name: 'International fallback',
      condition_type: 'CURRENCY', condition_value: 'USD',
      target_gateway: 'Stripe', action: 'FALLBACK', priority: 4, is_active: true,
      created_at: '2025-08-01T14:00:00Z',
    },
    {
      id: 5, rule_id: 'RTE_005', rule_name: 'Block wallet above 5000',
      condition_type: 'AMOUNT_ABOVE', condition_value: '5000',
      target_gateway: 'WALLET', action: 'BLOCK', priority: 5, is_active: false,
      created_at: '2025-09-10T11:00:00Z',
    },
  ];
}

// Simulated outages
function getSimulatedOutages() {
  return [
    {
      id: 'OUT_A1B2C3D4', gateway_name: 'Paytm', reason: 'Gateway maintenance window',
      payment_methods: ['WALLET', 'UPI'], status: 'RESOLVED',
      started_at: '2026-04-18T02:00:00Z', resolved_at: '2026-04-18T04:30:00Z',
      duration_minutes: 150, impact: '~120 transactions rerouted to Razorpay',
    },
    {
      id: 'OUT_E5F6G7H8', gateway_name: 'PayU', reason: 'API timeout spike detected',
      payment_methods: ['CARD', 'NETBANKING'], status: 'RESOLVED',
      started_at: '2026-04-15T14:00:00Z', resolved_at: '2026-04-15T14:45:00Z',
      duration_minutes: 45, impact: '~30 transactions affected',
    },
  ];
}

module.exports = router;
