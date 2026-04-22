const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

// ─── Surcharge Rules ────────────────────────────────────────────

// GET /api/surcharge - List all surcharge rules
router.get('/', authenticate, requirePermission('gateways'), async (req, res, next) => {
  try {
    // Simulated surcharge rules (in production stored in a surcharge_rules table)
    const result = await query(
      `SELECT sr.*, g.gateway_name
       FROM surcharge_rules sr
       LEFT JOIN gateways g ON sr.gateway_id = g.id
       ORDER BY sr.priority ASC, sr.created_at DESC`
    );
    res.json({ rules: result.rows });
  } catch (error) {
    // If table doesn't exist yet, return simulated data
    const rules = getSimulatedRules();
    res.json({ rules });
  }
});

// GET /api/surcharge/calculate - Preview surcharge for a given amount/method
router.get('/calculate', authenticate, async (req, res, next) => {
  try {
    const { amount, payment_method, gateway } = req.query;
    if (!amount) return res.status(400).json({ error: 'Amount is required' });

    const baseAmount = parseFloat(amount);
    const rules = getSimulatedRules();

    // Find matching rule
    const matchingRule = rules.find(r =>
      r.is_active &&
      (!r.payment_method || r.payment_method === payment_method) &&
      (!r.gateway_name || r.gateway_name === gateway)
    ) || null;

    let surchargeAmount = 0;
    let surchargeDetails = null;

    if (matchingRule) {
      if (matchingRule.surcharge_type === 'PERCENTAGE') {
        surchargeAmount = (baseAmount * matchingRule.surcharge_value) / 100;
      } else {
        surchargeAmount = matchingRule.surcharge_value;
      }

      // Apply cap
      if (matchingRule.max_surcharge && surchargeAmount > matchingRule.max_surcharge) {
        surchargeAmount = matchingRule.max_surcharge;
      }
      // Apply minimum
      if (matchingRule.min_surcharge && surchargeAmount < matchingRule.min_surcharge) {
        surchargeAmount = matchingRule.min_surcharge;
      }

      surchargeDetails = {
        rule_name: matchingRule.rule_name,
        type: matchingRule.surcharge_type,
        value: matchingRule.surcharge_value,
      };
    }

    res.json({
      base_amount: baseAmount,
      surcharge_amount: parseFloat(surchargeAmount.toFixed(2)),
      total_amount: parseFloat((baseAmount + surchargeAmount).toFixed(2)),
      rule_applied: surchargeDetails,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/surcharge - Create surcharge rule
router.post('/', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { rule_name, payment_method, gateway_name, surcharge_type, surcharge_value,
            min_surcharge, max_surcharge, min_txn_amount, max_txn_amount, priority } = req.body;

    if (!rule_name || !surcharge_type || surcharge_value === undefined) {
      return res.status(400).json({ error: 'rule_name, surcharge_type, and surcharge_value are required' });
    }

    if (!['PERCENTAGE', 'FLAT'].includes(surcharge_type)) {
      return res.status(400).json({ error: 'surcharge_type must be PERCENTAGE or FLAT' });
    }

    const ruleId = `SCH_${uuidv4().substring(0, 8).toUpperCase()}`;

    // Audit log the creation
    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'SURCHARGE_RULE_CREATE', 'GATEWAYS', 'surcharge_rule', $2, $3, $4)`,
      [req.user.id, ruleId, JSON.stringify(req.body), req.ip]
    );

    // Return simulated created rule
    const rule = {
      id: Math.floor(Math.random() * 1000) + 100,
      rule_id: ruleId,
      rule_name,
      payment_method: payment_method || null,
      gateway_name: gateway_name || null,
      surcharge_type,
      surcharge_value: parseFloat(surcharge_value),
      min_surcharge: min_surcharge ? parseFloat(min_surcharge) : null,
      max_surcharge: max_surcharge ? parseFloat(max_surcharge) : null,
      min_txn_amount: min_txn_amount ? parseFloat(min_txn_amount) : null,
      max_txn_amount: max_txn_amount ? parseFloat(max_txn_amount) : null,
      priority: priority || 10,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    res.status(201).json({ rule });
  } catch (error) {
    next(error);
  }
});

// PUT /api/surcharge/:id - Update surcharge rule
router.put('/:id', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'SURCHARGE_RULE_UPDATE', 'GATEWAYS', 'surcharge_rule', $2, $3, $4)`,
      [req.user.id, req.params.id, JSON.stringify(req.body), req.ip]
    );

    res.json({ message: 'Surcharge rule updated', rule: { id: req.params.id, ...req.body, updated_at: new Date().toISOString() } });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/surcharge/:id - Delete surcharge rule
router.delete('/:id', authenticate, requirePermission('gateways', 'READ_WRITE'), async (req, res, next) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, ip_address)
       VALUES ($1, 'SURCHARGE_RULE_DELETE', 'GATEWAYS', 'surcharge_rule', $2, $3)`,
      [req.user.id, req.params.id, req.ip]
    );

    res.json({ message: 'Surcharge rule deleted' });
  } catch (error) {
    next(error);
  }
});

// Simulated surcharge rules data
function getSimulatedRules() {
  return [
    {
      id: 1, rule_id: 'SCH_001', rule_name: 'Credit Card Surcharge',
      payment_method: 'CARD', gateway_name: null,
      surcharge_type: 'PERCENTAGE', surcharge_value: 2.0,
      min_surcharge: 5, max_surcharge: 500,
      min_txn_amount: 100, max_txn_amount: null,
      priority: 1, is_active: true,
      created_at: '2025-06-01T10:00:00Z',
    },
    {
      id: 2, rule_id: 'SCH_002', rule_name: 'UPI Convenience Fee',
      payment_method: 'UPI', gateway_name: null,
      surcharge_type: 'FLAT', surcharge_value: 3.0,
      min_surcharge: null, max_surcharge: null,
      min_txn_amount: null, max_txn_amount: null,
      priority: 2, is_active: true,
      created_at: '2025-06-05T12:00:00Z',
    },
    {
      id: 3, rule_id: 'SCH_003', rule_name: 'International Card Premium',
      payment_method: 'CARD', gateway_name: 'Stripe',
      surcharge_type: 'PERCENTAGE', surcharge_value: 3.5,
      min_surcharge: 10, max_surcharge: 1000,
      min_txn_amount: 500, max_txn_amount: null,
      priority: 3, is_active: true,
      created_at: '2025-07-10T09:00:00Z',
    },
    {
      id: 4, rule_id: 'SCH_004', rule_name: 'EMI Processing Fee',
      payment_method: 'EMI', gateway_name: null,
      surcharge_type: 'PERCENTAGE', surcharge_value: 1.5,
      min_surcharge: 20, max_surcharge: 200,
      min_txn_amount: 3000, max_txn_amount: null,
      priority: 4, is_active: false,
      created_at: '2025-08-15T14:00:00Z',
    },
    {
      id: 5, rule_id: 'SCH_005', rule_name: 'Netbanking Flat Fee',
      payment_method: 'NETBANKING', gateway_name: null,
      surcharge_type: 'FLAT', surcharge_value: 10.0,
      min_surcharge: null, max_surcharge: null,
      min_txn_amount: null, max_txn_amount: 50000,
      priority: 5, is_active: true,
      created_at: '2025-09-01T11:00:00Z',
    },
  ];
}

module.exports = router;
