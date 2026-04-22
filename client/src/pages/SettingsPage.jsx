import { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Settings, Globe, CreditCard, Webhook, Key, Save, RefreshCw,
  Plus, Trash2, TestTube2, ToggleLeft, ToggleRight, X, Eye, EyeOff,
  Clock, CheckCircle, XCircle, ExternalLink
} from 'lucide-react';

export default function SettingsPage() {
  const { hasPermission } = useAuth();
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
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      await settingsAPI.updateGeneral(general);
      alert('Settings saved successfully');
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleCreateWebhook = async () => {
    if (!webhookForm.url) return;
    setWebhookSaving(true);
    try {
      await settingsAPI.createWebhook(webhookForm);
      setShowWebhookForm(false);
      setWebhookForm({ url: '', events: [], description: '' });
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to create webhook'); }
    finally { setWebhookSaving(false); }
  };

  const handleToggleWebhook = async (wh) => {
    try {
      await settingsAPI.updateWebhook(wh.id, { is_active: !wh.is_active });
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handleDeleteWebhook = async (wh) => {
    if (!confirm(`Delete webhook ${wh.webhook_id}?`)) return;
    try {
      await settingsAPI.deleteWebhook(wh.id);
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handleTestWebhook = async (wh) => {
    setTestResult(null);
    try {
      const { data } = await settingsAPI.testWebhook(wh.id);
      setTestResult({ id: wh.id, ...data.test });
    } catch (err) { console.error(err); }
  };

  const toggleEvent = (event) => {
    setWebhookForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
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
            <div className="text-center py-12 text-gray-500">Loading...</div>
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Configure endpoints to receive real-time event notifications</p>
                    {canWrite && (
                      <button onClick={() => setShowWebhookForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                        <Plus size={16} /> Add Webhook
                      </button>
                    )}
                  </div>

                  {/* Webhook List */}
                  {webhooks.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Webhook size={32} className="mx-auto mb-2 text-gray-300" />
                      <p>No webhooks configured</p>
                    </div>
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
                                <button onClick={() => handleDeleteWebhook(wh)} title="Delete"
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
                    <div className="text-center py-12 text-gray-500">No audit logs found</div>
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
    </div>
  );
}
