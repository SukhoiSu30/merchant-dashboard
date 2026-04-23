import { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Settings, Globe, CreditCard, Webhook, Key, Save, RefreshCw,
  Plus, Trash2, TestTube2, ToggleLeft, ToggleRight, X, Eye, EyeOff,
  Clock, CheckCircle, XCircle, ExternalLink, Edit, Check
} from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function SettingsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission('settings', 'READ_WRITE');

  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // General settings
  const [general, setGeneral] = useState(null);

  // Webhooks
  const [webhooks, setWebhooks] = useState([]);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ url: '', events: [], description: '' });
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false, webhookId: null });

  // Webhook Configuration
  const [webhookConfig, setWebhookConfig] = useState({
    primaryUrl: 'https://api.example.com/webhooks',
    basicAuthUsername: '',
    basicAuthPassword: '',
    addFullGatewayResponse: true,
    encryptionKey: 'JWT-HS256',
  });
  const [webhookConfigEditing, setWebhookConfigEditing] = useState(false);
  const [webhookConfigSaving, setWebhookConfigSaving] = useState(false);
  const [customHeaders, setCustomHeaders] = useState([
    { id: 1, name: 'X-Correlation-ID', value: 'auto-generated' },
    { id: 2, name: 'X-Merchant-ID', value: 'MID_JUSPAY_001' },
  ]);
  const [showPassword, setShowPassword] = useState(false);
  const [eventSubscriptions, setEventSubscriptions] = useState({
    'Order Events': { 'ORDER_CREATED': true, 'ORDER_CHARGED': true, 'ORDER_FAILED': true, 'ORDER_REFUNDED': true },
    'Refund Events': { 'REFUND_CREATED': true, 'REFUND_PROCESSED': true, 'REFUND_FAILED': true },
    'Transaction Events': { 'TXN_SUCCESS': true, 'TXN_FAILED': true },
    'Mandate Events': { 'MANDATE_CREATED': true, 'MANDATE_PAUSED': true, 'MANDATE_REVOKED': true },
    'Tokenization Events': { 'TOKEN_CREATED': true, 'TOKEN_DELETED': true },
  });

  // API Keys
  const [apiKeys, setApiKeys] = useState([]);
  const [showKey, setShowKey] = useState(null);

  // Audit Log
  const [auditLogs, setAuditLogs] = useState([]);

  const WEBHOOK_EVENTS = [
    'order.created', 'order.charged', 'order.failed', 'order.refunded',
    'refund.created', 'refund.processed', 'refund.failed',
    'chargeback.received', 'chargeback.updated', 'chargeback.resolved',
    'mandate.created', 'mandate.paused', 'mandate.revoked',
    'transaction.success', 'transaction.failed',
  ];

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'general') {
        const { data } = await settingsAPI.getGeneral();
        setGeneral(data.settings);
      } else if (activeTab === 'webhooks') {
        const { data } = await settingsAPI.listWebhooks();
        setWebhooks(data.webhooks);
      } else if (activeTab === 'api-keys') {
        const { data } = await settingsAPI.listApiKeys();
        setApiKeys(data.keys);
      } else if (activeTab === 'audit-log') {
        const { data } = await settingsAPI.auditLog({ limit: 50 });
        setAuditLogs(data.logs);
      }
    } catch (err) {
      toast.error('Failed to load settings. Please try again.');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      await settingsAPI.updateGeneral(general);
      toast.success('Settings saved successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save settings');
    }
    finally { setSaving(false); }
  };

  const handleCreateWebhook = async () => {
    if (!webhookForm.url) return;
    setWebhookSaving(true);
    try {
      await settingsAPI.createWebhook(webhookForm);
      setShowWebhookForm(false);
      setWebhookForm({ url: '', events: [], description: '' });
      toast.success('Webhook created successfully');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create webhook');
    }
    finally { setWebhookSaving(false); }
  };

  const handleToggleWebhook = async (wh) => {
    try {
      await settingsAPI.updateWebhook(wh.id, { is_active: !wh.is_active });
      toast.success(`Webhook ${wh.is_active ? 'disabled' : 'enabled'} successfully`);
      fetchData();
    } catch (err) {
      toast.error('Failed to update webhook');
    }
  };

  const handleDeleteWebhook = async () => {
    setConfirmModal({ ...confirmModal, loading: true });
    try {
      await settingsAPI.deleteWebhook(confirmModal.webhookId);
      toast.success('Webhook deleted successfully');
      setConfirmModal({ open: false, webhookId: null, loading: false });
      fetchData();
    } catch (err) {
      toast.error('Failed to delete webhook');
      setConfirmModal({ ...confirmModal, loading: false });
    }
  };

  const handleTestWebhook = async (wh) => {
    setTestResult(null);
    try {
      const { data } = await settingsAPI.testWebhook(wh.id);
      setTestResult({ id: wh.id, ...data.test });
    } catch (err) {
      toast.error('Failed to test webhook');
    }
  };

  const toggleEvent = (event) => {
    setWebhookForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  };

  const handleSaveWebhookConfig = async () => {
    // Validate HTTPS URL
    if (!webhookConfig.primaryUrl.startsWith('https://')) {
      toast.error('Webhook URL must use HTTPS');
      return;
    }
    setWebhookConfigSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      toast.success('Webhook configuration saved successfully');
      setWebhookConfigEditing(false);
    } catch (err) {
      toast.error('Failed to save webhook configuration');
    } finally {
      setWebhookConfigSaving(false);
    }
  };

  const handleAddHeader = () => {
    const newId = Math.max(...customHeaders.map(h => h.id || 0), 0) + 1;
    setCustomHeaders([...customHeaders, { id: newId, name: '', value: '' }]);
  };

  const handleUpdateHeader = (id, field, value) => {
    setCustomHeaders(customHeaders.map(h => h.id === id ? { ...h, [field]: value } : h));
  };

  const handleDeleteHeader = (id) => {
    setCustomHeaders(customHeaders.filter(h => h.id !== id));
  };

  const toggleEventSubscription = (category, event) => {
    setEventSubscriptions(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [event]: !prev[category][event],
      },
    }));
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'audit-log', label: 'Audit Log', icon: Clock },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your merchant configuration</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 mb-4">
        <div className="flex border-b border-gray-200">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="space-y-4">
              <Skeleton height="20px" width="200px" className="mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height="16px" width="100%" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* General Settings */}
              {activeTab === 'general' && general && (
                <div className="space-y-6 max-w-2xl">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Business Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Merchant Name</label>
                        <input type="text" value={general.merchant_name}
                          onChange={(e) => setGeneral(g => ({ ...g, merchant_name: e.target.value }))}
                          disabled={!canWrite} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Merchant ID</label>
                        <input type="text" value={general.merchant_id} disabled
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Business Type</label>
                        <select value={general.business_type}
                          onChange={(e) => setGeneral(g => ({ ...g, business_type: e.target.value }))}
                          disabled={!canWrite} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50">
                          <option>E-Commerce</option><option>SaaS</option><option>Marketplace</option>
                          <option>Financial Services</option><option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Currency</label>
                        <select value={general.currency}
                          onChange={(e) => setGeneral(g => ({ ...g, currency: e.target.value }))}
                          disabled={!canWrite} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50">
                          <option value="INR">INR - Indian Rupee</option>
                          <option value="USD">USD - US Dollar</option>
                          <option value="EUR">EUR - Euro</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Payment Configuration</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Settlement Cycle</label>
                        <select value={general.settlement_cycle}
                          onChange={(e) => setGeneral(g => ({ ...g, settlement_cycle: e.target.value }))}
                          disabled={!canWrite} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50">
                          <option value="T+0">T+0 (Instant)</option>
                          <option value="T+1">T+1 (Next Day)</option>
                          <option value="T+2">T+2</option>
                          <option value="T+3">T+3</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Timezone</label>
                        <select value={general.timezone}
                          onChange={(e) => setGeneral(g => ({ ...g, timezone: e.target.value }))}
                          disabled={!canWrite} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50">
                          <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                          <option value="UTC">UTC</option>
                          <option value="America/New_York">America/New_York (EST)</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium">Auto Capture</p>
                          <p className="text-xs text-gray-500">Automatically capture authorized payments</p>
                        </div>
                        <button onClick={() => canWrite && setGeneral(g => ({ ...g, auto_capture: !g.auto_capture }))}
                          disabled={!canWrite}>
                          {general.auto_capture
                            ? <ToggleRight size={28} className="text-success-500" />
                            : <ToggleLeft size={28} className="text-gray-300" />
                          }
                        </button>
                      </label>
                      <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium">Auto Refund</p>
                          <p className="text-xs text-gray-500">Process refunds automatically on chargeback</p>
                        </div>
                        <button onClick={() => canWrite && setGeneral(g => ({ ...g, auto_refund: !g.auto_refund }))}
                          disabled={!canWrite}>
                          {general.auto_refund
                            ? <ToggleRight size={28} className="text-success-500" />
                            : <ToggleLeft size={28} className="text-gray-300" />
                          }
                        </button>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">URLs</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Callback URL</label>
                        <input type="url" value={general.callback_url}
                          onChange={(e) => setGeneral(g => ({ ...g, callback_url: e.target.value }))}
                          disabled={!canWrite} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Return URL</label>
                        <input type="url" value={general.return_url}
                          onChange={(e) => setGeneral(g => ({ ...g, return_url: e.target.value }))}
                          disabled={!canWrite} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
                      </div>
                    </div>
                  </div>

                  {canWrite && (
                    <button onClick={handleSaveGeneral} disabled={saving}
                      className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                      <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  )}
                </div>
              )}

              {/* Webhooks */}
              {activeTab === 'webhooks' && (
                <div className="space-y-6">
                  {/* Webhook Configuration Section */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-800">Webhook Configuration</h3>
                      {canWrite && !webhookConfigEditing && (
                        <button onClick={() => setWebhookConfigEditing(true)}
                          className="flex items-center gap-2 px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded">
                          <Edit size={14} /> Edit
                        </button>
                      )}
                    </div>

                    {webhookConfigEditing ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Primary Webhook URL *</label>
                          <input type="url" value={webhookConfig.primaryUrl}
                            onChange={(e) => setWebhookConfig(c => ({ ...c, primaryUrl: e.target.value }))}
                            placeholder="https://your-server.com/webhooks"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                          <p className="text-xs text-gray-400 mt-1">Must use HTTPS</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">HTTP Basic Auth Username</label>
                            <input type="text" value={webhookConfig.basicAuthUsername}
                              onChange={(e) => setWebhookConfig(c => ({ ...c, basicAuthUsername: e.target.value }))}
                              placeholder="Username (optional)"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">HTTP Basic Auth Password</label>
                            <div className="relative">
                              <input type={showPassword ? 'text' : 'password'} value={webhookConfig.basicAuthPassword}
                                onChange={(e) => setWebhookConfig(c => ({ ...c, basicAuthPassword: e.target.value }))}
                                placeholder="Password (optional)"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-9" />
                              <button onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="text-sm font-medium">Add Full Gateway Response</p>
                              <p className="text-xs text-gray-500">Include complete payment gateway response</p>
                            </div>
                            <button onClick={() => setWebhookConfig(c => ({ ...c, addFullGatewayResponse: !c.addFullGatewayResponse }))}
                              disabled={!canWrite}>
                              {webhookConfig.addFullGatewayResponse
                                ? <ToggleRight size={24} className="text-success-500" />
                                : <ToggleLeft size={24} className="text-gray-300" />
                              }
                            </button>
                          </label>

                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Webhook Encryption Key</label>
                            <select value={webhookConfig.encryptionKey}
                              onChange={(e) => setWebhookConfig(c => ({ ...c, encryptionKey: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                              <option value="None">None</option>
                              <option value="JWT-HS256">JWT-HS256</option>
                              <option value="JWT-RS256">JWT-RS256</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                          <button onClick={() => setWebhookConfigEditing(false)}
                            className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
                            Cancel
                          </button>
                          <button onClick={handleSaveWebhookConfig} disabled={webhookConfigSaving}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                            <Check size={14} /> {webhookConfigSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between py-2 border-b border-gray-50">
                          <span className="text-gray-600">Primary URL</span>
                          <span className="text-gray-900 font-mono text-xs">{webhookConfig.primaryUrl}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-gray-50">
                          <span className="text-gray-600">Basic Auth</span>
                          <span className="text-gray-900">{webhookConfig.basicAuthUsername ? 'Configured' : 'Not configured'}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-gray-50">
                          <span className="text-gray-600">Gateway Response</span>
                          <span className={`badge ${webhookConfig.addFullGatewayResponse ? 'badge-success' : 'badge-gray'}`}>
                            {webhookConfig.addFullGatewayResponse ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-gray-600">Encryption</span>
                          <span className="text-gray-900">{webhookConfig.encryptionKey}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Custom Headers Section */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-800">Custom Headers</h3>
                      {canWrite && (
                        <button onClick={handleAddHeader}
                          className="flex items-center gap-2 px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded">
                          <Plus size={14} /> Add Header
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Header Name</th>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Header Value</th>
                            {canWrite && <th className="text-center text-xs font-medium text-gray-500 uppercase px-3 py-2">Action</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {customHeaders.map(header => (
                            <tr key={header.id}>
                              <td className="px-3 py-2">
                                <input type="text" value={header.name}
                                  onChange={(e) => handleUpdateHeader(header.id, 'name', e.target.value)}
                                  disabled={!canWrite}
                                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs disabled:bg-gray-50" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="text" value={header.value}
                                  onChange={(e) => handleUpdateHeader(header.id, 'value', e.target.value)}
                                  disabled={!canWrite}
                                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs disabled:bg-gray-50" />
                              </td>
                              {canWrite && (
                                <td className="px-3 py-2 text-center">
                                  <button onClick={() => handleDeleteHeader(header.id)}
                                    className="text-gray-400 hover:text-danger-600">
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Event Subscriptions Section */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-sm font-semibold text-gray-800 mb-4">Event Subscriptions</h3>
                    <div className="space-y-4">
                      {Object.entries(eventSubscriptions).map(([category, events]) => (
                        <div key={category}>
                          <h4 className="text-xs font-medium text-gray-600 mb-2 uppercase">{category}</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(events).map(([event, isChecked]) => (
                              <label key={event} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                <input type="checkbox" checked={isChecked}
                                  onChange={() => toggleEventSubscription(category, event)}
                                  disabled={!canWrite}
                                  className="rounded" />
                                <span className="text-sm text-gray-700">{event}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Webhook List */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-800">Webhook Endpoints</h3>
                      {canWrite && (
                        <button onClick={() => setShowWebhookForm(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                          <Plus size={16} /> Add Webhook
                        </button>
                      )}
                    </div>

                    {webhooks.length === 0 ? (
                      <EmptyState icon="default" title="No webhooks configured" description="Add a webhook to receive real-time event notifications" />
                    ) : (
                      <div className="space-y-3">
                        {webhooks.map(wh => (
                          <div key={wh.id} className={`border rounded-lg p-4 ${wh.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${wh.is_active ? 'bg-success-500' : 'bg-gray-300'}`} />
                                  <p className="text-sm font-medium text-gray-900 truncate">{wh.url}</p>
                                </div>
                                <p className="text-xs text-gray-500 mt-1 font-mono">{wh.webhook_id}</p>
                                {wh.description && <p className="text-xs text-gray-500 mt-1">{wh.description}</p>}
                              </div>
                              {canWrite && (
                                <div className="flex items-center gap-1 ml-3">
                                  <button onClick={() => handleTestWebhook(wh)} title="Test"
                                    className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded">
                                    <ExternalLink size={14} />
                                  </button>
                                  <button onClick={() => handleToggleWebhook(wh)} title={wh.is_active ? 'Disable' : 'Enable'}>
                                    {wh.is_active
                                      ? <ToggleRight size={22} className="text-success-500" />
                                      : <ToggleLeft size={22} className="text-gray-300" />
                                    }
                                  </button>
                                  <button onClick={() => setConfirmModal({ open: true, webhookId: wh.id })} title="Delete"
                                    className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {(Array.isArray(wh.events) ? wh.events : JSON.parse(wh.events || '[]')).map(ev => (
                                <span key={ev} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{ev}</span>
                              ))}
                            </div>
                            {testResult && testResult.id === wh.id && (
                              <div className={`mt-2 p-2 rounded text-xs flex items-center gap-2 ${
                                testResult.status === 'success' ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600'
                              }`}>
                                {testResult.status === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                {testResult.status === 'success' ? `Success — ${testResult.response_code} (${testResult.response_time}ms)` : `Failed — ${testResult.response_code}`}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* New Webhook Form */}
                  {showWebhookForm && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
                        <div className="flex items-center justify-between p-5 border-b border-gray-200">
                          <h2 className="text-lg font-semibold">Add Webhook</h2>
                          <button onClick={() => setShowWebhookForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL *</label>
                            <input type="url" value={webhookForm.url}
                              onChange={(e) => setWebhookForm(f => ({ ...f, url: e.target.value }))}
                              placeholder="https://your-server.com/webhooks"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <input type="text" value={webhookForm.description}
                              onChange={(e) => setWebhookForm(f => ({ ...f, description: e.target.value }))}
                              placeholder="Optional description"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Events *</label>
                            <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                              {WEBHOOK_EVENTS.map(ev => (
                                <label key={ev} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                  <input type="checkbox" checked={webhookForm.events.includes(ev)}
                                    onChange={() => toggleEvent(ev)} className="rounded" />
                                  <span className="text-xs text-gray-700">{ev}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setShowWebhookForm(false)}
                              className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                            <button onClick={handleCreateWebhook} disabled={webhookSaving || !webhookForm.url || webhookForm.events.length === 0}
                              className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                              {webhookSaving ? 'Creating...' : 'Create Webhook'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* API Keys */}
              {activeTab === 'api-keys' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">Manage API keys for authentication</p>
                  <div className="space-y-3">
                    {apiKeys.map(key => (
                      <div key={key.id} className={`border rounded-lg p-4 ${key.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Key size={16} className="text-gray-400" />
                              <p className="text-sm font-medium">{key.key_name}</p>
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                key.environment === 'production' ? 'bg-danger-50 text-danger-600' :
                                key.environment === 'test' ? 'bg-warning-50 text-warning-600' :
                                'bg-gray-100 text-gray-600'
                              }`}>{key.environment}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-1">
                              <p className="text-sm font-mono text-gray-500">
                                {showKey === key.id ? key.key_prefix.replace('****', 'xxxx_real_key_here') : key.key_prefix}
                              </p>
                              <button onClick={() => setShowKey(showKey === key.id ? null : key.id)}
                                className="text-gray-400 hover:text-gray-600">
                                {showKey === key.id ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                              Created {new Date(key.created_at).toLocaleDateString()} — Last used {new Date(key.last_used).toLocaleDateString()}
                            </p>
                          </div>
                          <span className={`w-2 h-2 rounded-full ${key.is_active ? 'bg-success-500' : 'bg-gray-300'}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-700">API key creation and rotation will be available in Phase 5 (Security & Encryption).</p>
                  </div>
                </div>
              )}

              {/* Audit Log */}
              {activeTab === 'audit-log' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Recent activity across all modules</p>
                    <button onClick={fetchData} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
                  </div>
                  {auditLogs.length === 0 ? (
                    <EmptyState icon="default" title="No audit logs found" description="Activity logs will appear here as you manage your settings" />
                  ) : (
                    <div className="space-y-1">
                      {auditLogs.map(log => (
                        <div key={log.id} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <Clock size={14} className="text-gray-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{log.action}</span>
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">{log.module}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-gray-500">{log.user_email || 'System'}</span>
                              <span className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</span>
                              {log.entity_id && <span className="text-xs text-gray-400 font-mono">{log.entity_id}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, webhookId: null })}
        onConfirm={handleDeleteWebhook}
        title="Delete Webhook"
        message="This action cannot be undone. The webhook endpoint will no longer receive event notifications."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={confirmModal.loading}
      />
    </div>
  );
}
