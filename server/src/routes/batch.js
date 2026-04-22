const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');

const router = express.Router();

const BATCH_TYPES = [
  'BATCH_REFUND', 'BATCH_USERS', 'BATCH_MERCHANTS', 'BATCH_TRANSACTIONS',
  'BATCH_CHARGEBACKS', 'BATCH_MANDATE_CREATE', 'BATCH_MANDATE_RETRY',
  'BATCH_MANDATE_PAUSE', 'BATCH_MANDATE_RESUME', 'BATCH_MANDATE_REVOKE',
  'BATCH_VPA_DELETE', 'BATCH_CARD_DELETE', 'BATCH_CARD_TOKENIZE',
  'BATCH_ORDER_DETAIL', 'BATCH_SYNC',
];

// GET /api/batch - List batch operations
router.get('/', authenticate, requirePermission('batch_operations'), validatePagination, async (req, res, next) => {
  try {
    const { limit, offset, page } = req.pagination;
    const { search, status, batch_type } = req.query;

    let where = ['1=1'];
    let params = [];
    let pc = 0;

    if (search) { pc++; where.push(`(b.batch_id ILIKE $${pc} OR b.file_name ILIKE $${pc})`); params.push(`%${search}%`); }
    if (status) { pc++; where.push(`b.status = $${pc}`); params.push(status); }
    if (batch_type) { pc++; where.push(`b.batch_type = $${pc}`); params.push(batch_type); }

    const whereClause = where.join(' AND ');

    const countResult = await query(`SELECT COUNT(*) FROM batch_operations b WHERE ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT b.*, u1.email as uploaded_by_email, u2.email as approved_by_email
       FROM batch_operations b
       LEFT JOIN users u1 ON b.uploaded_by = u1.id
       LEFT JOIN users u2 ON b.approved_by = u2.id
       WHERE ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT $${pc + 1} OFFSET $${pc + 2}`,
      [...params, limit, offset]
    );

    res.json({
      batches: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/batch/:id - Batch details
router.get('/:id', authenticate, requirePermission('batch_operations'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT b.*, u1.email as uploaded_by_email, u2.email as approved_by_email
       FROM batch_operations b
       LEFT JOIN users u1 ON b.uploaded_by = u1.id
       LEFT JOIN users u2 ON b.approved_by = u2.id
       WHERE b.id = $1 OR b.batch_id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Batch not found' });
    res.json({ batch: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/batch/upload - Upload and process batch CSV
router.post('/upload', authenticate, requirePermission('batch_operations', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { batch_type, file_name, description, data } = req.body;

    if (!batch_type || !BATCH_TYPES.includes(batch_type)) {
      return res.status(400).json({ error: `Invalid batch type. Must be one of: ${BATCH_TYPES.join(', ')}` });
    }
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Data array is required and must not be empty' });
    }
    if (data.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 rows per batch upload' });
    }

    // Validate CSV data based on batch type
    const validationErrors = validateBatchData(batch_type, data);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }

    const batchId = `BATCH_${Date.now().toString(36).toUpperCase()}_${uuidv4().substring(0, 6).toUpperCase()}`;

    // Process each row (simulated)
    const results = [];
    let accepted = 0, rejected = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const success = Math.random() > 0.1; // 90% success rate simulation

      if (success) {
        accepted++;
        results.push({ ...row, status: 'ACCEPTED', message: 'Processed successfully', row_number: i + 1 });
      } else {
        rejected++;
        results.push({ ...row, status: 'REJECTED', message: 'Processing failed - simulated error', row_number: i + 1 });
      }
    }

    const result = await query(
      `INSERT INTO batch_operations (batch_id, batch_type, file_name, status, total_tasks, accepted_tasks, rejected_tasks, queued_tasks, description, uploaded_by, file_data, results)
       VALUES ($1, $2, $3, 'COMPLETED', $4, $5, $6, 0, $7, $8, $9, $10)
       RETURNING *`,
      [
        batchId, batch_type, file_name || `${batch_type.toLowerCase()}_${Date.now()}.csv`,
        data.length, accepted, rejected,
        description || '', req.user.id,
        JSON.stringify(data), JSON.stringify(results),
      ]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, 'BATCH_UPLOAD', 'BATCH_OPERATIONS', 'batch', $2, $3, $4)`,
      [req.user.id, batchId, JSON.stringify({ batch_type, total: data.length, accepted, rejected }), req.ip]
    );

    res.status(201).json({
      batch: result.rows[0],
      summary: { total: data.length, accepted, rejected },
      message: `Batch processed: ${accepted} accepted, ${rejected} rejected`,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/batch/:id/download - Download batch results as JSON (CSV conversion on frontend)
router.get('/:id/download', authenticate, requirePermission('batch_operations'), async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM batch_operations WHERE id = $1 OR batch_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Batch not found' });

    res.json({
      batch_id: result.rows[0].batch_id,
      batch_type: result.rows[0].batch_type,
      results: result.rows[0].results,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/batch/types/list - Available batch types
router.get('/types/list', authenticate, async (req, res) => {
  const types = BATCH_TYPES.map(t => ({
    value: t,
    label: t.replace('BATCH_', '').replace(/_/g, ' '),
    category: t.includes('MANDATE') ? 'Mandates' : t.includes('CARD') || t.includes('VPA') ? 'Payment Methods' : 'General',
  }));
  res.json({ types });
});

function validateBatchData(batchType, data) {
  const errors = [];
  const requiredFields = {
    BATCH_REFUND: ['order_id', 'amount', 'reason'],
    BATCH_USERS: ['email', 'first_name', 'role'],
    BATCH_MERCHANTS: ['merchant_id', 'name'],
    BATCH_TRANSACTIONS: ['order_id'],
    BATCH_CHARGEBACKS: ['order_id', 'amount', 'reason'],
    BATCH_MANDATE_CREATE: ['customer_id', 'amount', 'frequency'],
    BATCH_MANDATE_RETRY: ['order_id', 'mandate_id'],
    BATCH_MANDATE_PAUSE: ['mandate_id'],
    BATCH_MANDATE_RESUME: ['mandate_id'],
    BATCH_MANDATE_REVOKE: ['mandate_id'],
    BATCH_VPA_DELETE: ['vpa_id'],
    BATCH_CARD_DELETE: ['card_reference'],
    BATCH_CARD_TOKENIZE: ['card_number', 'expiry'],
    BATCH_ORDER_DETAIL: ['order_id'],
    BATCH_SYNC: ['order_id'],
  };

  const required = requiredFields[batchType] || [];

  data.forEach((row, i) => {
    required.forEach(field => {
      if (!row[field] || String(row[field]).trim() === '') {
        errors.push({ row: i + 1, field, message: `${field} is required` });
      }
    });
  });

  return errors.slice(0, 20); // Return first 20 errors max
}

module.exports = router;
