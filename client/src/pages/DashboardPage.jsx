import { useState, useEffect } from 'react';
import { dashboardAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, CheckCircle,
  XCircle, ArrowUpRight, ArrowDownRight, RefreshCw
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function MetricCard({ title, value, change, icon: Icon, color, prefix = '' }) {
  const isPositive = change >= 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{prefix}{typeof value === 'number' ? value.toLocaleString() : value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
      {change !== undefined && (
        <div className={`flex items-center gap-1 mt-3 text-sm ${isPositive ? 'text-success-600' : 'text-danger-600'}`}>
          {isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          <span className="font-medium">{Math.abs(change).toFixed(1)}%</span>
          <span className="text-gray-500">vs previous period</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    CHARGED: 'badge-success',
    PENDING_VBV: 'badge-warning',
    AUTHENTICATION_FAILED: 'badge-danger',
    AUTHORIZATION_FAILED: 'badge-danger',
    JUSPAY_DECLINED: 'badge-danger',
    NEW: 'badge-info',
    STARTED: 'badge-info',
    REFUNDED: 'badge-gray',
  };
  return <span className={`badge ${styles[status] || 'badge-gray'}`}>{status}</span>;
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: result } = await dashboardAPI.overview(period);
      setData(result);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [period]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  const { metrics, previousPeriod, trend, gateways, paymentMethods, recentOrders, refundStats } = data;

  // Calculate percentage changes
  const orderChange = previousPeriod.total_orders > 0
    ? ((metrics.total_orders - previousPeriod.total_orders) / previousPeriod.total_orders * 100)
    : 0;
  const revenueChange = previousPeriod.total_revenue > 0
    ? ((metrics.total_revenue - previousPeriod.total_revenue) / previousPeriod.total_revenue * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Payment analytics overview</p>
        </div>
        <div className="flex items-center gap-2">
          {['1d', '7d', '30d', '90d'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                period === p ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p === '1d' ? 'Today' : p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
          <button onClick={fetchData} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Total Orders" value={parseInt(metrics.total_orders)} change={orderChange} icon={ShoppingCart} color="bg-primary-500" />
        <MetricCard title="Total Revenue" value={parseFloat(metrics.total_revenue).toFixed(0)} change={revenueChange} icon={DollarSign} color="bg-success-600" prefix="₹" />
        <MetricCard title="Success Rate" value={`${metrics.success_rate || 0}%`} icon={CheckCircle} color="bg-success-500" />
        <MetricCard title="Failed Orders" value={parseInt(metrics.failed_count)} icon={XCircle} color="bg-danger-500" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Transaction Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v) => new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="successful" name="Successful" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} />
              <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Payment Methods Pie */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Payment Methods</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={paymentMethods}
                dataKey="count"
                nameKey="payment_method"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                label={({ payment_method, percentage }) => `${payment_method} ${percentage}%`}
              >
                {paymentMethods.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gateway Performance & Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Gateway Performance</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={gateways} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="gateway" tick={{ fontSize: 12 }} width={80} />
              <Tooltip />
              <Bar dataKey="successful" name="Success" fill="#22c55e" radius={[0, 4, 4, 0]} />
              <Bar dataKey="total" name="Total" fill="#e5e7eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v) => new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => `₹${parseFloat(v).toLocaleString()}`} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Recent Orders</h3>
          <button onClick={() => navigate('/orders')} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            View All →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
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
              {recentOrders.map((order) => (
                <tr
                  key={order.order_id}
                  onClick={() => navigate(`/orders/${order.order_id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3 text-sm font-mono text-primary-600">{order.order_id}</td>
                  <td className="px-5 py-3 text-sm text-gray-700">{order.customer_email || '—'}</td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">
                    {order.currency === 'INR' ? '₹' : '$'}{parseFloat(order.amount).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{order.payment_method || '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{order.gateway || '—'}</td>
                  <td className="px-5 py-3"><StatusBadge status={order.status} /></td>
                  <td className="px-5 py-3 text-sm text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
