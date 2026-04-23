import { useState, useEffect } from 'react';
import { refundsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCw, Plus, X, Download } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { TableSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { downloadCSV } from '../utils/export';

function StatusBadge({ status }) {
  const styles = { SUCCESS: 'badge-success', PENDING: 'badge-warning', FAILURE: 'badge-danger', MANUAL_REVIEW: 'badge-info' };
  return <span className={`badge ${styles[status] || 'badge-gray'}`}>{status}</span>;
}

export default function RefundsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [refunds, setRefunds] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ order_id: '', amount: '', reason: '', refund_type: 'FULL' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchRefunds = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await refundsAPI.list(params);
      setRefunds(data.refunds);
      setPagination(data.pagination);
    } catch (err) {
      toast.error('Failed to load refunds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRefunds(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await refundsAPI.create(createForm);
      toast.success('Refund created successfully');
      setShowCreate(false);
      setCreateForm({ order_id: '', amount: '', reason: '', refund_type: 'FULL' });
      fetchRefunds();
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create refund');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Refunds</h1>
          <p className="text-gray-500 text-sm mt-1">{pagination.total} total refunds</p>
        </div>
        {hasPermission('refunds', 'READ_WRITE') && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
            <Plus size={16} /> New Refund
          </button>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Create Refund</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {createError && <div className="mb-4 p-3 bg-danger-50 text-danger-700 rounded-lg text-sm">{createError}</div>}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order ID</label>
                <input type="text" value={createForm.order_id} onChange={(e) => setCreateForm({...createForm, order_id: e.target.value})}
                  placeholder="ORD_..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input type="number" step="0.01" value={createForm.amount} onChange={(e) => setCreateForm({...createForm, amount: e.target.value})}
                  placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={createForm.refund_type} onChange={(e) => setCreateForm({...createForm, refund_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="FULL">Full Refund</option>
                  <option value="PARTIAL">Partial Refund</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea value={createForm.reason} onChange={(e) => setCreateForm({...createForm, reason: e.target.value})}
                  placeholder="Reason for refund..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={3} required />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={creating} className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                  {creating ? 'Processing...' : 'Create Refund'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-3">
          <form onSubmit={(e) => { e.preventDefault(); fetchRefunds(1); }} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Refund ID or Order ID..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
          </form>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setTimeout(() => fetchRefunds(1), 0); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILURE">Failure</option>
            <option value="MANUAL_REVIEW">Manual Review</option>
          </select>
          <button onClick={() => fetchRefunds()} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={18} /></button>
          {refunds.length > 0 && (
            <button onClick={() => downloadCSV(refunds, 'refunds.csv')} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"><Download size={16} /> Export</button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : refunds.length === 0 ? (
        <EmptyState icon="payment" title="No refunds found" description="Create a new refund to get started" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Refund ID</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Order</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Reason</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Initiated By</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {refunds.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm font-mono text-primary-600">{r.refund_id}</td>
                    <td className="px-5 py-3 text-sm font-mono text-gray-600">{r.order_code}</td>
                    <td className="px-5 py-3 text-sm font-medium">₹{parseFloat(r.amount).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm">{r.refund_type}</td>
                    <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-5 py-3 text-sm text-gray-600 max-w-[200px] truncate">{r.reason}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{r.initiated_by_email || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
              <span className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => fetchRefunds(pagination.page - 1)} disabled={pagination.page <= 1}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
                <button onClick={() => fetchRefunds(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={18} /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
