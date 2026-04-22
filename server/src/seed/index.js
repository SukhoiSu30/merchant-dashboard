require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, query } = require('../config/database');
const { migration } = require('../config/migrate');

const GATEWAYS = ['Razorpay', 'Stripe', 'PayU', 'PhonePe', 'Paytm', 'Cashfree'];
const PAYMENT_METHODS = ['CARD', 'UPI', 'NETBANKING', 'WALLET', 'EMI', 'BNPL'];
const PAYMENT_METHOD_TYPES = ['CREDIT_CARD', 'DEBIT_CARD', 'UPI_COLLECT', 'UPI_INTENT', 'NETBANKING', 'WALLET', 'EMI', 'BNPL'];
const CARD_BRANDS = ['VISA', 'MASTERCARD', 'RUPAY', 'AMEX', 'DINERS'];
const STATUSES = ['CHARGED', 'CHARGED', 'CHARGED', 'CHARGED', 'PENDING_VBV', 'AUTHENTICATION_FAILED', 'AUTHORIZATION_FAILED', 'JUSPAY_DECLINED', 'NEW', 'STARTED', 'AUTO_REFUNDED'];
const CURRENCIES = ['INR', 'INR', 'INR', 'INR', 'USD', 'EUR'];

const firstNames = ['Rahul','Priya','Amit','Sneha','Vikram','Anita','Suresh','Meera','Rajesh','Kavita','Arjun','Deepika','Nikhil','Pooja','Sanjay','Ritu','Arun','Neha','Manish','Swati'];
const lastNames = ['Sharma','Patel','Kumar','Singh','Joshi','Verma','Gupta','Reddy','Nair','Iyer','Desai','Mehta','Rao','Agarwal','Chauhan'];
const domains = ['gmail.com','yahoo.com','outlook.com','company.com','business.in'];

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomAmount() { return (Math.random() * 49900 + 100).toFixed(2); }
function randomPhone() { return `+91${Math.floor(9000000000 + Math.random() * 999999999)}`; }
function randomDate(daysBack = 90) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
  return d.toISOString();
}

