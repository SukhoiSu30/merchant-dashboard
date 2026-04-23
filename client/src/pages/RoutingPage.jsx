import { useState, useEffect } from 'react';
import { routingAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CardSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';
import {
  RefreshCw, ArrowUpDown, Plus, X, Save, AlertTriangle, CheckCircle,
  XCircle, Shield, Activity, Clock, Zap, ToggleLeft, ToggleRight,
  GripVertical, ChevronDown, ChevronUp
} from 'lucide-react';

function HealthBadge({ status }) {
  const styles = {
    HEALTHY: 'bg-success-50 text-success-600 border-success-200',
    DEGRADED: 'bg-warning-50 text-warning-600 border-warning-200',
    DOWN: 'bg-danger-50 text-danger-600 border-danger-200',
  };
  const icons = {
    HEALTHY: <CheckCircle size={12} />,
    DEGRADED: <AlertTriangle size={12} />,
    DOWN: <XCircle size={12} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${styles[status] || styles.DOWN}`}>
      {icons[status]} {status}
    </span>
  );
}

export default function RoutingPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('gateways', 'READ_WRITE');
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('health');
  const [loading, setLoading] = useState(true);
  const [resolveConfirm, setResolveConfirm] = useState({ open: false, outageId: null, gatewayId: null });

  // Health
  const [health, setHealth] = useState([]);

  // Priority
  const [priorityData, setPriorityData] = useState(null);
  const [editingPriorities, setEditingPriorities] = useState(false);
  const [priorities, setPriorities] = useState([]);

  // Priority Logic (per payment method)
  const [priorityLogic, setPriorityLogic] = useState({});
  const [editingLogic, setEditingLogic] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('CARD');

  // Routing rules
  const [rules, setRules] = useState([]);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    rule_name: '', condition_type: 'PAYMENT_METHOD', condition_value: '',
    target_gateway: '', action: 'ROUTE', priority: 10,
  });
  const [ruleSaving, setRuleSaving] = useState(false);

  // Smart routing
  const [smartConfig, setSmartConfig] = useState(null);

  // Outages
  const [outageData, setOutageData] = useState(null);
  const [showOutageForm, setShowOutageForm] = useState(false);
  const [outageForm, setOutageForm] = useState({ gateway_id: '', reason: '', payment_methods: [] });
  const [outageSaving, setOutageSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'health') {
        const { data } = await routingAPI.health();
        setHealth(data.health);
      } else if (activeTab === 'priority-logic') {
        const { data } = await routingAPI.priority();
        // Build priority logic per payment method from gateway data
        const logic = {};
        PAYMENT_METHODS.forEach(pm => {
          logic[pm] = data.gateways
            .filter(g => {
              const methods = Array.isArray(g.payment_methods) ? g.payment_methods : JSON.parse(g.payment_methods || '[]');
              return methods.includes(pm);
            })
            .sort((a, b) => a.priority - b.priority)
            .map((g, i) => ({ gateway_id: g.id, gateway_name: g.gateway_name, priority: i + 1, enabled: g.is_active }));
          // If no gateways match, show all gateways as options
          if (logic[pm].length === 0) {
            logic[pm] = data.gateways.sort((a, b) => a.priority - b.priority)
              .map((g, i) => ({ gateway_id: g.id, gateway_name: g.gateway_name, priority: i + 1, enabled: g.is_active }));
          }
        });
        setPriorityLogic(logic);
      } else if (activeTab === 'priority' || activeTab === 'rules' || activeTab === 'smart') {
        const { data } = await routingAPI.priority();
        setPriorityData(data);
        setPriorities(data.gateways.map(g => ({ gateway_id: g.id, gateway_name: g.gateway_name, priority: g.priority })));
        setRules(data.rules);
        setSmartConfig(data.smart_routing);
      } else if (activeTab === 'outages') {
        const { data } = await routingAPI.outages();
        setOutageData(data);
      }
    } catch (err) { toast.error('Failed to load routing data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  const handleSavePriorities = async () => {
    try {
      await routingAPI.updatePriority({ priorities });
      toast.success('Gateway priorities updated');
      setEditingPriorities(false);
      fetchData();
    } catch (err) { toast.error('Failed to update priorities'); }
  };

  const movePriority = (idx, dir) => {
    const newPriorities = [...priorities];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= newPriorities.length) return;
    [newPriorities[idx], newPriorities[swapIdx]] = [newPriorities[swapIdx], newPriorities[idx]];
    newPriorities.forEach((p, i) => { p.priority = i + 1; });
    setPriorities(newPriorities);
  };

  const handleCreateRule = async () => {
    if (!ruleForm.rule_name || !ruleForm.target_gateway) return;
    setRuleSaving(true);
    try {
      await routingAPI.createRule(ruleForm);
      toast.success('Routing rule created successfully');
      setShowRuleForm(false);
      setRuleForm({ rule_name: '', condition_type: 'PAYMENT_METHOD', condition_value: '', target_gateway: '', action: 'ROUTE', priority: 10 });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to create rule'); }
    finally { setRuleSaving(false); }
  };

  const handleSaveSmartRouting = async () => {
    try {
      await routingAPI.updateSmart(smartConfig);
      toast.success('Smart routing updated successfully');
    } catch (err) { toast.error('Failed to update smart routing'); }
  };

  const handleCreateOutage = async () => {
    if (!outageForm.gateway_id) return;
    setOutageSaving(true);
    try {
      await routingAPI.createOutage(outageForm);
      toast.success('Outage reported successfully');
      setShowOutageForm(false);
      setOutageForm({ gateway_id: '', reason: '', payment_methods: [] });
      fetchData();
    } catch (err) { toast.error('Failed to report outage'); }
    finally { setOutageSaving(false); }
  };

  const handleResolveOutage = async (outageId, gatewayId) => {
    setResolveConfirm({ open: true, outageId, gatewayId });
  };

  const confirmResolveOutage = async () => {
    try {
      await routingAPI.resolveOutage(resolveConfirm.outageId, { gateway_id: resolveConfirm.gatewayId });
      toast.success('Outage resolved successfully');
      setResolveConfirm({ open: false, outageId: null, gatewayId: null });
      fetchData();
    } catch (err) { toast.error('Failed to resolve outage'); }
  };

  const CONDITION_TYPES = [
    { value: 'PAYMENT_METHOD', label: 'Payment Method' },
    { value: 'AMOUNT_ABOVE', label: 'Amount Above' },
    { value: 'AMOUNT_BELOW', label: 'Amount Below' },
    { value: 'CURRENCY', label: 'Currency' },
    { value: 'CARD_BRAND', label: 'Card Brand' },
    { value: 'ISSUER_BANK', label: 'Issuer Bank' },
  ];

  const GATEWAYS = ['Razorpay', 'Stripe', 'PayU', 'PhonePe', 'Paytm', 'Cashfree'];
  const PAYMENT_METHODS = ['CARD', 'UPI', 'NETBANKING', 'WALLET', 'EMI', 'BNPL'];

  const tabs = [
    { id: 'health', label: 'Gateway Health', icon: Activity },
    { id: 'priority', label: 'Priority', icon: ArrowUpDown },
    { id: 'priority-logic', label: 'Priority Logic', icon: Shield },
    { id: 'rules', label: 'Routing Rules', icon: Shield },
    { id: 'smart', label: 'Smart Routing', icon: Zap },
    { id: 'outages', label: 'Outages', icon: AlertTriangle },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Routing & Outage Management</h1>
          <p className="text-gray-500 text-sm mt-1">Gateway routing, priority, and outage configuration</p>
        </div>
        <button onClick={fetchData} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={18} /></button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 mb-4">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : (
            <>
              {/* Gateway Health */}
              {activeTab === 'health' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">Real-time gateway performance overview</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {health.map(gw => (
                      <div key={gw.gateway_id} className={`border rounded-xl p-4 ${
                        gw.status === 'HEALTHY' ? 'border-success-200 bg-success-50/30' :
                        gw.status === 'DEGRADED' ? 'border-warning-200 bg-warning-50/30' :
                        'border-danger-200 bg-danger-50/30'
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Zap size={18} className={gw.status === 'DOWN' ? 'text-danger-500' : 'text-primary-500'} />
                            <h3 className="font-semibold text-gray-900">{gw.gateway_name}</h3>
                          </div>
                          <HealthBadge status={gw.status} />
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <p className="text-lg font-bold text-gray-900">{gw.success_rate}%</p>
                            <p className="text-xs text-gray-500">Success</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-gray-900">{gw.avg_latency_ms}ms</p>
                            <p className="text-xs text-gray-500">Latency</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-gray-900">{gw.txn_per_minute}</p>
                            <p className="text-xs text-gray-500">Txn/min</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Priority: #{gw.priority}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Priority Config */}
              {activeTab === 'priority' && (
                <div className="space-y-4 max-w-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Drag gateways to reorder priority (top = highest)</p>
                    {canWrite && !editingPriorities && (
                      <button onClick={() => setEditingPriorities(true)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                        Edit Priorities
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {priorities.map((gw, idx) => (
                      <div key={gw.gateway_id}
                        className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                        {editingPriorities && (
                          <div className="flex flex-col">
                            <button onClick={() => movePriority(idx, -1)} disabled={idx === 0}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={16} /></button>
                            <button onClick={() => movePriority(idx, 1)} disabled={idx === priorities.length - 1}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-20"><ChevronDown size={16} /></button>
                          </div>
                        )}
                        <span className="w-8 h-8 bg-primary-50 text-primary-600 rounded-lg flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </span>
                        <span className="flex-1 font-medium text-gray-900">{gw.gateway_name}</span>
                        <span className="text-xs text-gray-400">Priority #{gw.priority}</span>
                      </div>
                    ))}
                  </div>

                  {editingPriorities && (
                    <div className="flex gap-3">
                      <button onClick={() => { setEditingPriorities(false); fetchData(); }}
                        className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
                      <button onClick={handleSavePriorities}
                        className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 flex items-center justify-center gap-2">
                        <Save size={16} /> Save Order
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Priority Logic — per payment method gateway ordering */}
              {activeTab === 'priority-logic' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">Configure gateway priority per payment method. When a transaction comes in, gateways are tried in this order for the specific payment method.</p>

                  {/* Payment Method Tabs */}
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_METHODS.map(pm => (
                      <button key={pm} onClick={() => setSelectedMethod(pm)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          selectedMethod === pm
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {pm}
                      </button>
                    ))}
                  </div>

                  {/* Gateway Priority List for Selected Method */}
                  <div className="bg-gray-50 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Gateway Priority for {selectedMethod}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Top gateway gets first attempt. If it fails, next in line is tried.</p>
                      </div>
                      {canWrite && !editingLogic && (
                        <button onClick={() => setEditingLogic(true)}
                          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                          Edit Order
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {(priorityLogic[selectedMethod] || []).map((gw, idx) => (
                        <div key={gw.gateway_id}
                          className={`flex items-center gap-3 p-3 bg-white border rounded-lg ${gw.enabled ? 'border-gray-200' : 'border-gray-200 opacity-50'}`}>
                          {editingLogic && (
                            <div className="flex flex-col">
                              <button onClick={() => {
                                const logic = { ...priorityLogic };
                                const list = [...logic[selectedMethod]];
                                if (idx > 0) { [list[idx], list[idx - 1]] = [list[idx - 1], list[idx]]; }
                                list.forEach((g, i) => { g.priority = i + 1; });
                                logic[selectedMethod] = list;
                                setPriorityLogic(logic);
                              }} disabled={idx === 0}
                                className="text-gray-400 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={16} /></button>
                              <button onClick={() => {
                                const logic = { ...priorityLogic };
                                const list = [...logic[selectedMethod]];
                                if (idx < list.length - 1) { [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]]; }
                                list.forEach((g, i) => { g.priority = i + 1; });
                                logic[selectedMethod] = list;
                                setPriorityLogic(logic);
                              }} disabled={idx === (priorityLogic[selectedMethod] || []).length - 1}
                                className="text-gray-400 hover:text-gray-600 disabled:opacity-20"><ChevronDown size={16} /></button>
                            </div>
                          )}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                            idx === 0 ? 'bg-success-50 text-success-600' :
                            idx === 1 ? 'bg-blue-50 text-blue-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <span className="font-medium text-gray-900">{gw.gateway_name}</span>
                            {idx === 0 && <span className="ml-2 text-xs px-2 py-0.5 bg-success-50 text-success-600 rounded">Primary</span>}
                            {idx === 1 && <span className="ml-2 text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">Fallback</span>}
                          </div>
                          <span className={`text-xs ${gw.enabled ? 'text-success-500' : 'text-gray-400'}`}>
                            {gw.enabled ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {editingLogic && (
                      <div className="flex gap-3 mt-4">
                        <button onClick={() => { setEditingLogic(false); fetchData(); }}
                          className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
                        <button onClick={() => { setEditingLogic(false); toast.success(`Priority order saved for ${selectedMethod}`); }}
                          className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 flex items-center justify-center gap-2">
                          <Save size={16} /> Save Priority
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Summary Table */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900">Priority Summary — All Payment Methods</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-2">Payment Method</th>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-2">1st Priority</th>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-2">2nd Priority</th>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-2">3rd Priority</th>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-2">Others</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {PAYMENT_METHODS.map(pm => {
                            const gws = priorityLogic[pm] || [];
                            return (
                              <tr key={pm} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedMethod(pm)}>
                                <td className="px-5 py-2.5">
                                  <span className={`text-sm font-medium ${selectedMethod === pm ? 'text-primary-600' : 'text-gray-900'}`}>{pm}</span>
                                </td>
                                <td className="px-5 py-2.5 text-sm">
                                  {gws[0] ? <span className="px-2 py-0.5 bg-success-50 text-success-700 rounded text-xs">{gws[0].gateway_name}</span> : '—'}
                                </td>
                                <td className="px-5 py-2.5 text-sm">
                                  {gws[1] ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{gws[1].gateway_name}</span> : '—'}
                                </td>
                                <td className="px-5 py-2.5 text-sm">
                                  {gws[2] ? <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{gws[2].gateway_name}</span> : '—'}
                                </td>
                                <td className="px-5 py-2.5 text-sm text-gray-400">
                                  {gws.length > 3 ? `+${gws.length - 3} more` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Routing Rules */}
              {activeTab === 'rules' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Conditional routing rules</p>
                    {canWrite && (
                      <button onClick={() => setShowRuleForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                        <Plus size={16} /> Add Rule
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {rules.length === 0 ? (
                      <EmptyState icon="shield" title="No routing rules" message="No routing rules configured" />
                    ) : (
                      rules.map(rule => (
                        <div key={rule.id} className={`border rounded-lg p-4 ${rule.is_active ? 'border-gray-200' : 'border-gray-200 opacity-50'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">#{rule.priority}</span>
                                <p className="text-sm font-medium text-gray-900">{rule.rule_name}</p>
                                <span className={`badge ${rule.is_active ? 'badge-success' : 'badge-gray'}`}>
                                  {rule.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                When <span className="font-medium">{rule.condition_type.replace(/_/g, ' ').toLowerCase()}</span>
                                {rule.condition_value && <> = <span className="font-mono">{rule.condition_value}</span></>}
                                {' → '}
                                <span className="font-medium">{rule.action}</span> to <span className="text-primary-600">{rule.target_gateway}</span>
                              </p>
                            </div>
                            <span className="text-xs text-gray-400 font-mono">{rule.rule_id}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Rule Form Modal */}
                  {showRuleForm && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between p-5 border-b border-gray-200">
                          <h2 className="text-lg font-semibold">New Routing Rule</h2>
                          <button onClick={() => setShowRuleForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name *</label>
                            <input type="text" value={ruleForm.rule_name}
                              onChange={(e) => setRuleForm(f => ({ ...f, rule_name: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Condition *</label>
                              <select value={ruleForm.condition_type}
                                onChange={(e) => setRuleForm(f => ({ ...f, condition_type: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                {CONDITION_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                              <input type="text" value={ruleForm.condition_value}
                                onChange={(e) => setRuleForm(f => ({ ...f, condition_value: e.target.value }))}
                                placeholder="e.g., UPI, 10000"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Target Gateway *</label>
                              <select value={ruleForm.target_gateway}
                                onChange={(e) => setRuleForm(f => ({ ...f, target_gateway: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                <option value="">Select...</option>
                                {GATEWAYS.map(gw => <option key={gw} value={gw}>{gw}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                              <select value={ruleForm.action}
                                onChange={(e) => setRuleForm(f => ({ ...f, action: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                <option value="ROUTE">Route</option>
                                <option value="FALLBACK">Fallback</option>
                                <option value="BLOCK">Block</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setShowRuleForm(false)}
                              className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
                            <button onClick={handleCreateRule} disabled={ruleSaving}
                              className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                              {ruleSaving ? 'Creating...' : 'Create Rule'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Smart Routing */}
              {activeTab === 'smart' && smartConfig && (
                <div className="max-w-lg space-y-4">
                  <p className="text-sm text-gray-500">AI-powered routing based on real-time performance</p>

                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Smart Routing</p>
                      <p className="text-xs text-gray-500">Automatically route transactions to best-performing gateway</p>
                    </div>
                    <button onClick={() => canWrite && setSmartConfig(c => ({ ...c, enabled: !c.enabled }))} disabled={!canWrite}>
                      {smartConfig.enabled
                        ? <ToggleRight size={28} className="text-success-500" />
                        : <ToggleLeft size={28} className="text-gray-300" />
                      }
                    </button>
                  </label>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Algorithm</label>
                    <select value={smartConfig.algorithm}
                      onChange={(e) => setSmartConfig(c => ({ ...c, algorithm: e.target.value }))}
                      disabled={!canWrite} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50">
                      <option value="SUCCESS_RATE_WEIGHTED">Success Rate Weighted</option>
                      <option value="LATENCY_OPTIMIZED">Latency Optimized</option>
                      <option value="COST_OPTIMIZED">Cost Optimized</option>
                      <option value="ROUND_ROBIN">Round Robin</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Min Success Rate (%)</label>
                      <input type="number" value={smartConfig.min_success_rate}
                        onChange={(e) => setSmartConfig(c => ({ ...c, min_success_rate: parseInt(e.target.value) }))}
                        disabled={!canWrite} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Lookback Window</label>
                      <select value={smartConfig.lookback_window}
                        onChange={(e) => setSmartConfig(c => ({ ...c, lookback_window: e.target.value }))}
                        disabled={!canWrite} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50">
                        <option value="5m">5 minutes</option>
                        <option value="15m">15 minutes</option>
                        <option value="30m">30 minutes</option>
                        <option value="1h">1 hour</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Auto Fallback</p>
                      <p className="text-xs text-gray-500">Route to next gateway if primary fails</p>
                    </div>
                    <button onClick={() => canWrite && setSmartConfig(c => ({ ...c, fallback_enabled: !c.fallback_enabled }))} disabled={!canWrite}>
                      {smartConfig.fallback_enabled
                        ? <ToggleRight size={28} className="text-success-500" />
                        : <ToggleLeft size={28} className="text-gray-300" />
                      }
                    </button>
                  </label>

                  {canWrite && (
                    <button onClick={handleSaveSmartRouting}
                      className="w-full py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 flex items-center justify-center gap-2">
                      <Save size={16} /> Save Smart Routing Config
                    </button>
                  )}
                </div>
              )}

              {/* Outages */}
              {activeTab === 'outages' && outageData && (
                <div className="space-y-4">
                  {/* Health Summary */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold">{outageData.health_summary.total_gateways}</p>
                      <p className="text-xs text-gray-500">Total</p>
                    </div>
                    <div className="bg-success-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-success-600">{outageData.health_summary.healthy}</p>
                      <p className="text-xs text-success-600">Healthy</p>
                    </div>
                    <div className="bg-warning-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-warning-600">{outageData.health_summary.degraded}</p>
                      <p className="text-xs text-warning-600">Degraded</p>
                    </div>
                    <div className="bg-danger-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-danger-600">{outageData.health_summary.down}</p>
                      <p className="text-xs text-danger-600">Down</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Active Outages</h3>
                    {canWrite && (
                      <button onClick={() => setShowOutageForm(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-danger-600 text-white rounded-lg text-xs hover:bg-danger-700">
                        <AlertTriangle size={14} /> Report Outage
                      </button>
                    )}
                  </div>

                  {outageData.active_outages.length === 0 ? (
                    <div className="text-center py-8 bg-success-50 rounded-lg">
                      <CheckCircle size={32} className="mx-auto text-success-400 mb-2" />
                      <p className="text-success-600 font-medium">All gateways operational</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {outageData.active_outages.map(o => (
                        <div key={o.id} className="border border-danger-200 bg-danger-50 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-danger-700">{o.gateway_name}</p>
                              <p className="text-sm text-danger-600">{o.reason}</p>
                              <p className="text-xs text-danger-500 mt-1">Since {new Date(o.started_at).toLocaleString()}</p>
                            </div>
                            {canWrite && (
                              <button onClick={() => handleResolveOutage(o.id, o.gateway_id)}
                                className="px-3 py-1.5 bg-success-600 text-white rounded-lg text-xs hover:bg-success-700">
                                Mark Resolved
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recent Outages */}
                  {outageData.recent_outages.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Recent Outages</h3>
                      <div className="space-y-2">
                        {outageData.recent_outages.map(o => (
                          <div key={o.id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{o.gateway_name}</span>
                                <span className="badge badge-success text-xs">Resolved</span>
                              </div>
                              <p className="text-xs text-gray-500">{o.reason}</p>
                              <p className="text-xs text-gray-400">Duration: {o.duration_minutes} min — {o.impact}</p>
                            </div>
                            <span className="text-xs text-gray-400">{new Date(o.resolved_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Outage Form Modal */}
                  {showOutageForm && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between p-5 border-b border-gray-200">
                          <h2 className="text-lg font-semibold">Report Gateway Outage</h2>
                          <button onClick={() => setShowOutageForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Gateway *</label>
                            <select value={outageForm.gateway_id}
                              onChange={(e) => setOutageForm(f => ({ ...f, gateway_id: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                              <option value="">Select gateway...</option>
                              {outageData.gateways.filter(g => g.is_active).map(g => (
                                <option key={g.id} value={g.id}>{g.gateway_name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                            <textarea value={outageForm.reason}
                              onChange={(e) => setOutageForm(f => ({ ...f, reason: e.target.value }))}
                              placeholder="Describe the outage..."
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Affected Payment Methods</label>
                            <div className="flex flex-wrap gap-2">
                              {PAYMENT_METHODS.map(pm => (
                                <label key={pm} className="flex items-center gap-1.5 text-xs">
                                  <input type="checkbox" checked={outageForm.payment_methods.includes(pm)}
                                    onChange={(e) => {
                                      setOutageForm(f => ({
                                        ...f,
                                        payment_methods: e.target.checked
                                          ? [...f.payment_methods, pm]
                                          : f.payment_methods.filter(p => p !== pm),
                                      }));
                                    }} className="rounded" />
                                  {pm}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="bg-warning-50 border border-warning-200 rounded-lg p-3">
                            <p className="text-xs text-warning-700">This will deactivate the gateway and reroute traffic to the next priority gateway.</p>
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setShowOutageForm(false)}
                              className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
                            <button onClick={handleCreateOutage} disabled={outageSaving || !outageForm.gateway_id}
                              className="flex-1 py-2 bg-danger-600 text-white rounded-lg text-sm hover:bg-danger-700 disabled:opacity-50">
                              {outageSaving ? 'Reporting...' : 'Report Outage'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Resolve Outage Confirm Modal */}
      <ConfirmModal
        open={resolveConfirm.open}
        onClose={() => setResolveConfirm({ open: false, outageId: null, gatewayId: null })}
        onConfirm={confirmResolveOutage}
        title="Mark Outage as Resolved"
        message="Are you sure you want to mark this outage as resolved? Traffic will be rerouted to this gateway."
        confirmText="Mark Resolved"
        cancelText="Cancel"
        variant="primary"
      />
    </div>
  );
}
