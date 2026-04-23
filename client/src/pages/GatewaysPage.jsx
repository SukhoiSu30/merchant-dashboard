import { useState, useEffect } from 'react';
import { gatewaysAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { RefreshCw, Zap, ToggleLeft, ToggleRight, Eye, X, TrendingUp, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useToast } from '../context/ToastContext';
import { CardSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function GatewaysPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission('gateways', 'READ_WRITE');
  const [gateways, setGateways] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGw, setSelectedGw] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ open: false, gatewayId: null, gatewayName: '', isActive: false, loading: false });

  const fetchGateways = async () => {
    setLoading(true);
    try {
      const { data } = await gatewaysAPI.list();
      setGateways(data.gateways);
    } catch (err) { toast.error('Failed to load gateways'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchGateways(); }, []);

  const handleToggle = (gw) => {
    setConfirmModal({
      open: true,
      gatewayId: gw.id,
      gatewayName: gw.gateway_name,
      isActive: gw.is_active,
      loading: false
    });
  };

  const handleConfirmToggle = async () => {
    setConfirmModal({ ...confirmModal, loading: true });
    try {
      await gatewaysAPI.toggle(confirmModal.gatewayId);
      toast.success('Gateway status updated');
      fetchGateways();
      setConfirmModal({ open: false, gatewayId: null, gatewayName: '', isActive: false, loading: false });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update gateway status');
      setConfirmModal({ ...confirmModal, loading: false });
    }
  };

  const openDetail = async (gw) => {
    setSelectedGw(gw);
    setDetailLoading(true);
    try {
      const { data } = await gatewaysAPI.get(gw.id);
      setDetailData(data);
    } catch (err) { toast.error('Failed to load gateway details'); }
    finally { setDetailLoading(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gateway Configuration</h1>
          <p className="text-gray-500 text-sm mt-1">PG Control Centre — manage payment gateways</p>
        </div>
        <button onClick={fetchGateways} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={18} /></button>
      </div>

      {loading ? (
        <CardSkeleton count={6} />
      ) : gateways.length === 0 ? (
        <EmptyState icon="alert" title="No gateways configured" description="Configure payment gateways to accept payments" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gateways.map((gw) => (
            <div key={gw.id} className={`bg-white rounded-xl border ${gw.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'} p-5 hover:shadow-md transition-shadow`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${gw.is_active ? 'bg-primary-50' : 'bg-gray-100'}`}>
                    <Zap size={20} className={gw.is_active ? 'text-primary-600' : 'text-gray-400'} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{gw.gateway_name}</h3>
                    <p className="text-xs text-gray-500">Priority: {gw.priority}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canWrite && (
                    <button onClick={() => handleToggle(gw)} title={gw.is_active ? 'Deactivate' : 'Activate'}>
                      {gw.is_active
                        ? <ToggleRight size={24} className="text-success-500" />
                        : <ToggleLeft size={24} className="text-gray-300" />
                      }
                    </button>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{parseInt(gw.stats.total_txns).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Txns (30d)</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-success-600">{gw.stats.success_rate || 0}%</p>
                  <p className="text-xs text-gray-500">Success</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">₹{(parseFloat(gw.stats.total_volume || 0) / 1000).toFixed(0)}k</p>
                  <p className="text-xs text-gray-500">Volume</p>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">Payment Methods</p>
                <div className="flex flex-wrap gap-1">
                  {(Array.isArray(gw.payment_methods) ? gw.payment_methods : JSON.parse(gw.payment_methods || '[]')).map((pm) => (
                    <span key={pm} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{pm}</span>
                  ))}
                </div>
              </div>

              <button onClick={() => openDetail(gw)}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                <Eye size={14} /> View Performance
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedGw && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <Zap size={20} className="text-primary-600" />
                <div>
                  <h2 className="text-lg font-semibold">{selectedGw.gateway_name} — Performance</h2>
                  <p className="text-sm text-gray-500">Last 30 days</p>
                </div>
              </div>
              <button onClick={() => { setSelectedGw(null); setDetailData(null); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div className="p-8 text-center text-gray-500">Loading performance data...</div>
            ) : detailData && (
              <div className="p-5 space-y-6">
                {/* Success Rate Trend */}
                {detailData.performance.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp size={16} /> Success Rate Trend</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={detailData.performance}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
                        <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="success_rate" name="Success %" stroke="#22c55e" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Payment Method Breakdown */}
                {detailData.byPaymentMethod.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3">By Payment Method</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={detailData.byPaymentMethod}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="payment_method" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="successful" name="Success" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="total" name="Total" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Top Errors */}
                {detailData.topErrors.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-danger-500" /> Top Errors</h3>
                    <div className="space-y-2">
                      {detailData.topErrors.map((err, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-danger-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-danger-700">{err.error_code || 'Unknown'}</p>
                            <p className="text-xs text-danger-600">{err.error_message || '—'}</p>
                          </div>
                          <span className="text-sm font-bold text-danger-700">{err.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Toggle Modal */}
      <ConfirmModal
        open={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, gatewayId: null, gatewayName: '', isActive: false, loading: false })}
        onConfirm={handleConfirmToggle}
        title={confirmModal.isActive ? 'Deactivate Gateway' : 'Activate Gateway'}
        message={`Are you sure you want to ${confirmModal.isActive ? 'deactivate' : 'activate'} ${confirmModal.gatewayName}?`}
        confirmText={confirmModal.isActive ? 'Deactivate' : 'Activate'}
        cancelText="Cancel"
        variant={confirmModal.isActive ? 'danger' : 'primary'}
        loading={confirmModal.loading}
      />
    </div>
  );
}
