const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

// GET /api/altid/template - Download sample CSV template
router.get('/template', authenticate, (req, res) => {
  const template = 'cardNumber,cardExpiryMonth,cardExpiryYear,associateId,udf1,udf2\n4111111111111111,12,2027,ASSOC001,custom1,custom2\n5500000000000004,06,2028,ASSOC002,custom3,custom4';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=batch_altid_provision_sample.csv');
  res.send(template);
});

// POST /api/altid/generate - Process batch ALT ID generation
router.post('/generate', authenticate, requirePermission('batch_operations', 'READ_WRITE'), async (req, res, next) => {
  try {
    const { data, file_name, description } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Data required' });
    }

    if (data.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 rows per upload' });
    }

    // Validate each row
    const validationErrors = [];
    data.forEach((row, i) => {
      const cn = String(row.cardNumber || row.cardnumber || '').replace(/\s/g, '');
      if (!cn) {
        validationErrors.push({ row: i + 1, field: 'cardNumber', message: 'Card number is required' });
      } else if (cn.length < 15 || cn.length > 16 || !/^\d+$/.test(cn)) {
        validationErrors.push({ row: i + 1, field: 'cardNumber', message: 'Card number must be 15-16 digits' });
      }

      const month = row.cardExpiryMonth || row.cardexpirymonth;
      if (!month) {
        validationErrors.push({ row: i + 1, field: 'cardExpiryMonth', message: 'Expiry month required' });
      } else if (parseInt(month) < 1 || parseInt(month) > 12) {
        validationErrors.push({ row: i + 1, field: 'cardExpiryMonth', message: 'Month must be 01-12' });
      }

      const year = row.cardExpiryYear || row.cardexpiryyear;
      if (!year) {
        validationErrors.push({ row: i + 1, field: 'cardExpiryYear', message: 'Expiry year required' });
      } else if (parseInt(year) < new Date().getFullYear()) {
        validationErrors.push({ row: i + 1, field: 'cardExpiryYear', message: 'Year must be in the future' });
      }
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors.slice(0, 20)
      });
    }

    const batchId = `ALTID_${Date.now().toString(36).toUpperCase()}_${uuidv4().substring(0, 6).toUpperCase()}`;
    const results = [];
    let accepted = 0, failed = 0, queued = 0;

    // Process each row and simulate ALT ID generation
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const cardNum = String(row.cardNumber || row.cardnumber).replace(/\s/g, '');
      const masked = cardNum.slice(0, 4) + '****' + cardNum.slice(-4);

      // Simulate ALT ID generation (90% success, 7% failure, 3% queued)
      const rand = Math.random();
      if (rand > 0.1) {
        accepted++;
        results.push({
          row_number: i + 1,
          cardNumber: masked,
          cardExpiryMonth: row.cardExpiryMonth || row.cardexpirymonth,
          cardExpiryYear: row.cardExpiryYear || row.cardexpiryyear,
          altId: `ALT_${uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase()}`,
          status: 'ACCEPTED',
          message: 'ALT ID generated successfully',
          associateId: row.associateId || row.associateid || '',
        });
      } else if (rand > 0.03) {
        failed++;
        results.push({
          row_number: i + 1,
          cardNumber: masked,
          cardExpiryMonth: row.cardExpiryMonth || row.cardexpirymonth,
          cardExpiryYear: row.cardExpiryYear || row.cardexpiryyear,
          altId: null,
          status: 'FAILED',
          message: ['Card not eligible for tokenization', 'Network timeout', 'Issuer declined'][Math.floor(Math.random() * 3)],
          associateId: row.associateId || row.associateid || '',
        });
      } else {
        queued++;
        results.push({
          row_number: i + 1,
          cardNumber: masked,
          cardExpiryMonth: row.cardExpiryMonth || row.cardexpirymonth,
          cardExpiryYear: row.cardExpiryYear || row.cardexpiryyear,
          altId: null,
          status: 'QUEUED',
          message: 'In processing queue',
          associateId: row.associateId || row.associateid || '',
        });
      }
    }

    // Store in batch_operations table
    await query(
      `INSERT INTO batch_operations (batch_id, batch_type, file_name, status, total_tasks, accepted_tasks, rejected_tasks, queued_tasks, description, uploaded_by, file_data, results)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        batchId,
        'BATCH_ALT_ID',
        file_name || 'altid_batch.csv',
        'COMPLETED',
        data.length,
        accepted,
        failed,
        queued,
        description || 'ALT ID generation',
        req.user.id,
        JSON.stringify(data),
        JSON.stringify(results)
      ]
    );

    // Audit log
    await query(
      'INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        req.user.id,
        'BATCH_ALT_ID_GENERATE',
        'BATCH_OPERATIONS',
        'batch',
        batchId,
        JSON.stringify({ total: data.length, accepted, failed, queued }),
        req.ip
      ]
    );

    res.status(201).json({
      batch_id: batchId,
      results,
      summary: { total: data.length, accepted, failed, queued }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/altid/history - List past ALT ID batches
router.get('/history', authenticate, requirePermission('batch_operations'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT b.*, u.email as uploaded_by_email
       FROM batch_operations b
       LEFT JOIN users u ON b.uploaded_by = u.id
       WHERE b.batch_type = 'BATCH_ALT_ID'
       ORDER BY b.created_at DESC
       LIMIT 50`
    );
    res.json({ batches: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
