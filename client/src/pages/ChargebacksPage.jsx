import { useState, useEffect } from 'react';
import { chargebacksAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Search, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, XCircle, Eye, X, Download } from 'lucide-react';
import { TableSkeleton, CardSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { downloadCSV } from '../utils/export';

function StatusBadge({ status }) {
  const styles = {
    RECEIVED: 'badge-warning', UNDER_REVIEW: 'badge-info', ESCALATED: 'badge-danger',
    RESOLVED_IN_MERCHANT_FAVOUR: 'badge-success', RESOLVED_IN_CUSTOMER_FAVOUR: 'badge-danger',
  };
  const labels = {
    RECEIVED: 'Received', UNDER_REVIEW: 'Under Review', ESCALATED: 'Escalated',
    RESOLVED_IN_MERCHANT_FAVOUR: 'Won', RESOLVED_IN_CUSTOMER_FAVOUR: 'Lost',
  };
  return <span className={`badge ${styles[status] || 'badge-gray'}`}>{labels[status] || status}</span>;
}

export default function ChargebacksPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission('chargebacks', 'READ_WRITE');
  const [chargebacks, setChargebacks] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Detail modal
  const [selectedCB, setSelectedCB] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchData = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [cbRes, statsRes] = await Promise.all([
        chargebacksAPI.list(params),
        chargebacksAPI.stats(),
      ]);
      setChargebacks(cbRes.data.chargebacks);
      setPagination(cbRes.data.pagination);
      setStats(statsRes.data);
    } catch (err) { toast.error('Failed to fetch chargebacks'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const openDetail = async (cb) => {
    setSelectedCB(cb);
    setDetailLoading(true);
    try {
      const { data } = await chargebacksAPI.get(cb.chargeback_id);
      setDetailData(data);
      setUpdateStatus(data.chargeback.status);
    } catch (err) { toast.error('Failed to load chargeback details'); }
    finally { setDetailLoading(false); }
  };

  const handleUpdateStatus = async () => {
    if (!updateStatus) return;
    setUpdating(true);
    try {
      await chargebacksAPI.updateStatus(detailData.chargeback.id, { status: updateStatus, notes: updateNotes });
      toast.success('Chargeback status updated successfully');
      setSelectedCB(null);
      setDetailData(null);
      fetchData(pagination.page);
    } catch (err) { toast.error('Failed to update chargeback status'); }
    finally { setUpdating(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chargebacks</h1>
          <p className="text-gray-500 text-sm mt-1">Dispute management</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Total</p>
            <p className="text-xl font-bold">{parseInt(stats.summary.total)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-warning-600 mb-1">Received</p>
            <p className="text-xl font-bold text-warning-600">{parseInt(stats.summary.received)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-primary-600 mb-1">Under Review</p>
            <p className="text-xl font-bold text-primary-600">{parseInt(stats.summary.under_review)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-success-600 mb-1">Won</p>
            <p className="text-xl font-bold text-success-600">{parseInt(stats.summary.won)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-danger-600 mb-1">Lost (₹)</p>
            <p className="text-xl font-bold text-danger-600">₹{parseFloat(stats.summary.lost_amount).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-3">
          <form onSubmit={(e) => { e.preventDefault(); fetchData(1); }} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Chargeback ID, Order ID, or email..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
          </form>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setTimeout(() => fetchData(1), 0); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            <option value="RECEIVED">Received</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="ESCALATED">Escalated</option>
            <option value="RESOLVED_IN_MERCHANT_FAVOUR">Won</option>
            <option value="RESOLVED_IN_CUSTOMER_FAVOUR">Lost</option>
          </select>
          <button onClick={() => fetchData()} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={18} /></button>
          <button onClick={() => downloadCSV(chargebacks, 'chargebacks')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Export as CSV"><Download size={18} /></button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Chargeback ID</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Order</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Customer</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Amount</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Reason</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Date</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8}><TableSkeleton rows={5} columns={8} /></td></tr>
              ) : chargebacks.length === 0 ? (
                <tr><td colSpan={8} className="p-8"><EmptyState title="No chargebacks found" description="There are no chargebacks to display at the moment." /></td></tr>
              ) : (
                chargebacks.map((cb) => (
                  <tr key={cb.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm font-mono text-primary-600">{cb.chargeback_id}</td>
                    <td className="px-5 py-3 text-sm font-mono text-gray-600">{cb.order_code}</td>
                    <td className="px-5 py-3">
                      <div className="text-sm text-gray-700">{cb.customer_name || '—'}</div>
                      <div className="text-xs text-gray-500">{cb.customer_email}</div>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium">₹{parseFloat(cb.amount).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 max-w-[180px] truncate">{cb.reason}</td>
                    <td className="px-5 py-3"><StatusBadge status={cb.status} /></td>
                    <td className="px-5 py-3 text-sm text-gray-500">{new Date(cb.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => openDetail(cb)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded">
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <span className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => fetchData(pagination.page - 1)} disabled={pagination.page <= 1} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
              <button onClick={() => fetchData(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedCB && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-semibold">Chargeback Details</h2>
                <p className="text-sm text-gray-500 font-mono">{selectedCB.chargeback_id}</p>
              </div>
              <button onClick={() => { setSelectedCB(null); setDetailData(null); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div className="p-8 text-center text-gray-500">Loading details...</div>
            ) : detailData && (
              <div className="p-5 space-y-6">
                {/* Chargeback info */}
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-gray-500">Amount</p><p className="font-semibold">₹{parseFloat(detailData.chargeback.amount).toLocaleString()}</p></div>
                  <div><p className="text-xs text-gray-500">Status</p><StatusBadge status={detailData.chargeback.status} /></div>
                  <div><p className="text-xs text-gray-500">Order</p><p className="font-mono text-sm text-primary-600">{detailData.chargeback.order_code}</p></div>
                  <div><p className="text-xs text-gray-500">Gateway</p><p className="text-sm">{detailData.chargeback.gateway}</p></div>
                  <div className="col-span-2"><p className="text-xs text-gray-500">Reason</p><p className="text-sm">{detailData.chargeback.reason}</p></div>
                  <div><p className="text-xs text-gray-500">Customer</p><p className="text-sm">{detailData.chargeback.customer_name} ({detailData.chargeback.customer_email})</p></div>
                  <div><p className="text-xs text-gray-500">Created</p><p className="text-sm">{new Date(detailData.chargeback.created_at).toLocaleString()}</p></div>
                </div>

                {/* Update Status */}
                {canWrite && !detailData.chargeback.status.startsWith('RESOLVED') && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-semibold mb-3">Update Status</h3>
                    <select value={updateStatus} onChange={(e) => setUpdateStatus(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3">
                      <option value="RECEIVED">Received</option>
                      <option value="UNDER_REVIEW">Under Review</option>
                      <option value="ESCALATED">Escalated</option>
                      <option value="RESOLVED_IN_MERCHANT_FAVOUR">Resolved — Merchant Won</option>
                      <option value="RESOLVED_IN_CUSTOMER_FAVOUR">Resolved — Customer Won</option>
                    </select>
                    <textarea value={updateNotes} onChange={(e) => setUpdateNotes(e.target.value)}
                      placeholder="Add notes..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3" rows={2} />
                    <button onClick={handleUpdateStatus} disabled={updating}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                      {updating ? 'Updating...' : 'Update Status'}
                    </button>
                  </div>
                )}

                {/* Audit Trail */}
                {detailData.auditTrail.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Audit Trail</h3>
                    <div className="space-y-2">
                      {detailData.auditTrail.map((a) => (
                        <div key={a.id} className="flex gap-2 text-sm p-2 bg-gray-50 rounded">
                          <span className="text-gray-400 text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</span>
                          <span className="text-gray-700">{a.description || a.action}</span>
                          <span className="text-gray-500">— {a.user_email || 'System'}</span>
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
    </div>
  );
}
