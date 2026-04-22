const validator = require('validator');

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || !validator.isEmail(email)) errors.push('Valid email is required');
  if (!password || password.length < 1) errors.push('Password is required');

  if (errors.length > 0) return res.status(400).json({ errors });
  next();
};

const validateUser = (req, res, next) => {
  const { email, password, first_name } = req.body;
  const errors = [];

  if (!email || !validator.isEmail(email)) errors.push('Valid email is required');
  if (!first_name || first_name.trim().length === 0) errors.push('First name is required');
  if (req.method === 'POST') {
    if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      errors.push('Password must contain uppercase, lowercase, and number');
    }
  }

  if (errors.length > 0) return res.status(400).json({ errors });
  next();
};

const validateOrder = (req, res, next) => {
  const { amount, currency } = req.body;
  const errors = [];

  if (!amount || isNaN(amount) || amount <= 0) errors.push('Valid amount is required');
  if (currency && !['INR', 'USD', 'EUR', 'GBP', 'SGD'].includes(currency)) {
    errors.push('Invalid currency');
  }

  if (errors.length > 0) return res.status(400).json({ errors });
  next();
};

const validateRefund = (req, res, next) => {
  const { amount, reason } = req.body;
  const errors = [];

  if (!amount || isNaN(amount) || amount <= 0) errors.push('Valid refund amount is required');
  if (!reason || reason.trim().length === 0) errors.push('Refund reason is required');

  if (errors.length > 0) return res.status(400).json({ errors });
  next();
};

const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  req.pagination = { page, limit, offset };
  next();
};

module.exports = { validateLogin, validateUser, validateOrder, validateRefund, validatePagination };
