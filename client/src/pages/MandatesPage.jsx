import { useState, useEffect } from 'react';
import { mandatesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Pause, Play, XCircle, Eye, X } from 'lucide-react';

function StatusBadge({ status }) {
  const styles = {
    ACTIVE: 'badge-success', PAUSED: 'badge-warning', REVOKED: 'badge-danger',
    FAILED: 'badge-danger', CREATED: 'badge-info', EXPIRED: 'badge-gray',
  };
  return <span className={`badge ${styles[status] || 'badge-gray'}`}>{status}</span>;
}

export default function MandatesPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('mandates', 'READ_WRITE');
  const [mandates, setMandates] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  // Detail modal
  const [selectedMandate, setSelectedMandate] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [mandRes, statsRes] = await Promise.all([
        mandatesAPI.list(params),
        mandatesAPI.stats(),
      ]);
      setMandates(mandRes.data.mandates);
      setPagination(mandRes.data.pagination);
      setStats(statsRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAction = async (mandateId, action) => {
    setActionLoading(mandateId);
    try {
      if (action === 'pause') await mandatesAPI.pause(mandateId);
      else if (action === 'resume') await mandatesAPI.resume(mandateId);
      else if (action === 'revoke') {
        if (!confirm('Revoking a mandate is permanent and cannot be undone. Continue?')) {
          setActionLoading(null);
          return;
        }
        await mandatesAPI.revoke(mandateId);
      }
      fetchData(pagination.page);
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  };

  const openDetail = async (m) => {
    setSelectedMandate(m);
    setDetailLoading(true);
    try {
      const { data } = await mandatesAPI.get(m.mandate_id);
      setDetailData(data);
    } catch (err) { console.error(err); }
    finally { setDetailLoading(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mandates</h1>
          <p className="text-gray-500 text-sm mt-1">Recurring payment management</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Total</p>
            <p className="text-xl font-bold">{parseInt(stats.summary.total)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-success-600 mb-1">Active</p>
            <p className="text-xl font-bold text-success-600">{parseInt(stats.summary.active)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-warning-600 mb-1">Paused</p>
            <p className="text-xl font-bold text-warning-600">{parseInt(stats.summary.paused)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-danger-600 mb-1">Revoked</p>
            <p className="text-xl font-bold text-danger-600">{parseInt(stats.summary.revoked)}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-3">
          <form onSubmit={(e) => { e.preventDefault(); fetchData(1); }} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Mandate ID or Customer ID..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
          </form>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setTimeout(() => fetchData(1), 0); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option><option value="PAUSED">Paused</option>
            <option value="REVOKED">Revoked</option><option value="FAILED">Failed</option>
            <option value="CREATED">Created</option><option value="EXPIRED">Expired</option>
          </select>
          <button onClick={() => fetchData()} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={18} /></button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Mandate ID</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Customer</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Amount</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Frequency</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Gateway</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Created</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-500">Loading...</td></tr>
              ) : mandates.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-500">No mandates found</td></tr>
              ) : (
                mandates.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm font-mono text-primary-600">{m.mandate_id}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{m.customer_id || '—'}</td>
                    <td className="px-5 py-3 text-sm font-medium">₹{parseFloat(m.amount).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{m.frequency || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{m.gateway}</td>
                    <td className="px-5 py-3"><StatusBadge status={m.status} /></td>
                    <td className="px-5 py-3 text-sm text-gray-500">{new Date(m.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openDetail(m)} title="View details" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded">
                          <Eye size={14} />
                        </button>
                        {canWrite && m.status === 'ACTIVE' && (
                          <>
                            <button onClick={() => handleAction(m.id, 'pause')} title="Pause" disabled={actionLoading === m.id}
                              className="p-1.5 text-gray-400 hover:text-warning-600 hover:bg-warning-50 rounded disabled:opacity-30">
                              <Pause size={14} />
                            </button>
                            <button onClick={() => handleAction(m.id, 'revoke')} title="Revoke" disabled={actionLoading === m.id}
                              className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded disabled:opacity-30">
                              <XCircle size={14} />
                            </button>
                          </>
                        )}
                        {canWrite && m.status === 'PAUSED' && (
                          <>
                            <button onClick={() => handleAction(m.id, 'resume')} title="Resume" disabled={actionLoading === m.id}
                              className="p-1.5 text-gray-400 hover:text-success-600 hover:bg-success-50 rounded disabled:opacity-30">
                              <Play size={14} />
                            </button>
                            <button onClick={() => handleAction(m.id, 'revoke')} title="Revoke" disabled={actionLoading === m.id}
                              className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded disabled:opacity-30">
                              <XCircle size={14} />
                            </button>
                          </>
                        )}
                      </div>
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
      {selectedMandate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-semibold">Mandate Details</h2>
                <p className="text-sm text-gray-500 font-mono">{selectedMandate.mandate_id}</p>
              </div>
              <button onClick={() => { setSelectedMandate(null); setDetailData(null); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {detailLoading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : detailData && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-gray-500">Status</p><StatusBadge status={detailData.mandate.status} /></div>
                  <div><p className="text-xs text-gray-500">Amount</p><p className="font-semibold">₹{parseFloat(detailData.mandate.amount).toLocaleString()}</p></div>
                  <div><p className="text-xs text-gray-500">Customer</p><p className="text-sm">{detailData.mandate.customer_id}</p></div>
                  <div><p className="text-xs text-gray-500">Frequency</p><p className="text-sm">{detailData.mandate.frequency}</p></div>
                  <div><p className="text-xs text-gray-500">Gateway</p><p className="text-sm">{detailData.mandate.gateway}</p></div>
                  <div><p className="text-xs text-gray-500">Type</p><p className="text-sm">{detailData.mandate.mandate_type}</p></div>
                  <div><p className="text-xs text-gray-500">Merchant</p><p className="text-sm">{detailData.mandate.merchant_name}</p></div>
                  <div><p className="text-xs text-gray-500">Created</p><p className="text-sm">{new Date(detailData.mandate.created_at).toLocaleString()}</p></div>
                </div>
                {detailData.orders.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Related Orders ({detailData.orders.length})</h3>
                    <div className="space-y-1">
                      {detailData.orders.slice(0, 5).map((o) => (
                        <div key={o.id} className="flex justify-between text-sm p-2 bg-gray-50 rounded">
                          <span className="font-mono text-primary-600">{o.order_id}</span>
                          <span>₹{parseFloat(o.amount).toLocaleString()}</span>
                          <StatusBadge status={o.status} />
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
