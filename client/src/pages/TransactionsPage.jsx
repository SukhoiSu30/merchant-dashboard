import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { transactionsAPI } from '../services/api';
import { Search, Filter, RefreshCw, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Activity, Download } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { TableSkeleton, CardSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { downloadCSV } from '../utils/export';

function StatusBadge({ status }) {
  const styles = { SUCCESS: 'badge-success', PENDING: 'badge-warning', FAILED: 'badge-danger' };
  return <span className={`badge ${styles[status] || 'badge-gray'}`}>{status}</span>;
}

function TypeBadge({ type }) {
  const styles = { PAYMENT: 'badge-info', REFUND: 'badge-warning', VOID: 'badge-gray', CAPTURE: 'badge-success' };
  return <span className={`badge ${styles[type] || 'badge-gray'}`}>{type}</span>;
}

const GATEWAYS = ['Razorpay','Stripe','PayU','PhonePe','Paytm','Cashfree'];
const METHODS = ['CARD','UPI','NETBANKING','WALLET','EMI','BNPL'];

export default function TransactionsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ status: '', txn_type: '', gateway: '', payment_method: '' });

  const fetchData = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const [txnRes, statsRes] = await Promise.all([
        transactionsAPI.list(params),
        transactionsAPI.stats('7d'),
      ]);
      setTransactions(txnRes.data.transactions);
      setPagination(txnRes.data.pagination);
      setStats(statsRes.data);
    } catch (err) { toast.error('Failed to load transactions'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-500 text-sm mt-1">{pagination.total.toLocaleString()} total transactions</p>
        </div>
      </div>

      {/* Stats Cards */}
      {loading && !stats ? (
        <CardSkeleton count={4} />
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><Activity size={14} /> Total</div>
            <p className="text-xl font-bold">{parseInt(stats.summary.total).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-success-600 text-xs mb-1"><ArrowUpRight size={14} /> Successful</div>
            <p className="text-xl font-bold text-success-700">{parseInt(stats.summary.successful).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-danger-600 text-xs mb-1"><ArrowDownRight size={14} /> Failed</div>
            <p className="text-xl font-bold text-danger-700">{parseInt(stats.summary.failed).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">Success Rate</div>
            <p className="text-xl font-bold">{stats.summary.success_rate || 0}%</p>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-gray-200 mb-4">
        <div className="flex items-center gap-3 p-4">
          <form onSubmit={(e) => { e.preventDefault(); fetchData(1); }} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Txn ID, Order ID, Gateway Txn ID..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </form>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm ${activeFilterCount > 0 ? 'bg-primary-50 border-primary-200 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Filter size={16} /> Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
          <button onClick={() => fetchData(pagination.page)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={18} /></button>
          {transactions.length > 0 && (
            <button onClick={() => downloadCSV(transactions, 'transactions.csv')} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"><Download size={16} /> Export</button>
          )}
        </div>
        {showFilters && (
          <div className="border-t border-gray-100 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <select value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">All Statuses</option>
                <option value="SUCCESS">Success</option><option value="FAILED">Failed</option><option value="PENDING">Pending</option>
              </select>
              <select value={filters.txn_type} onChange={(e) => setFilters({...filters, txn_type: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">All Types</option>
                <option value="PAYMENT">Payment</option><option value="REFUND">Refund</option><option value="VOID">Void</option><option value="CAPTURE">Capture</option>
              </select>
              <select value={filters.gateway} onChange={(e) => setFilters({...filters, gateway: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">All Gateways</option>
                {GATEWAYS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={filters.payment_method} onChange={(e) => setFilters({...filters, payment_method: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">All Methods</option>
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => fetchData(1)} className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm">Apply</button>
              <button onClick={() => { setFilters({ status: '', txn_type: '', gateway: '', payment_method: '' }); setSearch(''); }} className="px-4 py-1.5 text-gray-600 text-sm">Clear</button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : transactions.length === 0 ? (
        <EmptyState icon="search" title="No transactions found" description="Try adjusting your filters or date range" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Txn ID</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Order</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Gateway</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Method</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((txn) => (
                  <tr key={txn.id} onClick={() => navigate(`/orders/${txn.order_code}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-5 py-3 text-sm font-mono text-primary-600">{txn.txn_id}</td>
                    <td className="px-5 py-3 text-sm font-mono text-gray-600">{txn.order_code}</td>
                    <td className="px-5 py-3"><TypeBadge type={txn.txn_type} /></td>
                    <td className="px-5 py-3 text-sm font-medium">{txn.currency === 'INR' ? '₹' : '$'}{parseFloat(txn.amount).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{txn.gateway}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{txn.payment_method}</td>
                    <td className="px-5 py-3"><StatusBadge status={txn.status} /></td>
                    <td className="px-5 py-3 text-sm text-gray-500">{new Date(txn.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
              <span className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
              <div className="flex gap-1">
                <button onClick={() => fetchData(pagination.page - 1)} disabled={pagination.page <= 1} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
                <button onClick={() => fetchData(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={18} /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