async function seed() {
  console.log('Starting seed...');

  // Run migration first
  await pool.query(migration);
  console.log('Migration done');

  // Clear existing data
  await query('DELETE FROM audit_logs');
  await query('DELETE FROM chargebacks');
  await query('DELETE FROM refunds');
  await query('DELETE FROM transactions');
  await query('DELETE FROM orders');
  await query('DELETE FROM mandates');
  await query('DELETE FROM batch_operations');
  await query('DELETE FROM monitoring_alerts');
  await query('DELETE FROM webhook_configs');
  await query('DELETE FROM gateways');
  await query('DELETE FROM users');
  await query('DELETE FROM permissions');
  await query('DELETE FROM roles');
  await query('DELETE FROM merchants');
  console.log('Cleared existing data');

  // Create roles
  const roles = [
    { name: 'Admin', desc: 'Full system access', is_system: true },
    { name: 'Operations Manager', desc: 'Operations and order management', is_system: false },
    { name: 'Finance Analyst', desc: 'Financial data and refund management', is_system: false },
    { name: 'Support Agent', desc: 'Customer support and order viewing', is_system: false },
    { name: 'Viewer', desc: 'Read-only access to all modules', is_system: false },
  ];

  const roleIds = {};
  for (const r of roles) {
    const result = await query(
      'INSERT INTO roles (name, description, is_system) VALUES ($1, $2, $3) RETURNING id',
      [r.name, r.desc, r.is_system]
    );
    roleIds[r.name] = result.rows[0].id;
  }
  console.log('Roles created');

  // Create permissions
  const modules = ['dashboard','orders','refunds','chargebacks','users','gateways','settings','mandates','monitoring','batch_operations','webhooks'];

  const rolePerms = {
    'Admin': modules.map(m => ({ module: m, level: 'READ_WRITE' })),
    'Operations Manager': [
      { module: 'dashboard', level: 'READ' },
      { module: 'orders', level: 'READ_WRITE' },
      { module: 'refunds', level: 'READ_WRITE' },
      { module: 'chargebacks', level: 'READ_WRITE' },
      { module: 'gateways', level: 'READ' },
      { module: 'mandates', level: 'READ_WRITE' },
      { module: 'batch_operations', level: 'READ_WRITE' },
      { module: 'monitoring', level: 'READ' },
    ],
    'Finance Analyst': [
      { module: 'dashboard', level: 'READ' },
      { module: 'orders', level: 'READ' },
      { module: 'refunds', level: 'READ_WRITE' },
      { module: 'chargebacks', level: 'READ' },
      { module: 'monitoring', level: 'READ_WRITE' },
    ],
    'Support Agent': [
      { module: 'dashboard', level: 'READ' },
      { module: 'orders', level: 'READ' },
      { module: 'refunds', level: 'READ' },
      { module: 'chargebacks', level: 'READ' },
    ],
    'Viewer': modules.map(m => ({ module: m, level: 'READ' })),
  };

  for (const [roleName, perms] of Object.entries(rolePerms)) {
    for (const p of perms) {
      await query(
        'INSERT INTO permissions (role_id, module, access_level) VALUES ($1, $2, $3)',
        [roleIds[roleName], p.module, p.level]
      );
    }
  }
  console.log('Permissions created');

  // Create merchants
  const merchantData = [
    { mid: 'MERCH_FLIPKART', name: 'Flipkart India', cat: 'E-Commerce' },
    { mid: 'MERCH_SWIGGY', name: 'Swiggy Foods', cat: 'Food Delivery' },
    { mid: 'MERCH_MAKEMYTRIP', name: 'MakeMyTrip', cat: 'Travel' },
    { mid: 'MERCH_BIGBASKET', name: 'BigBasket', cat: 'Groceries' },
    { mid: 'MERCH_BOOKMYSHOW', name: 'BookMyShow', cat: 'Entertainment' },
  ];

  const merchantIds = [];
  for (const m of merchantData) {
    const result = await query(
      `INSERT INTO merchants (merchant_id, name, display_name, category, website, status, api_key)
       VALUES ($1, $2, $2, $3, $4, 'ACTIVE', $5) RETURNING id`,
      [m.mid, m.name, m.cat, `https://www.${m.name.toLowerCase().replace(/\s/g, '')}.com`, `key_${uuidv4().substring(0, 16)}`]
    );
    merchantIds.push(result.rows[0].id);
  }
  console.log('Merchants created');

  // Create gateways for first merchant
  for (const gw of GATEWAYS) {
    await query(
      `INSERT INTO gateways (merchant_id, gateway_name, gateway_type, credentials, payment_methods, is_active, priority)
       VALUES ($1, $2, $3, $4, $5, true, $6)`,
      [
        merchantIds[0], gw, 'PAYMENT_GATEWAY',
        JSON.stringify({ merchant_key: `mk_${gw.toLowerCase()}_test`, secret: 'sk_test_xxx' }),
        JSON.stringify(['CARD', 'UPI', 'NETBANKING', 'WALLET']),
        GATEWAYS.indexOf(gw),
      ]
    );
  }
  console.log('Gateways created');

  // Create users
  const adminHash = await bcrypt.hash('Admin@123', 12);
  const userHash = await bcrypt.hash('User@1234', 12);

  // Admin user
  await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role_id, merchant_id, status)
     VALUES ($1, $2, 'Admin', 'User', $3, $4, 'ACTIVE')`,
    ['admin@juspay.in', adminHash, roleIds['Admin'], merchantIds[0]]
  );

  // Other users
  const userList = [
    { email: 'ops.manager@juspay.in', fn: 'Vikram', ln: 'Singh', role: 'Operations Manager' },
    { email: 'finance@juspay.in', fn: 'Priya', ln: 'Sharma', role: 'Finance Analyst' },
    { email: 'support@juspay.in', fn: 'Amit', ln: 'Kumar', role: 'Support Agent' },
    { email: 'viewer@juspay.in', fn: 'Sneha', ln: 'Patel', role: 'Viewer' },
  ];
  for (const u of userList) {
    await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role_id, merchant_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
      [u.email, userHash, u.fn, u.ln, roleIds[u.role], merchantIds[0]]
    );
  }
  console.log('Users created');

  // Create orders (2000 orders across 90 days)
  console.log('Creating orders...');
  const orderCount = 2000;
  const orderIds = [];

  for (let i = 0; i < orderCount; i++) {
    const merchIdx = Math.floor(Math.random() * merchantIds.length);
    const fn = randomItem(firstNames);
    const ln = randomItem(lastNames);
    const status = randomItem(STATUSES);
    const pm = randomItem(PAYMENT_METHODS);
    const gw = randomItem(GATEWAYS);
    const amount = randomAmount();
    const created = randomDate(90);
    const orderId = `ORD_${Date.now().toString(36).toUpperCase()}_${i.toString().padStart(4, '0')}`;

    const result = await query(
      `INSERT INTO orders (order_id, merchant_id, amount, currency, status, payment_method, payment_method_type, gateway,
        customer_id, customer_email, customer_phone, customer_name, card_brand, card_last_four,
        gateway_reference_id, risk_score, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
       RETURNING id`,
      [
        orderId, merchantIds[merchIdx], amount, randomItem(CURRENCIES), status,
        pm, randomItem(PAYMENT_METHOD_TYPES), gw,
        `CUST_${(i + 1000).toString()}`, `${fn.toLowerCase()}.${ln.toLowerCase()}@${randomItem(domains)}`,
        randomPhone(), `${fn} ${ln}`,
        pm === 'CARD' ? randomItem(CARD_BRANDS) : null,
        pm === 'CARD' ? Math.floor(1000 + Math.random() * 9000).toString() : null,
        `gw_ref_${uuidv4().substring(0, 10)}`,
        (Math.random() * 100).toFixed(2),
        created,
      ]
    );
    orderIds.push({ id: result.rows[0].id, status, amount, gw, pm, created });

    if (i % 500 === 0) console.log(`  Orders: ${i}/${orderCount}`);
  }
  console.log(`Created ${orderCount} orders`);

  // Create transactions for orders
  console.log('Creating transactions...');
  for (const o of orderIds) {
    const txnStatus = o.status === 'CHARGED' ? 'SUCCESS' : (o.status === 'PENDING_VBV' ? 'PENDING' : 'FAILED');
    await query(
      `INSERT INTO transactions (txn_id, order_id, amount, status, txn_type, gateway, payment_method, gateway_txn_id, created_at)
       VALUES ($1, $2, $3, $4, 'PAYMENT', $5, $6, $7, $8)`,
      [
        `TXN_${uuidv4().substring(0, 12).toUpperCase()}`, o.id, o.amount, txnStatus,
        o.gw, o.pm, `gtxn_${uuidv4().substring(0, 10)}`, o.created,
      ]
    );
  }
  console.log('Transactions created');

  // Create refunds (for ~15% of charged orders)
  console.log('Creating refunds...');
  const chargedOrders = orderIds.filter(o => o.status === 'CHARGED');
  const refundCount = Math.floor(chargedOrders.length * 0.15);
  for (let i = 0; i < refundCount; i++) {
    const o = chargedOrders[i];
    const isPartial = Math.random() > 0.6;
    const refundAmount = isPartial ? (parseFloat(o.amount) * (0.2 + Math.random() * 0.6)).toFixed(2) : o.amount;

    await query(
      `INSERT INTO refunds (refund_id, order_id, amount, status, refund_type, reason, gateway, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `REF_${uuidv4().substring(0, 12).toUpperCase()}`, o.id, refundAmount,
        randomItem(['SUCCESS', 'SUCCESS', 'SUCCESS', 'PENDING', 'FAILURE']),
        isPartial ? 'PARTIAL' : 'FULL',
        randomItem(['Customer request', 'Product defective', 'Wrong item shipped', 'Duplicate payment', 'Service not rendered']),
        o.gw,
        new Date(new Date(o.created).getTime() + Math.random() * 7 * 86400000).toISOString(),
      ]
    );

    // Update order refunded_amount
    await query(
      `UPDATE orders SET refunded_amount = $1 WHERE id = $2`,
      [refundAmount, o.id]
    );
  }
  console.log(`Created ${refundCount} refunds`);

  // Create chargebacks
  console.log('Creating chargebacks...');
  const cbCount = Math.floor(chargedOrders.length * 0.03);
  for (let i = 0; i < cbCount; i++) {
    const o = chargedOrders[chargedOrders.length - 1 - i];
    await query(
      `INSERT INTO chargebacks (chargeback_id, order_id, amount, status, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `CB_${uuidv4().substring(0, 12).toUpperCase()}`, o.id, o.amount,
        randomItem(['RECEIVED', 'RECEIVED', 'UNDER_REVIEW', 'RESOLVED_IN_MERCHANT_FAVOUR', 'RESOLVED_IN_CUSTOMER_FAVOUR']),
        randomItem(['Unauthorized transaction', 'Product not received', 'Duplicate charge', 'Service not as described']),
        new Date(new Date(o.created).getTime() + Math.random() * 14 * 86400000).toISOString(),
      ]
    );
  }
  console.log(`Created ${cbCount} chargebacks`);

  // Create mandates
  console.log('Creating mandates...');
  for (let i = 0; i < 200; i++) {
    const merchIdx = Math.floor(Math.random() * merchantIds.length);
    await query(
      `INSERT INTO mandates (mandate_id, merchant_id, customer_id, amount, status, mandate_type, frequency, gateway, created_at)
       VALUES ($1, $2, $3, $4, $5, 'RECURRING', $6, $7, $8)`,
      [
        `MAN_${uuidv4().substring(0, 12).toUpperCase()}`, merchantIds[merchIdx],
        `CUST_${(i + 5000).toString()}`,
        randomAmount(),
        randomItem(['ACTIVE', 'ACTIVE', 'ACTIVE', 'PAUSED', 'REVOKED', 'FAILED', 'CREATED']),
        randomItem(['MONTHLY', 'WEEKLY', 'DAILY', 'QUARTERLY']),
        randomItem(GATEWAYS),
        randomDate(180),
      ]
    );
  }
  console.log('Created 200 mandates');

  console.log('\n=== SEED COMPLETE ===');
  console.log('Login credentials:');
  console.log('  Admin: admin@juspay.in / Admin@123');
  console.log('  Ops Manager: ops.manager@juspay.in / User@1234');
  console.log('  Finance: finance@juspay.in / User@1234');
  console.log('  Support: support@juspay.in / User@1234');
  console.log('  Viewer: viewer@juspay.in / User@1234');

  await pool.end();
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
