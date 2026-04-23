import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ArrowLeft, Copy, CheckCircle, XCircle, Clock, RefreshCw, CreditCard, Shield, FileText, Globe, DollarSign } from 'lucide-react';

function StatusBadge({ status }) {
  const styles = {
    CHARGED: 'badge-success', SUCCESS: 'badge-success', PENDING_VBV: 'badge-warning', PENDING: 'badge-warning',
    AUTHENTICATION_FAILED: 'badge-danger', AUTHORIZATION_FAILED: 'badge-danger', FAILED: 'badge-danger',
    JUSPAY_DECLINED: 'badge-danger', REFUNDED: 'badge-gray', NEW: 'badge-info',
  };
  return <span className={`badge ${styles[status] || 'badge-gray'}`}>{status}</span>;
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start py-2.5 border-b border-gray-50 last:border-0">
      <span className="w-40 flex-shrink-0 text-sm text-gray-500">{label}</span>
      <span className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('payment');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    ordersAPI.get(id)
      .then(({ data }) => setData(data))
      .catch(() => toast.error('Failed to load order details'))
      .finally(() => setLoading(false));
  }, [id]);

  const copyId = () => {
    navigator.clipboard.writeText(data?.order?.order_id || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw className="animate-spin text-primary-500" size={32} /></div>;
  }
  if (!data) {
    return <div className="text-center py-12 text-gray-500">Order not found</div>;
  }

  const { order, transactions, refunds, chargebacks, auditTrail } = data;

  // Generate simulated webhook data
  const generateWebhookEvents = () => {
    if (order.status === 'CHARGED') {
      return [
        { eventName: 'ORDER_CREATED', status: 'Delivered', consumed: true, eventId: `EVT_${order.order_id}_001`, created: new Date(order.created_at) },
        { eventName: 'PAYMENT_AUTHORIZED', status: 'Delivered', consumed: true, eventId: `EVT_${order.order_id}_002`, created: new Date(new Date(order.created_at).getTime() + 30000) },
        { eventName: 'PAYMENT_CAPTURED', status: 'Delivered', consumed: true, eventId: `EVT_${order.order_id}_003`, created: new Date(new Date(order.created_at).getTime() + 45000) },
      ];
    } else if (order.status === 'PENDING_VBV' || order.status === 'PENDING') {
      return [
        { eventName: 'ORDER_CREATED', status: 'Delivered', consumed: true, eventId: `EVT_${order.order_id}_001`, created: new Date(order.created_at) },
        { eventName: 'PAYMENT_AUTHORIZED', status: 'Failed', consumed: false, eventId: `EVT_${order.order_id}_002`, created: new Date(new Date(order.created_at).getTime() + 30000) },
      ];
    } else {
      return [
        { eventName: 'ORDER_CREATED', status: 'Delivered', consumed: true, eventId: `EVT_${order.order_id}_001`, created: new Date(order.created_at) },
        { eventName: 'PAYMENT_FAILED', status: 'Delivered', consumed: true, eventId: `EVT_${order.order_id}_002`, created: new Date(new Date(order.created_at).getTime() + 30000) },
      ];
    }
  };

  // Generate simulated settlement data
  const generateSettlementData = () => {
    const isSettled = order.status === 'CHARGED';
    const fee = (parseFloat(order.amount) * 0.018).toFixed(2);
    const gst = (parseFloat(fee) * 0.18).toFixed(2);
    const netAmount = (parseFloat(order.amount) - parseFloat(fee) - parseFloat(gst)).toFixed(2);
    const settlementDate = isSettled ? new Date(new Date(order.created_at).getTime() + 2 * 24 * 60 * 60 * 1000) : null;
    const utrNumber = isSettled ? `UTR${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}` : null;

    return {
      status: isSettled ? 'SETTLED' : (order.status === 'PENDING_VBV' ? 'PENDING' : 'UNSETTLED'),
      date: settlementDate,
      utr: utrNumber,
      fee: fee,
      gst: gst,
      netAmount: netAmount,
      reconStatus: isSettled ? 'MATCHED' : 'PENDING',
    };
  };

  const webhookEvents = generateWebhookEvents();
  const settlementData = generateSettlementData();

  const tabs = [
    { id: 'payment', label: 'Payment Info', icon: CreditCard },
    { id: 'transactions', label: `Transactions (${transactions.length})`, icon: RefreshCw },
    { id: 'refunds', label: `Refunds (${refunds.length})`, icon: FileText },
    { id: 'risk', label: 'Risk / FRM', icon: Shield },
    { id: 'audit', label: 'Audit Trail', icon: Clock },
    { id: 'webhooks', label: 'Webhooks', icon: Globe },
    { id: 'settlements', label: 'Settlements & Recon', icon: DollarSign },
  ];

  return (
    <div>
      {/* Back button & header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/orders')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 font-mono">{order.order_id}</h1>
            <button onClick={copyId} className="text-gray-400 hover:text-gray-600">
              {copied ? <CheckCircle size={16} className="text-success-500" /> : <Copy size={16} />}
            </button>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Created {new Date(order.created_at).toLocaleString()} · {order.merchant_name}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Amount</p>
          <p className="text-lg font-bold text-gray-900">{order.currency === 'INR' ? '₹' : '$'}{parseFloat(order.amount).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Payment Method</p>
          <p className="text-lg font-bold text-gray-900">{order.payment_method || '—'}</p>
          <p className="text-xs text-gray-500">{order.card_brand ? `${order.card_brand} ****${order.card_last_four}` : order.payment_method_type}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Gateway</p>
          <p className="text-lg font-bold text-gray-900">{order.gateway || '—'}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Refunded</p>
          <p className="text-lg font-bold text-gray-900">{order.currency === 'INR' ? '₹' : '$'}{parseFloat(order.refunded_amount || 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'payment' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Order Details</h3>
                <InfoRow label="Order ID" value={order.order_id} mono />
                <InfoRow label="Amount" value={`${order.currency} ${parseFloat(order.amount).toLocaleString()}`} />
                <InfoRow label="Status" value={<StatusBadge status={order.status} />} />
                <InfoRow label="Description" value={order.description} />
                <InfoRow label="Gateway Ref" value={order.gateway_reference_id} mono />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Customer Details</h3>
                <InfoRow label="Name" value={order.customer_name} />
                <InfoRow label="Email" value={order.customer_email} />
                <InfoRow label="Phone" value={order.customer_phone} />
                <InfoRow label="Customer ID" value={order.customer_id} mono />
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Txn ID</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Type</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Amount</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Gateway</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((txn) => (
                    <tr key={txn.id}>
                      <td className="px-4 py-2 text-sm font-mono text-primary-600">{txn.txn_id}</td>
                      <td className="px-4 py-2 text-sm">{txn.txn_type}</td>
                      <td className="px-4 py-2 text-sm font-medium">{order.currency === 'INR' ? '₹' : '$'}{parseFloat(txn.amount).toLocaleString()}</td>
                      <td className="px-4 py-2"><StatusBadge status={txn.status} /></td>
                      <td className="px-4 py-2 text-sm">{txn.gateway}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{new Date(txn.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-500">No transactions</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'refunds' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Refund ID</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Type</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Amount</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Reason</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2 text-sm font-mono text-primary-600">{r.refund_id}</td>
                      <td className="px-4 py-2 text-sm">{r.refund_type}</td>
                      <td className="px-4 py-2 text-sm font-medium">{order.currency === 'INR' ? '₹' : '$'}{parseFloat(r.amount).toLocaleString()}</td>
                      <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-2 text-sm text-gray-600">{r.reason}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {refunds.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-500">No refunds</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'risk' && (
            <div>
              <InfoRow label="Risk Score" value={order.risk_score ? `${order.risk_score}/100` : 'N/A'} />
              <InfoRow label="Risk Status" value={order.risk_status || 'Not evaluated'} />
              <InfoRow label="Error Code" value={order.error_code} mono />
              <InfoRow label="Error Message" value={order.error_message} />
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-3">
              {auditTrail.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No audit trail entries</p>
              ) : (
                auditTrail.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <Clock size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-gray-800">
                        <span className="font-medium">{entry.user_email || 'System'}</span> — {entry.action}
                      </p>
                      {entry.description && <p className="text-xs text-gray-500 mt-0.5">{entry.description}</p>}
                      <p className="text-xs text-gray-400 mt-1">{new Date(entry.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'webhooks' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Event Name</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Webhook Consumed</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Event ID</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {webhookEvents.map((event, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{event.eventName}</td>
                      <td className="px-4 py-2">
                        <span className={`badge ${event.status === 'Delivered' ? 'badge-success' : 'badge-danger'}`}>
                          {event.status}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`badge ${event.consumed ? 'badge-success' : 'badge-danger'}`}>
                          {event.consumed ? 'TRUE' : 'FALSE'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm font-mono text-gray-600">{event.eventId}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{event.created.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'settlements' && (
            <div className="space-y-6 max-w-3xl">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Settlement Details</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-gray-50">
                    <span className="text-sm text-gray-500">Settlement Status</span>
                    <span className={`badge ${
                      settlementData.status === 'SETTLED' ? 'badge-success' :
                      settlementData.status === 'PENDING' ? 'badge-warning' :
                      'badge-gray'
                    }`}>
                      {settlementData.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-gray-50">
                    <span className="text-sm text-gray-500">Settlement Date</span>
                    <span className="text-sm text-gray-900">{settlementData.date ? settlementData.date.toLocaleString() : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-gray-50">
                    <span className="text-sm text-gray-500">Settlement UTR</span>
                    <span className="text-sm font-mono text-gray-900">{settlementData.utr || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Fee Breakdown</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Transaction Amount</span>
                    <span className="text-sm font-medium text-gray-900">{order.currency} {parseFloat(order.amount).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-t border-b border-gray-100">
                    <span className="text-sm text-gray-600">Transaction Fee (1.8%)</span>
                    <span className="text-sm font-medium text-gray-900">- {order.currency} {parseFloat(settlementData.fee).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">GST on Fee (18%)</span>
                    <span className="text-sm font-medium text-gray-900">- {order.currency} {parseFloat(settlementData.gst).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <span className="text-sm font-semibold text-gray-900">Net Settlement Amount</span>
                    <span className="text-sm font-bold text-primary-600">{order.currency} {parseFloat(settlementData.netAmount).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Reconciliation</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-gray-50">
                    <span className="text-sm text-gray-500">Reconciliation Status</span>
                    <span className={`badge ${settlementData.reconStatus === 'MATCHED' ? 'badge-success' : 'badge-warning'}`}>
                      {settlementData.reconStatus}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-gray-50">
                    <span className="text-sm text-gray-500">Recon Date</span>
                    <span className="text-sm text-gray-900">{settlementData.date ? new Date(settlementData.date.getTime() + 24 * 60 * 60 * 1000).toLocaleString() : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm text-gray-500">Bank Reference Number</span>
                    <span className="text-sm font-mono text-gray-900">BANKREF_{order.order_id.slice(-8)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
