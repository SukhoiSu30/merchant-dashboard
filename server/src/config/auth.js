module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET || 'juspay-dashboard-secret-key-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'juspay-dashboard-refresh-secret-change-in-production',
    accessExpiresIn: '15m',
    refreshExpiresIn: '7d',
  },
  totp: {
    issuer: 'JusPay Dashboard',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  },
  password: {
    saltRounds: 12,
    minLength: 8,
    maxFailedAttempts: 5,
    lockDurationMinutes: 30,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
    loginWindowMs: 15 * 60 * 1000,
    loginMaxRequests: 10,
  },
};
