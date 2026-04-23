import { useState, useEffect } from 'react';
import { surchargeAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { TableSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';
import {
  Plus, Trash2, Edit3, X, Save, RefreshCw, Calculator,
  ToggleLeft, ToggleRight, Percent, DollarSign
} from 'lucide-react';

const PAYMENT_METHODS = ['CARD', 'UPI', 'NETBANKING', 'WALLET', 'EMI', 'BNPL'];
const GATEWAYS = ['Razorpay', 'Stripe', 'PayU', 'PhonePe', 'Paytm', 'Cashfree'];

export default function SurchargePage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('gateways', 'READ_WRITE');
  const toast = useToast();

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, rule: null });

  // Create/Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState({
    rule_name: '', payment_method: '', gateway_name: '',
    surcharge_type: 'PERCENTAGE', surcharge_value: '',
    min_surcharge: '', max_surcharge: '',
    min_txn_amount: '', max_txn_amount: '', priority: 10,
  });
  const [saving, setSaving] = useState(false);

  // Calculator
  const [showCalc, setShowCalc] = useState(false);
  const [calcAmount, setCalcAmount] = useState('1000');
  const [calcMethod, setCalcMethod] = useState('');
  const [calcGateway, setCalcGateway] = useState('');
  const [calcResult, setCalcResult] = useState(null);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const { data } = await surchargeAPI.list();
      setRules(data.rules);
    } catch (err) { toast.error('Failed to load surcharge rules'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRules(); }, []);

  const openCreate = () => {
    setEditingRule(null);
    setForm({
      rule_name: '', payment_method: '', gateway_name: '',
      surcharge_type: 'PERCENTAGE', surcharge_value: '',
      min_surcharge: '', max_surcharge: '',
      min_txn_amount: '', max_txn_amount: '', priority: 10,
    });
    setShowForm(true);
  };

  const openEdit = (rule) => {
    setEditingRule(rule);
    setForm({
      rule_name: rule.rule_name,
      payment_method: rule.payment_method || '',
      gateway_name: rule.gateway_name || '',
      surcharge_type: rule.surcharge_type,
      surcharge_value: String(rule.surcharge_value),
      min_surcharge: rule.min_surcharge ? String(rule.min_surcharge) : '',
      max_surcharge: rule.max_surcharge ? String(rule.max_surcharge) : '',
      min_txn_amount: rule.min_txn_amount ? String(rule.min_txn_amount) : '',
      max_txn_amount: rule.max_txn_amount ? String(rule.max_txn_amount) : '',
      priority: rule.priority || 10,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.rule_name || !form.surcharge_value) return;
    setSaving(true);
    try {
      if (editingRule) {
        await surchargeAPI.update(editingRule.id, form);
        toast.success('Rule updated successfully');
      } else {
        await surchargeAPI.create(form);
        toast.success('Rule created successfully');
      }
      setShowForm(false);
      fetchRules();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save rule'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (rule) => {
    setDeleteConfirm({ open: true, rule });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.rule) return;
    try {
      await surchargeAPI.delete(deleteConfirm.rule.id);
      toast.success('Rule deleted successfully');
      setDeleteConfirm({ open: false, rule: null });
      fetchRules();
    } catch (err) { toast.error('Failed to delete rule'); }
  };

  const handleCalculate = async () => {
    try {
      const { data } = await surchargeAPI.calculate({
        amount: calcAmount,
        payment_method: calcMethod || undefined,
        gateway: calcGateway || undefined,
      });
      setCalcResult(data);
    } catch (err) { toast.error('Failed to calculate surcharge'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Surcharge Configuration</h1>
          <p className="text-gray-500 text-sm mt-1">Manage surcharge rules per payment method and gateway</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCalc(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
            <Calculator size={16} /> Calculator
          </button>
          {canWrite && (
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
              <Plus size={16} /> Add Rule
            </button>
          )}
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Priority</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Rule Name</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Payment Method</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Gateway</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Surcharge</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Min / Max</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Txn Range</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Status</th>
                {canWrite && <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <TableSkeleton rows={5} cols={9} />
              ) : rules.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12"><EmptyState icon="payment" title="No surcharge rules" message="No surcharge rules configured" /></td></tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className={`hover:bg-gray-50 ${!rule.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3 text-sm font-medium text-gray-500">#{rule.priority}</td>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-900">{rule.rule_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{rule.rule_id}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                        {rule.payment_method || 'All'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{rule.gateway_name || 'All'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        {rule.surcharge_type === 'PERCENTAGE'
                          ? <><Percent size={14} className="text-primary-500" /><span className="text-sm font-semibold">{rule.surcharge_value}%</span></>
                          : <><span className="text-sm font-semibold">₹{rule.surcharge_value}</span><span className="text-xs text-gray-400">flat</span></>
                        }
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {rule.min_surcharge || rule.max_surcharge ? (
                        <span>₹{rule.min_surcharge || '0'} — ₹{rule.max_surcharge || '∞'}</span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {rule.min_txn_amount || rule.max_txn_amount ? (
                        <span>₹{rule.min_txn_amount || '0'} — ₹{rule.max_txn_amount || '∞'}</span>
                      ) : 'Any'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`badge ${rule.is_active ? 'badge-success' : 'badge-gray'}`}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(rule)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded">
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => handleDelete(rule)} className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold">{editingRule ? 'Edit Rule' : 'New Surcharge Rule'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name *</label>
                <input type="text" value={form.rule_name} onChange={(e) => setForm(f => ({ ...f, rule_name: e.target.value }))}
                  placeholder="e.g., Credit Card Surcharge" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select value={form.payment_method} onChange={(e) => setForm(f => ({ ...f, payment_method: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">All Methods</option>
                    {PAYMENT_METHODS.map(pm => <option key={pm} value={pm}>{pm}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gateway</label>
                  <select value={form.gateway_name} onChange={(e) => setForm(f => ({ ...f, gateway_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">All Gateways</option>
                    {GATEWAYS.map(gw => <option key={gw} value={gw}>{gw}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Surcharge Type *</label>
                  <select value={form.surcharge_type} onChange={(e) => setForm(f => ({ ...f, surcharge_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FLAT">Flat Amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Value *</label>
                  <input type="number" step="0.01" value={form.surcharge_value}
                    onChange={(e) => setForm(f => ({ ...f, surcharge_value: e.target.value }))}
                    placeholder={form.surcharge_type === 'PERCENTAGE' ? 'e.g., 2.5' : 'e.g., 10'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Surcharge (₹)</label>
                  <input type="number" step="0.01" value={form.min_surcharge}
                    onChange={(e) => setForm(f => ({ ...f, min_surcharge: e.target.value }))}
                    placeholder="Optional" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Surcharge (₹)</label>
                  <input type="number" step="0.01" value={form.max_surcharge}
                    onChange={(e) => setForm(f => ({ ...f, max_surcharge: e.target.value }))}
                    placeholder="Optional" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Txn Amount (₹)</label>
                  <input type="number" step="0.01" value={form.min_txn_amount}
                    onChange={(e) => setForm(f => ({ ...f, min_txn_amount: e.target.value }))}
                    placeholder="Optional" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Txn Amount (₹)</label>
                  <input type="number" step="0.01" value={form.max_txn_amount}
                    onChange={(e) => setForm(f => ({ ...f, max_txn_amount: e.target.value }))}
                    placeholder="Optional" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input type="number" value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 10 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-gray-400 mt-1">Lower number = higher priority</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={handleSave} disabled={saving || !form.rule_name || !form.surcharge_value}
                  className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  <Save size={16} /> {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calculator Modal */}
      {showCalc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Calculator size={20} className="text-primary-600" /> Surcharge Calculator</h2>
              <button onClick={() => { setShowCalc(false); setCalcResult(null); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Amount (₹)</label>
                <input type="number" value={calcAmount} onChange={(e) => setCalcAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select value={calcMethod} onChange={(e) => setCalcMethod(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Any</option>
                    {PAYMENT_METHODS.map(pm => <option key={pm} value={pm}>{pm}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gateway</label>
                  <select value={calcGateway} onChange={(e) => setCalcGateway(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Any</option>
                    {GATEWAYS.map(gw => <option key={gw} value={gw}>{gw}</option>)}
                  </select>
                </div>
              </div>

              <button onClick={handleCalculate}
                className="w-full py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                Calculate Surcharge
              </button>

              {calcResult && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Base Amount</span>
                    <span className="text-sm font-medium">₹{calcResult.base_amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Surcharge</span>
                    <span className="text-sm font-medium text-primary-600">+ ₹{calcResult.surcharge_amount.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between">
                    <span className="text-sm font-semibold">Total</span>
                    <span className="text-sm font-bold">���{calcResult.total_amount.toLocaleString()}</span>
                  </div>
                  {calcResult.rule_applied && (
                    <p className="text-xs text-gray-500 mt-1">
                      Rule: {calcResult.rule_applied.rule_name} ({calcResult.rule_applied.type === 'PERCENTAGE' ? `${calcResult.rule_applied.value}%` : `₹${calcResult.rule_applied.value}`})
                    </p>
                  )}
                  {!calcResult.rule_applied && (
                    <p className="text-xs text-gray-400 mt-1">No matching surcharge rule found</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, rule: null })}
        onConfirm={confirmDelete}
        title="Delete Surcharge Rule"
        message={`Are you sure you want to delete "${deleteConfirm.rule?.rule_name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
