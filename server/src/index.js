require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { pool } = require('./config/database');
const { migrate } = require('./config/migrate');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Login rate limiting (stricter)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// API Routes
app.use('/api/auth', loginLimiter, require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/refunds', require('./routes/refunds'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/chargebacks', require('./routes/chargebacks'));
app.use('/api/mandates', require('./routes/mandates'));
app.use('/api/gateways', require('./routes/gateways'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/batch', require('./routes/batch'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/surcharge', require('./routes/surcharge'));
app.use('/api/routing', require('./routes/routing'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/altid', require('./routes/altid'));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: 'Database connection failed' });
  }
});

// One-time seed endpoint (for free-tier deployments without shell access)
app.get('/api/seed', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    const { query: dbQuery } = require('./config/database');
    const { migration } = require('./config/migrate');

    // Check if already seeded
    const existing = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(existing.rows[0].count) > 0) {
      return res.json({ message: 'Database already seeded', users: parseInt(existing.rows[0].count) });
    }

    // Run migration
    await pool.query(migration);

    // Seed data inline
    const GATEWAYS = ['Razorpay', 'Stripe', 'PayU', 'PhonePe', 'Paytm', 'Cashfree'];
    const PAYMENT_METHODS = ['CARD', 'UPI', 'NETBANKING', 'WALLET', 'EMI', 'BNPL'];
    const STATUSES = ['CHARGED', 'CHARGED', 'CHARGED', 'CHARGED', 'PENDING_VBV', 'AUTHENTICATION_FAILED', 'AUTHORIZATION_FAILED', 'JUSPAY_DECLINED', 'NEW', 'STARTED'];
    const firstNames = ['Rahul','Priya','Amit','Sneha','Vikram','Anita','Suresh','Meera','Rajesh','Kavita'];
    const lastNames = ['Sharma','Patel','Kumar','Singh','Joshi','Verma','Gupta','Reddy','Nair','Iyer'];
    const domains = ['gmail.com','yahoo.com','outlook.com','company.com'];

    function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function randomAmount() { return (Math.random() * 49900 + 100).toFixed(2); }
    function randomDate(daysBack = 90) {
      const d = new Date(); d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
      d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
      return d.toISOString();
    }

    // Create roles
    const roles = [
      { name: 'Admin', desc: 'Full system access', is_system: true },
      { name: 'Operations Manager', desc: 'Operations and order management' },
      { name: 'Finance Analyst', desc: 'Financial data and refund management' },
      { name: 'Support Agent', desc: 'Customer support and order viewing' },
      { name: 'Viewer', desc: 'Read-only access' },
    ];
    const roleIds = {};
    for (const r of roles) {
      const res2 = await dbQuery(
        'INSERT INTO roles (name, description, is_system) VALUES ($1, $2, $3) RETURNING id',
        [r.name, r.desc, r.is_system || false]
      );
      roleIds[r.name] = res2.rows[0].id;
    }

    // Create permissions
    const modules = ['dashboard','orders','transactions','refunds','chargebacks','mandates','gateways','users','settings','batch_operations','monitoring','reports'];
    for (const mod of modules) {
      await dbQuery('INSERT INTO permissions (role_id, module, access_level) VALUES ($1, $2, $3)', [roleIds['Admin'], mod, 'READ_WRITE']);
      await dbQuery('INSERT INTO permissions (role_id, module, access_level) VALUES ($1, $2, $3)', [roleIds['Operations Manager'], mod, mod === 'users' || mod === 'settings' ? 'READ' : 'READ_WRITE']);
      await dbQuery('INSERT INTO permissions (role_id, module, access_level) VALUES ($1, $2, $3)', [roleIds['Finance Analyst'], mod, ['refunds','transactions','reports','dashboard'].includes(mod) ? 'READ_WRITE' : 'READ']);
      await dbQuery('INSERT INTO permissions (role_id, module, access_level) VALUES ($1, $2, $3)', [roleIds['Support Agent'], mod, ['orders','chargebacks'].includes(mod) ? 'READ_WRITE' : 'READ']);
      await dbQuery('INSERT INTO permissions (role_id, module, access_level) VALUES ($1, $2, $3)', [roleIds['Viewer'], mod, 'READ']);
    }

    // Create users
    const pwHash = await bcrypt.hash('Admin@123', 12);
    const userHash = await bcrypt.hash('User@1234', 12);
    const users = [
      { email: 'admin@juspay.in', pw: pwHash, fn: 'Admin', ln: 'User', role: 'Admin' },
      { email: 'ops.manager@juspay.in', pw: userHash, fn: 'Ops', ln: 'Manager', role: 'Operations Manager' },
      { email: 'finance@juspay.in', pw: userHash, fn: 'Finance', ln: 'Analyst', role: 'Finance Analyst' },
      { email: 'support@juspay.in', pw: userHash, fn: 'Support', ln: 'Agent', role: 'Support Agent' },
      { email: 'viewer@juspay.in', pw: userHash, fn: 'Viewer', ln: 'User', role: 'Viewer' },
    ];
    for (const u of users) {
      await dbQuery('INSERT INTO users (email, password_hash, first_name, last_name, role_id, status) VALUES ($1,$2,$3,$4,$5,$6)',
        [u.email, u.pw, u.fn, u.ln, roleIds[u.role], 'ACTIVE']);
    }

    // Create merchant
    const merchRes = await dbQuery(
      "INSERT INTO merchants (merchant_id, name, display_name, category, website, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      ['MID_JUSPAY_001', 'JusPay Technologies', 'JusPay', 'Payment Gateway', 'https://juspay.in', 'ACTIVE']
    );
    const merchantId = merchRes.rows[0].id;

    // Create gateways
    const gwIds = [];
    for (let i = 0; i < GATEWAYS.length; i++) {
      const gw = await dbQuery(
        'INSERT INTO gateways (merchant_id, gateway_name, gateway_type, payment_methods, is_active, priority) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [merchantId, GATEWAYS[i], 'AGGREGATOR', JSON.stringify(PAYMENT_METHODS.slice(0, 3 + Math.floor(Math.random() * 3))), true, i + 1]
      );
      gwIds.push(gw.rows[0].id);
    }

    // Create orders, transactions, refunds, chargebacks, mandates
    const orderCount = 500;
    for (let i = 0; i < orderCount; i++) {
      const fn = randomItem(firstNames), ln = randomItem(lastNames);
      const email = `${fn.toLowerCase()}.${ln.toLowerCase()}@${randomItem(domains)}`;
      const status = randomItem(STATUSES);
      const gw = randomItem(GATEWAYS);
      const pm = randomItem(PAYMENT_METHODS);
      const amount = randomAmount();
      const orderId = `ORD_${Date.now()}_${i}`;
      const created = randomDate();

      const orderRes = await dbQuery(
        `INSERT INTO orders (order_id, merchant_id, amount, currency, status, payment_method, gateway, customer_email, customer_name, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [orderId, merchantId, amount, 'INR', status, pm, gw, email, `${fn} ${ln}`, created]
      );
      const oid = orderRes.rows[0].id;

      // Transaction
      const txnStatus = status === 'CHARGED' ? 'SUCCESS' : status === 'PENDING_VBV' ? 'PENDING' : 'FAILED';
      await dbQuery(
        `INSERT INTO transactions (txn_id, order_id, amount, currency, status, txn_type, gateway, payment_method, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [`TXN_${Date.now()}_${i}`, oid, amount, 'INR', txnStatus, 'PAYMENT', gw, pm, created]
      );

      // Refunds (10% of charged orders)
      if (status === 'CHARGED' && Math.random() < 0.1) {
        const refundAmt = (parseFloat(amount) * (Math.random() < 0.5 ? 1 : Math.random())).toFixed(2);
        await dbQuery(
          `INSERT INTO refunds (refund_id, order_id, amount, currency, status, refund_type, reason, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [`REF_${Date.now()}_${i}`, oid, refundAmt, 'INR', randomItem(['SUCCESS','PENDING','FAILURE']),
           parseFloat(refundAmt) === parseFloat(amount) ? 'FULL' : 'PARTIAL', 'Customer request', created]
        );
      }

      // Chargebacks (5% of charged orders)
      if (status === 'CHARGED' && Math.random() < 0.05) {
        await dbQuery(
          `INSERT INTO chargebacks (chargeback_id, order_id, amount, currency, status, reason, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [`CB_${Date.now()}_${i}`, oid, amount, 'INR',
           randomItem(['RECEIVED','UNDER_REVIEW','RESOLVED_IN_MERCHANT_FAVOUR','RESOLVED_IN_CUSTOMER_FAVOUR']),
           randomItem(['Unauthorized transaction','Product not received','Not as described']), created]
        );
      }
    }

    // Mandates
    for (let i = 0; i < 100; i++) {
      const fn = randomItem(firstNames), ln = randomItem(lastNames);
      await dbQuery(
        `INSERT INTO mandates (mandate_id, merchant_id, customer_id, amount, currency, status, mandate_type, frequency, payment_method, gateway, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [`MND_${Date.now()}_${i}`, merchantId, `CUST_${i}`, randomAmount(), 'INR',
         randomItem(['CREATED','ACTIVE','ACTIVE','ACTIVE','PAUSED','REVOKED']),
         'RECURRING', randomItem(['MONTHLY','WEEKLY','DAILY','QUARTERLY']),
         randomItem(PAYMENT_METHODS), randomItem(GATEWAYS), randomDate()]
      );
    }

    res.json({
      message: 'Database seeded successfully!',
      credentials: {
        admin: 'admin@juspay.in / Admin@123',
        ops: 'ops.manager@juspay.in / User@1234',
        finance: 'finance@juspay.in / User@1234',
        support: 'support@juspay.in / User@1234',
        viewer: 'viewer@juspay.in / User@1234',
      }
    });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ error: 'Seed failed', details: error.message });
  }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Start server
async function start() {
  try {
    // Run migrations on startup
    console.log('Running database migrations...');
    await pool.query('SELECT 1'); // Test connection
    const { migration } = require('./config/migrate');
    await pool.query(migration);
    console.log('Database migrations complete');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();

module.exports = app;
