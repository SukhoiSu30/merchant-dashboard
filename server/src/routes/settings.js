const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

// ─── General Settings ───────────────────────────────────────────

// GET /api/settings/general - Get general settings
router.get('/general', authenticate, requirePermission('settings'), async (req, res, next) => {
  try {
    // Return simulated general settings (in production these would come from a settings table)
    const settings = {
      merchant_name: 'JusPay Merchant Portal',
      merchant_id: 'MERCH_001',
      business_type: 'E-Commerce',
      country: 'IN',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      date_format: 'DD/MM/YYYY',
      settlement_cycle: 'T+1',
      auto_refund: false,
      auto_capture: true,
      payment_page_branding: true,
      callback_url: 'https://merchant.example.com/callback',
      return_url: 'https://merchant.example.com/return',
      webhook_url: 'https://merchant.example.com/webhooks',
    };
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/general - Update general settings
router.put('/general', authenticate, requirePermission('settings', 'READ_WRITE'), async (req, res, next) => {
  try {
    const updates = req.body;

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'SETTINGS_UPDATE', 'SETTINGS', 'settings', 'general', $2, $3)`,
      [req.user.id, JSON.stringify(updates), req.ip]
    );

    res.json({ message: 'Settings updated successfully', settings: updates });
  } catch (error) {
    next(error);
  }
});

// ─── Security Settings ──────────────────────────────────────────

// GET /api/settings/security - Get security settings
router.get('/security', authenticate, requirePermission('settings'), async (req, res, next) => {
  try {
    const settings = {
      password_policy: {
        min_length: 8,
        require_uppercase: true,
        require_lowercase: true,
        require_number: true,
        require_special: true,
        expiry_days: 90,
      },
      session: {
        max_sessions: 3,
        session_timeout: 30, // minutes
        idle_timeout: 15,    // minutes
      },
      login: {
        max_failed_attempts: 5,
        lockout_duration: 30, // minutes
        require_2fa: false,
        ip_whitelist_enabled: false,
        ip_whitelist: [],
      },
      encryption: {
        api_key_format: 'RSA',
        webhook_signing: 'HMAC-SHA256',
      },
    };
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/security - Update security settings
router.put('/security', authenticate, requirePermission('settings', 'READ_WRITE'), async (req, res, next) => {
  try {
    const updates = req.body;

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'SECURITY_SETTINGS_UPDATE', 'SETTINGS', 'settings', 'security', $2, $3)`,
      [req.user.id, JSON.stringify(updates), req.ip]
    );

    res.json({ message: 'Security settings updated successfully', settings: updates });
  } catch (error) {
    next(error);
  }
});

// ─── Webhooks ───────────────────────────────────────────────────

// GET /api/settings/webhooks - List webhooks
router.get('/webhooks', authenticate, requirePermission('settings'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM webhook_configs WHERE merchant_id = $1 ORDER BY created_at DESC`,
      ['MERCH_001']
    );
    res.json({ webhooks: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/settings/webhooks - Create webhook
router.post('/webhooks', authenticate, requirePermission('settings', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { url, events, description } = req.body;

    if (!url) return res.status(400).json({ error: 'Webhook URL is required' });
    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'At least one event must be selected' });
    }

    const webhookId = `WHK_${uuidv4().substring(0, 12).toUpperCase()}`;
    const secret = `whsec_${uuidv4().replace(/-/g, '')}`;

    const result = await query(
      `INSERT INTO webhook_configs (webhook_id, merchant_id, url, events, secret, description, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [webhookId, 'MERCH_001', url, JSON.stringify(events), secret, description || '']
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'WEBHOOK_CREATE', 'SETTINGS', 'webhook', $2, $3, $4)`,
      [req.user.id, webhookId, JSON.stringify({ url, events }), req.ip]
    );

    res.status(201).json({ webhook: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/webhooks/:id - Update webhook
router.put('/webhooks/:id', authenticate, requirePermission('settings', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { url, events, description, is_active } = req.body;

    const existing = await query('SELECT * FROM webhook_configs WHERE id = $1 OR webhook_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });

    const webhook = existing.rows[0];
    const result = await query(
      `UPDATE webhook_configs SET url = $1, events = $2, description = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [
        url || webhook.url,
        events ? JSON.stringify(events) : webhook.events,
        description !== undefined ? description : webhook.description,
        is_active !== undefined ? is_active : webhook.is_active,
        webhook.id,
      ]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'WEBHOOK_UPDATE', 'SETTINGS', 'webhook', $2, $3, $4)`,
      [req.user.id, webhook.webhook_id, JSON.stringify(req.body), req.ip]
    );

    res.json({ webhook: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/settings/webhooks/:id - Delete webhook
router.delete('/webhooks/:id', authenticate, requirePermission('settings', 'READ_WRITE'), async (req, res, next) => {
  try {
    const existing = await query('SELECT * FROM webhook_configs WHERE id = $1 OR webhook_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });

    await query('DELETE FROM webhook_configs WHERE id = $1', [existing.rows[0].id]);

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, ip_address)
       VALUES ($1, 'WEBHOOK_DELETE', 'SETTINGS', 'webhook', $2, $3)`,
      [req.user.id, existing.rows[0].webhook_id, req.ip]
    );

    res.json({ message: 'Webhook deleted' });
  } catch (error) {
    next(error);
  }
});

// POST /api/settings/webhooks/:id/test - Test webhook
router.post('/webhooks/:id/test', authenticate, requirePermission('settings'), async (req, res, next) => {
  try {
    const existing = await query('SELECT * FROM webhook_configs WHERE id = $1 OR webhook_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });

    // Simulated test
    const testResult = {
      status: Math.random() > 0.2 ? 'success' : 'failed',
      response_code: Math.random() > 0.2 ? 200 : 500,
      response_time: Math.floor(Math.random() * 500) + 50,
      timestamp: new Date().toISOString(),
    };

    res.json({ test: testResult });
  } catch (error) {
    next(error);
  }
});

// ─── API Keys (simulated) ───────────────────────────────────────

// GET /api/settings/api-keys - List API keys
router.get('/api-keys', authenticate, requirePermission('settings'), async (req, res, next) => {
  try {
    const keys = [
      {
        id: 1, key_name: 'Production API Key', key_prefix: 'sk_live_****abcd',
        environment: 'production', created_at: '2025-01-15T10:00:00Z',
        last_used: '2026-04-21T14:30:00Z', is_active: true,
      },
      {
        id: 2, key_name: 'Test API Key', key_prefix: 'sk_test_****efgh',
        environment: 'test', created_at: '2025-03-01T08:00:00Z',
        last_used: '2026-04-20T09:15:00Z', is_active: true,
      },
      {
        id: 3, key_name: 'Staging Key', key_prefix: 'sk_stag_****ijkl',
        environment: 'staging', created_at: '2025-06-10T12:00:00Z',
        last_used: '2026-04-18T16:45:00Z', is_active: false,
      },
    ];
    res.json({ keys });
  } catch (error) {
    next(error);
  }
});

// ─── Audit Log ──────────────────────────────────────────────────

// GET /api/settings/audit-log - Recent audit entries
router.get('/audit-log', authenticate, requirePermission('settings'), async (req, res, next) => {
  try {
    const { limit = 50, module } = req.query;

    let sql = `SELECT al.*, u.email as user_email FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id`;
    const params = [];

    if (module) {
      params.push(module);
      sql += ` WHERE al.module = $1`;
    }

    sql += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1}`;
    params.push(Math.min(parseInt(limit), 100));

    const result = await query(sql, params);
    res.json({ logs: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
