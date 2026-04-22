const { pool } = require('./database');
require('dotenv').config();

const migration = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ROLES & PERMISSIONS (RBAC)
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module VARCHAR(100) NOT NULL,
  access_level VARCHAR(20) NOT NULL CHECK (access_level IN ('READ', 'READ_WRITE')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, module)
);

-- ============================================
-- USERS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  role_id UUID REFERENCES roles(id),
  merchant_id UUID,
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOCKED', 'PENDING')),
  totp_secret VARCHAR(255),
  totp_enabled BOOLEAN DEFAULT false,
  passkey_credential_id TEXT,
  passkey_public_key TEXT,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MERCHANTS
-- ============================================
CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  category VARCHAR(100),
  website VARCHAR(255),
  logo_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  settlement_account_no VARCHAR(50),
  ifsc_code VARCHAR(20),
  return_url VARCHAR(500),
  webhook_url VARCHAR(500),
  api_key VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GATEWAYS
-- ============================================
CREATE TABLE IF NOT EXISTS gateways (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  gateway_name VARCHAR(100) NOT NULL,
  gateway_type VARCHAR(50) NOT NULL,
  credentials JSONB DEFAULT '{}',
  payment_methods JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(100) UNIQUE NOT NULL,
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(30) NOT NULL DEFAULT 'NEW' CHECK (status IN (
    'NEW','PENDING_VBV','CHARGED','AUTHENTICATION_FAILED',
    'AUTHORIZATION_FAILED','JUSPAY_DECLINED','AUTHORIZING',
    'COD_INITIATED','STARTED','AUTO_REFUNDED','VOIDED',
    'VOID_INITIATED','NOP','NOT_FOUND','ERROR','CAPTURE_INITIATED',
    'CAPTURE_FAILED','VOID_FAILED','REFUND_INITIATED','REFUNDED',
    'PARTIAL_CHARGED'
  )),
  payment_method VARCHAR(50),
  payment_method_type VARCHAR(50),
  card_brand VARCHAR(30),
  card_type VARCHAR(20),
  card_last_four VARCHAR(4),
  gateway VARCHAR(50),
  customer_id VARCHAR(100),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(20),
  customer_name VARCHAR(255),
  billing_address JSONB,
  shipping_address JSONB,
  description TEXT,
  return_url VARCHAR(500),
  udf1 VARCHAR(255),
  udf2 VARCHAR(255),
  udf3 VARCHAR(255),
  udf4 VARCHAR(255),
  udf5 VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  error_code VARCHAR(100),
  error_message TEXT,
  gateway_reference_id VARCHAR(255),
  gateway_order_id VARCHAR(255),
  risk_score DECIMAL(5,2),
  risk_status VARCHAR(20),
  mandate_id UUID,
  refunded_amount DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRANSACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  txn_id VARCHAR(100) UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id),
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  txn_type VARCHAR(20) DEFAULT 'PAYMENT' CHECK (txn_type IN ('PAYMENT','REFUND','VOID','CAPTURE')),
  gateway VARCHAR(50),
  gateway_txn_id VARCHAR(255),
  payment_method VARCHAR(50),
  payment_method_type VARCHAR(50),
  error_code VARCHAR(100),
  error_message TEXT,
  pg_response JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REFUNDS
-- ============================================
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  refund_id VARCHAR(100) UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id),
  txn_id UUID REFERENCES transactions(id),
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','SUCCESS','FAILURE','MANUAL_REVIEW'
  )),
  refund_type VARCHAR(20) DEFAULT 'FULL' CHECK (refund_type IN ('FULL','PARTIAL')),
  reason TEXT,
  gateway VARCHAR(50),
  gateway_refund_id VARCHAR(255),
  initiated_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CHARGEBACKS
-- ============================================
CREATE TABLE IF NOT EXISTS chargebacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chargeback_id VARCHAR(100) UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id),
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(30) DEFAULT 'RECEIVED' CHECK (status IN (
    'RECEIVED','RESOLVED_IN_MERCHANT_FAVOUR','RESOLVED_IN_CUSTOMER_FAVOUR',
    'UNDER_REVIEW','ESCALATED'
  )),
  reason TEXT,
  evidence JSONB DEFAULT '{}',
  due_date TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MANDATES
-- ============================================
CREATE TABLE IF NOT EXISTS mandates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mandate_id VARCHAR(100) UNIQUE NOT NULL,
  order_id UUID REFERENCES orders(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  customer_id VARCHAR(100),
  amount DECIMAL(15,2),
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(30) DEFAULT 'CREATED' CHECK (status IN (
    'CREATED','ACTIVE','PAUSED','REVOKED','FAILED','EXPIRED'
  )),
  mandate_type VARCHAR(20) DEFAULT 'RECURRING',
  frequency VARCHAR(20),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  max_amount DECIMAL(15,2),
  payment_method VARCHAR(50),
  gateway VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  module VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(255),
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BATCH OPERATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS batch_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id VARCHAR(100) UNIQUE NOT NULL,
  batch_type VARCHAR(50) NOT NULL,
  file_name VARCHAR(255),
  status VARCHAR(30) DEFAULT 'PROCESSING' CHECK (status IN (
    'PROCESSING','COMPLETED','FAILED','PENDING_APPROVAL','REJECTED'
  )),
  total_tasks INT DEFAULT 0,
  accepted_tasks INT DEFAULT 0,
  rejected_tasks INT DEFAULT 0,
  queued_tasks INT DEFAULT 0,
  description TEXT,
  uploaded_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  file_data JSONB DEFAULT '[]',
  results JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WEBHOOK CONFIGS
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  primary_url VARCHAR(500),
  secondary_url VARCHAR(500),
  custom_headers JSONB DEFAULT '{}',
  events JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MONITORING ALERTS
-- ============================================
CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID REFERENCES merchants(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  source VARCHAR(30) NOT NULL,
  dimensions JSONB DEFAULT '[]',
  metrics JSONB DEFAULT '[]',
  thresholds JSONB DEFAULT '{}',
  monitor_every INT DEFAULT 3600,
  schedule JSONB DEFAULT '{}',
  email_recipients JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mandates_merchant ON mandates(merchant_id);
CREATE INDEX IF NOT EXISTS idx_mandates_status ON mandates(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_merchant ON users(merchant_id);
`;

async function migrate() {
  console.log('Running database migration...');
  try {
    await pool.query(migration);
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrate().catch(() => process.exit(1));
}

module.exports = { migrate, migration };
