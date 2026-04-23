import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ordersAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import { TableSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { downloadCSV } from '../utils/export';
import { Search, Filter, Download, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';

function StatusBadge({ status }) {
  const styles = {
    CHARGED: 'badge-success', PENDING_VBV: 'badge-warning',
    AUTHENTICATION_FAILED: 'badge-danger', AUTHORIZATION_FAILED: 'badge-danger',
    JUSPAY_DECLINED: 'badge-danger', NEW: 'badge-info', STARTED: 'badge-info',
    AUTO_REFUNDED: 'badge-gray', REFUNDED: 'badge-gray', VOIDED: 'badge-gray',
  };
  return <span className={`badge ${styles[status] || 'badge-gray'}`}>{status}</span>;
}

const STATUSES = ['CHARGED','PENDING_VBV','AUTHENTICATION_FAILED','AUTHORIZATION_FAILED','JUSPAY_DECLINED','NEW','STARTED','AUTO_REFUNDED','REFUNDED','VOIDED'];
const GATEWAYS = ['Razorpay','Stripe','PayU','PhonePe','Paytm','Cashfree'];
const METHODS = ['CARD','UPI','NETBANKING','WALLET','EMI','BNPL'];

export default function OrdersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filters, setFilters] = useState({
    status: searchParams.get('status') || '',
    gateway: searchParams.get('gateway') || '',
    payment_method: searchParams.get('payment_method') || '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
  });

  const fetchOrders = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20, search };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await ordersAPI.list(params);
      setOrders(data.orders);
      setPagination(data.pagination);
    } catch (err) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchOrders(1);
  };

  const applyFilters = () => { fetchOrders(1); setShowFilters(false); };
  const clearFilters = () => {
    setFilters({ status: '', gateway: '', payment_method: '', date_from: '', date_to: '' });
    setSearch('');
    setTimeout(() => fetchOrders(1), 0);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500 text-sm mt-1">{pagination.total.toLocaleString()} total orders</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <Download size={16} /> Export
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-gray-200 mb-4">
        <div className="flex items-center gap-3 p-4">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Order ID, email, phone, name..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </form>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm transition-colors ${
              activeFilterCount > 0 ? 'bg-primary-50 border-primary-200 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter size={16} />
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
          <button onClick={() => fetchOrders(pagination.page)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={18} />
          </button>
          <button onClick={() => downloadCSV(orders, 'orders_export.csv')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Export CSV"><Download size={18} /></button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="border-t border-gray-100 p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <select value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">All Statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.gateway} onChange={(e) => setFilters({...filters, gateway: e.target.value})}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">All Gateways</option>
                {GATEWAYS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={filters.payment_method} onChange={(e) => setFilters({...filters, payment_method: e.target.value})}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">All Methods</option>
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="date" value={filters.date_from} onChange={(e) => setFilters({...filters, date_from: e.target.value})}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="From date" />
              <input type="date" value={filters.date_to} onChange={(e) => setFilters({...filters, date_to: e.target.value})}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="To date" />
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={applyFilters} className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                Apply Filters
              </button>
              <button onClick={clearFilters} className="px-4 py-1.5 text-gray-600 hover:text-gray-800 text-sm">
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Order ID</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Customer</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Amount</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Method</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Gateway</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7}><TableSkeleton rows={8} cols={7} /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon="search" title="No orders found" description="Try adjusting your search or filters" /></td></tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/orders/${order.order_id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 text-sm font-mono text-primary-600">{order.order_id}</td>
                    <td className="px-5 py-3">
                      <div className="text-sm text-gray-700">{order.customer_name || '—'}</div>
                      <div className="text-xs text-gray-500">{order.customer_email}</div>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">
                      {order.currency === 'INR' ? '₹' : '$'}{parseFloat(order.amount).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{order.payment_method || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{order.gateway || '—'}</td>
                    <td className="px-5 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <span className="text-sm text-gray-500">
              Showing {((pagination.page - 1) * pagination.limit) + 1}—{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchOrders(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const start = Math.max(1, pagination.page - 2);
                const page = start + i;
                if (page > pagination.totalPages) return null;
                return (
                  <button
                    key={page}
                    onClick={() => fetchOrders(page)}
                    className={`w-8 h-8 rounded-lg text-sm ${
                      page === pagination.page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                onClick={() => fetchOrders(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
