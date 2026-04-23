import { useState, useEffect } from 'react';
import { alertsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CardSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import {
  Bell, Plus, X, Save, RefreshCw, Trash2, Edit3, Eye, CheckCircle,
  XCircle, AlertTriangle, AlertOctagon, Info, ToggleLeft, ToggleRight, Clock
} from 'lucide-react';

function SeverityBadge({ severity }) {
  const styles = {
    CRITICAL: 'bg-danger-100 text-danger-700 border-danger-200',
    HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
    MEDIUM: 'bg-warning-100 text-warning-700 border-warning-200',
    LOW: 'bg-blue-100 text-blue-700 border-blue-200',
    INFO: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${styles[severity] || styles.INFO}`}>{severity}</span>;
}

function StatusBadge({ status }) {
  const styles = {
    TRIGGERED: 'badge-danger', ACKNOWLEDGED: 'badge-warning', RESOLVED: 'badge-success',
  };
  return <span className={`badge ${styles[status] || 'badge-gray'}`}>{status}</span>;
}

export default function AlertsPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('monitoring', 'READ_WRITE');
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('history');
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, rule: null });

  // Alert history
  const [alerts, setAlerts] = useState([]);
  const [alertSummary, setAlertSummary] = useState(null);
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Alert rules
  const [rules, setRules] = useState([]);
  const [alertTypes, setAlertTypes] = useState([]);
  const [severities, setSeverities] = useState([]);
  const [channels, setChannels] = useState([]);

  // Create/Edit rule modal
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    alert_name: '', alert_type: '', severity: 'HIGH', threshold: '',
    gateway_filter: '', payment_method_filter: '', channels: ['IN_APP'],
    cooldown_minutes: 15, description: '',
  });
  const [ruleSaving, setRuleSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'history') {
        const params = {};
        if (severityFilter) params.severity = severityFilter;
        if (statusFilter) params.status = statusFilter;
        const { data } = await alertsAPI.history(params);
        setAlerts(data.alerts);
        setAlertSummary(data.summary);
      } else if (activeTab === 'rules') {
        const [rulesRes, typesRes] = await Promise.all([
          alertsAPI.rules(),
          alertsAPI.types(),
        ]);
        setRules(rulesRes.data.rules);
        setAlertTypes(typesRes.data.types);
        setSeverities(typesRes.data.severities);
        setChannels(typesRes.data.channels);
      }
    } catch (err) { toast.error('Failed to load alerts'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [activeTab, severityFilter, statusFilter]);

  const handleAcknowledge = async (alertId) => {
    try {
      await alertsAPI.acknowledge(alertId);
      toast.success('Alert acknowledged');
      fetchData();
    } catch (err) { toast.error('Failed to acknowledge alert'); }
  };

  const handleCreateRule = async () => {
    if (!ruleForm.alert_name || !ruleForm.alert_type) return;
    setRuleSaving(true);
    try {
      await alertsAPI.createRule(ruleForm);
      toast.success('Alert rule created successfully');
      setShowRuleForm(false);
      setRuleForm({
        alert_name: '', alert_type: '', severity: 'HIGH', threshold: '',
        gateway_filter: '', payment_method_filter: '', channels: ['IN_APP'],
        cooldown_minutes: 15, description: '',
      });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to create rule'); }
    finally { setRuleSaving(false); }
  };

  const handleDeleteRule = async (rule) => {
    setDeleteConfirm({ open: true, rule });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.rule) return;
    try {
      await alertsAPI.deleteRule(deleteConfirm.rule.id);
      toast.success('Alert rule deleted successfully');
      setDeleteConfirm({ open: false, rule: null });
      fetchData();
    } catch (err) { toast.error('Failed to delete rule'); }
  };

  const handleToggleRule = async (rule) => {
    try {
      await alertsAPI.updateRule(rule.id, { is_active: !rule.is_active });
      toast.success(rule.is_active ? 'Alert rule disabled' : 'Alert rule enabled');
      fetchData();
    } catch (err) { toast.error('Failed to update rule'); }
  };

  const toggleChannel = (ch) => {
    setRuleForm(f => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter(c => c !== ch)
        : [...f.channels, ch],
    }));
  };

  const severityIcon = (sev) => {
    if (sev === 'CRITICAL') return <AlertOctagon size={16} className="text-danger-500" />;
    if (sev === 'HIGH') return <AlertTriangle size={16} className="text-orange-500" />;
    if (sev === 'MEDIUM') return <Bell size={16} className="text-warning-500" />;
    return <Info size={16} className="text-blue-500" />;
  };

  const timeSince = (dateStr) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const tabs = [
    { id: 'history', label: 'Alert History', icon: Clock },
    { id: 'rules', label: 'Alert Rules', icon: Bell },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoring Alerts</h1>
          <p className="text-gray-500 text-sm mt-1">Real-time alerts and notification rules</p>
        </div>
        <button onClick={fetchData} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={18} /></button>
      </div>

      {/* Summary Cards */}
      {alertSummary && activeTab === 'history' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Total Alerts</p>
            <p className="text-xl font-bold">{alertSummary.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-danger-200 p-4">
            <p className="text-xs text-danger-600 mb-1">Critical</p>
            <p className="text-xl font-bold text-danger-600">{alertSummary.critical}</p>
          </div>
          <div className="bg-white rounded-xl border border-orange-200 p-4">
            <p className="text-xs text-orange-600 mb-1">High</p>
            <p className="text-xl font-bold text-orange-600">{alertSummary.high}</p>
          </div>
          <div className="bg-white rounded-xl border border-warning-200 p-4">
            <p className="text-xs text-warning-600 mb-1">Acknowledged</p>
            <p className="text-xl font-bold text-warning-600">{alertSummary.acknowledged}</p>
          </div>
          <div className="bg-white rounded-xl border border-success-200 p-4">
            <p className="text-xs text-success-600 mb-1">Resolved</p>
            <p className="text-xl font-bold text-success-600">{alertSummary.resolved}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        {/* Tabs */}
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
              <CardSkeleton height={120} />
              <CardSkeleton height={120} />
              <CardSkeleton height={120} />
            </div>
          ) : (
            <>
              {/* Alert History */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  {/* Filters */}
                  <div className="flex items-center gap-3">
                    <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                      <option value="">All Severities</option>
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                      <option value="">All Statuses</option>
                      <option value="TRIGGERED">Triggered</option>
                      <option value="ACKNOWLEDGED">Acknowledged</option>
                      <option value="RESOLVED">Resolved</option>
                    </select>
                  </div>

                  {/* Alert Timeline */}
                  {alerts.length === 0 ? (
                    <EmptyState icon="alert" title="No alerts" message="No alerts matching your filters" />
                  ) : (
                    <div className="space-y-3">
                      {alerts.map(alert => (
                        <div key={alert.id} className={`border rounded-lg p-4 ${
                          alert.status === 'TRIGGERED' ? 'border-danger-200 bg-danger-50/50' :
                          alert.status === 'ACKNOWLEDGED' ? 'border-warning-200 bg-warning-50/30' :
                          'border-gray-200'
                        }`}>
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              {severityIcon(alert.severity)}
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <SeverityBadge severity={alert.severity} />
                                  <StatusBadge status={alert.status} />
                                  {alert.gateway && <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{alert.gateway}</span>}
                                </div>
                                <p className="text-sm text-gray-900">{alert.message}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-gray-400">{timeSince(alert.triggered_at)}</span>
                                  <span className="text-xs text-gray-400">
                                    {alert.alert_type.replace(/_/g, ' ').toLowerCase()}
                                  </span>
                                  {alert.acknowledged_by && (
                                    <span className="text-xs text-gray-400">Ack by {alert.acknowledged_by}</span>
                                  )}
                                  {alert.resolved_at && (
                                    <span className="text-xs text-success-500">Resolved {timeSince(alert.resolved_at)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {canWrite && alert.status === 'TRIGGERED' && (
                              <button onClick={() => handleAcknowledge(alert.id)}
                                className="px-3 py-1.5 bg-warning-600 text-white rounded-lg text-xs hover:bg-warning-700 whitespace-nowrap">
                                Acknowledge
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Alert Rules */}
              {activeTab === 'rules' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Configure when and how you get notified</p>
                    {canWrite && (
                      <button onClick={() => setShowRuleForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                        <Plus size={16} /> Create Alert Rule
                      </button>
                    )}
                  </div>

                  {rules.length === 0 ? (
                    <EmptyState icon="bell" title="No alert rules" message="No alert rules configured" />
                  ) : (
                    <div className="space-y-3">
                      {rules.map(rule => (
                        <div key={rule.id} className={`border rounded-lg p-4 ${rule.is_active ? 'border-gray-200' : 'border-gray-200 opacity-50'}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-medium text-gray-900">{rule.alert_name}</p>
                                <SeverityBadge severity={rule.severity} />
                                <span className="text-xs px-2 py-0.5 bg-primary-50 text-primary-600 rounded">
                                  {rule.alert_type?.replace(/_/g, ' ')}
                                </span>
                              </div>
                              {rule.description && <p className="text-xs text-gray-500 mb-2">{rule.description}</p>}
                              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                {rule.threshold_value && <span>Threshold: {rule.threshold_value}</span>}
                                {rule.gateway_filter && <span>Gateway: {rule.gateway_filter}</span>}
                                {rule.payment_method_filter && <span>Method: {rule.payment_method_filter}</span>}
                                <span>Cooldown: {rule.cooldown_minutes}min</span>
                                <span>Channels: {
                                  (Array.isArray(rule.notification_channels)
                                    ? rule.notification_channels
                                    : JSON.parse(rule.notification_channels || '[]')
                                  ).join(', ')
                                }</span>
                              </div>
                            </div>
                            {canWrite && (
                              <div className="flex items-center gap-1 ml-3">
                                <button onClick={() => handleToggleRule(rule)}>
                                  {rule.is_active
                                    ? <ToggleRight size={22} className="text-success-500" />
                                    : <ToggleLeft size={22} className="text-gray-300" />
                                  }
                                </button>
                                <button onClick={() => handleDeleteRule(rule)}
                                  className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
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

      {/* Create Rule Modal */}
      {showRuleForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Create Alert Rule</h2>
              <button onClick={() => setShowRuleForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alert Name *</label>
                <input type="text" value={ruleForm.alert_name}
                  onChange={(e) => setRuleForm(f => ({ ...f, alert_name: e.target.value }))}
                  placeholder="e.g., High Failure Rate Alert"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alert Type *</label>
                  <select value={ruleForm.alert_type}
                    onChange={(e) => setRuleForm(f => ({ ...f, alert_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select type...</option>
                    {alertTypes.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {ruleForm.alert_type && (
                    <p className="text-xs text-gray-400 mt-1">
                      {alertTypes.find(t => t.value === ruleForm.alert_type)?.description}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Severity *</label>
                  <select value={ruleForm.severity}
                    onChange={(e) => setRuleForm(f => ({ ...f, severity: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {severities.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Threshold Value</label>
                <input type="number" value={ruleForm.threshold}
                  onChange={(e) => setRuleForm(f => ({ ...f, threshold: e.target.value }))}
                  placeholder="e.g., 85 for success rate %, 5000 for latency ms"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gateway Filter</label>
                  <select value={ruleForm.gateway_filter}
                    onChange={(e) => setRuleForm(f => ({ ...f, gateway_filter: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">All Gateways</option>
                    {['Razorpay', 'Stripe', 'PayU', 'PhonePe', 'Paytm', 'Cashfree'].map(gw => (
                      <option key={gw} value={gw}>{gw}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select value={ruleForm.payment_method_filter}
                    onChange={(e) => setRuleForm(f => ({ ...f, payment_method_filter: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">All Methods</option>
                    {['CARD', 'UPI', 'NETBANKING', 'WALLET', 'EMI'].map(pm => (
                      <option key={pm} value={pm}>{pm}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notification Channels</label>
                <div className="flex flex-wrap gap-2">
                  {channels.map(ch => (
                    <label key={ch} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs ${
                      ruleForm.channels.includes(ch)
                        ? 'border-primary-300 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500'
                    }`}>
                      <input type="checkbox" checked={ruleForm.channels.includes(ch)}
                        onChange={() => toggleChannel(ch)} className="hidden" />
                      {ch}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cooldown (minutes)</label>
                <input type="number" value={ruleForm.cooldown_minutes}
                  onChange={(e) => setRuleForm(f => ({ ...f, cooldown_minutes: parseInt(e.target.value) || 15 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-gray-400 mt-1">Minimum time between repeated alerts for the same rule</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={ruleForm.description}
                  onChange={(e) => setRuleForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowRuleForm(false)}
                  className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
                <button onClick={handleCreateRule} disabled={ruleSaving || !ruleForm.alert_name || !ruleForm.alert_type}
                  className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  <Save size={16} /> {ruleSaving ? 'Creating...' : 'Create Rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, rule: null })}
        onConfirm={confirmDelete}
        title="Delete Alert Rule"
        message={`Are you sure you want to delete "${deleteConfirm.rule?.alert_name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
