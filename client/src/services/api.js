import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(`${API_BASE}/api/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  verify2FA: (data) => api.post('/auth/verify-2fa', data),
  refresh: (data) => api.post('/auth/refresh', data),
  me: () => api.get('/auth/me'),
  setup2FA: () => api.post('/auth/setup-2fa'),
  enable2FA: (data) => api.post('/auth/enable-2fa', data),
  disable2FA: (data) => api.post('/auth/disable-2fa', data),
  changePassword: (data) => api.post('/auth/change-password', data),
  verifyToken: (token) => api.get(`/auth/verify-token/${token}`),
  setupPassword: (data) => api.post('/auth/setup-password', data),
};

// Dashboard API
export const dashboardAPI = {
  overview: (period) => api.get(`/dashboard/overview?period=${period || '7d'}`),
  live: () => api.get('/dashboard/live'),
};

// Orders API
export const ordersAPI = {
  list: (params) => api.get('/orders', { params }),
  stats: (period) => api.get(`/orders/stats?period=${period || '7d'}`),
  get: (id) => api.get(`/orders/${id}`),
};

// Transactions API
export const transactionsAPI = {
  list: (params) => api.get('/transactions', { params }),
  stats: (period) => api.get(`/transactions/stats?period=${period || '7d'}`),
  get: (id) => api.get(`/transactions/${id}`),
};

// Refunds API
export const refundsAPI = {
  list: (params) => api.get('/refunds', { params }),
  create: (data) => api.post('/refunds', data),
  get: (id) => api.get(`/refunds/${id}`),
};

// Chargebacks API
export const chargebacksAPI = {
  list: (params) => api.get('/chargebacks', { params }),
  stats: () => api.get('/chargebacks/stats'),
  get: (id) => api.get(`/chargebacks/${id}`),
  updateStatus: (id, data) => api.put(`/chargebacks/${id}/status`, data),
};

// Mandates API
export const mandatesAPI = {
  list: (params) => api.get('/mandates', { params }),
  stats: () => api.get('/mandates/stats'),
  get: (id) => api.get(`/mandates/${id}`),
  pause: (id) => api.put(`/mandates/${id}/pause`),
  resume: (id) => api.put(`/mandates/${id}/resume`),
  revoke: (id) => api.put(`/mandates/${id}/revoke`),
};

// Gateways API
export const gatewaysAPI = {
  list: () => api.get('/gateways'),
  get: (id) => api.get(`/gateways/${id}`),
  create: (data) => api.post('/gateways', data),
  update: (id, data) => api.put(`/gateways/${id}`, data),
  toggle: (id) => api.put(`/gateways/${id}/toggle`),
};

// Users API
export const usersAPI = {
  list: (params) => api.get('/users', { params }),
  get: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  lock: (id) => api.post(`/users/${id}/lock`),
  unlock: (id) => api.post(`/users/${id}/unlock`),
  delete: (id) => api.delete(`/users/${id}`),
  roles: () => api.get('/users/roles/list'),
};

// Batch Operations API
export const batchAPI = {
  list: (params) => api.get('/batch', { params }),
  get: (id) => api.get(`/batch/${id}`),
  upload: (data) => api.post('/batch/upload', data),
  download: (id) => api.get(`/batch/${id}/download`),
  types: () => api.get('/batch/types/list'),
};

// Settings API
export const settingsAPI = {
  getGeneral: () => api.get('/settings/general'),
  updateGeneral: (data) => api.put('/settings/general', data),
  getSecurity: () => api.get('/settings/security'),
  updateSecurity: (data) => api.put('/settings/security', data),
  // Webhooks
  listWebhooks: () => api.get('/settings/webhooks'),
  createWebhook: (data) => api.post('/settings/webhooks', data),
  updateWebhook: (id, data) => api.put(`/settings/webhooks/${id}`, data),
  deleteWebhook: (id) => api.delete(`/settings/webhooks/${id}`),
  testWebhook: (id) => api.post(`/settings/webhooks/${id}/test`),
  // API Keys
  listApiKeys: () => api.get('/settings/api-keys'),
  // Audit Log
  auditLog: (params) => api.get('/settings/audit-log', { params }),
};

// Surcharge API
export const surchargeAPI = {
  list: () => api.get('/surcharge'),
  calculate: (params) => api.get('/surcharge/calculate', { params }),
  create: (data) => api.post('/surcharge', data),
  update: (id, data) => api.put(`/surcharge/${id}`, data),
  delete: (id) => api.delete(`/surcharge/${id}`),
};

// Routing API
export const routingAPI = {
  health: () => api.get('/routing/health'),
  priority: () => api.get('/routing/priority'),
  updatePriority: (data) => api.put('/routing/priority', data),
  createRule: (data) => api.post('/routing/rules', data),
  updateSmart: (data) => api.put('/routing/smart', data),
  outages: () => api.get('/routing/outages'),
  createOutage: (data) => api.post('/routing/outages', data),
  resolveOutage: (id, data) => api.put(`/routing/outages/${id}/resolve`, data),
};

// Alerts API
export const alertsAPI = {
  rules: () => api.get('/alerts/rules'),
  createRule: (data) => api.post('/alerts/rules', data),
  updateRule: (id, data) => api.put(`/alerts/rules/${id}`, data),
  deleteRule: (id) => api.delete(`/alerts/rules/${id}`),
  history: (params) => api.get('/alerts/history', { params }),
  acknowledge: (id) => api.put(`/alerts/history/${id}/acknowledge`),
  types: () => api.get('/alerts/types'),
};

// Reports API
export const reportsAPI = {
  templates: () => api.get('/reports/templates'),
  generate: (data) => api.post('/reports/generate', data),
  history: () => api.get('/reports/history'),
  scheduled: () => api.get('/reports/scheduled'),
  createSchedule: (data) => api.post('/reports/schedule', data),
};

export default api;
