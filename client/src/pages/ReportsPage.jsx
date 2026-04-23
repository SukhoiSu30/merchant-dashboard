import { useState, useEffect } from 'react';
import { reportsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  FileText, Plus, X, Download, RefreshCw, Clock, Calendar,
  BarChart3, TrendingUp, CreditCard, Shield, Eye, Play
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { CardSkeleton, Skeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

export default function ReportsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission('monitoring', 'READ_WRITE');

  const [activeTab, setActiveTab] = useState('generate');
  const [loading, setLoading] = useState(true);

  // Templates
  const [templates, setTemplates] = useState([]);

  // Generate
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [gatewayFilter, setGatewayFilter] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);

  // History
  const [reportHistory, setReportHistory] = useState([]);

  // Scheduled
  const [scheduledReports, setScheduledReports] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'generate') {
        const { data } = await reportsAPI.templates();
        setTemplates(data.templates);
      } else if (activeTab === 'history') {
        const { data } = await reportsAPI.history();
        setReportHistory(data.reports);
      } else if (activeTab === 'scheduled') {
        const { data } = await reportsAPI.scheduled();
        setScheduledReports(data.scheduled);
      }
    } catch (err) {
      toast.error('Failed to load report data. Please try again.');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    setGeneratedReport(null);
    try {
      const { data } = await reportsAPI.generate({
        report_type: selectedTemplate.id,
        date_from: dateFrom,
        date_to: dateTo,
        gateway: gatewayFilter || undefined,
      });
      setGeneratedReport(data.report);
      toast.success(`${selectedTemplate.name} generated successfully`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate report');
    }
    finally { setGenerating(false); }
  };

  const handleDownloadReport = (report) => {
    const blob = new Blob([JSON.stringify(report.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.report_id}_${report.report_type.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const templateIcons = {
    TRANSACTION_SUMMARY: <BarChart3 size={20} className="text-primary-500" />,
    SETTLEMENT_REPORT: <CreditCard size={20} className="text-success-500" />,
    REFUND_REPORT: <TrendingUp size={20} className="text-warning-500" />,
    CHARGEBACK_REPORT: <Shield size={20} className="text-danger-500" />,
    GATEWAY_PERFORMANCE: <BarChart3 size={20} className="text-blue-500" />,
    REVENUE_REPORT: <TrendingUp size={20} className="text-success-500" />,
    PAYMENT_METHOD_ANALYSIS: <CreditCard size={20} className="text-purple-500" />,
    MANDATE_REPORT: <Calendar size={20} className="text-primary-500" />,
    RECONCILIATION: <FileText size={20} className="text-gray-500" />,
  };

  const tabs = [
    { id: 'generate', label: 'Generate Report', icon: FileText },
    { id: 'history', label: 'Report History', icon: Clock },
    { id: 'scheduled', label: 'Scheduled', icon: Calendar },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Generate, schedule, and download business reports</p>
        </div>
        <button onClick={fetchData} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={18} /></button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setGeneratedReport(null); }}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
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
            <div className="space-y-6">
              <CardSkeleton count={9} />
              <div className="bg-white rounded-lg p-4">
                <Skeleton height="20px" width="100px" className="mb-4" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Skeleton height="16px" width="60%" />
                      <Skeleton height="16px" width="30%" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Generate Report */}
              {activeTab === 'generate' && (
                <div className="space-y-6">
                  {!generatedReport ? (
                    <>
                      {/* Template Selection */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Select Report Template</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {templates.map(t => (
                            <button key={t.id} onClick={() => setSelectedTemplate(t)}
                              className={`text-left p-4 border rounded-xl transition-all ${
                                selectedTemplate?.id === t.id
                                  ? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
                                  : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                              }`}>
                              <div className="flex items-center gap-3 mb-2">
                                {templateIcons[t.id] || <FileText size={20} className="text-gray-400" />}
                                <p className="text-sm font-medium text-gray-900">{t.name}</p>
                              </div>
                              <p className="text-xs text-gray-500 line-clamp-2">{t.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Filters */}
                      {selectedTemplate && (
                        <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                          <h3 className="text-sm font-semibold text-gray-900">
                            Report Parameters — {selectedTemplate.name}
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Date From</label>
                              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Date To</label>
                              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            {selectedTemplate.fields.includes('gateway') && (
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Gateway</label>
                                <select value={gatewayFilter} onChange={(e) => setGatewayFilter(e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                  <option value="">All Gateways</option>
                                  {['Razorpay', 'Stripe', 'PayU', 'PhonePe', 'Paytm', 'Cashfree'].map(gw => (
                                    <option key={gw} value={gw}>{gw}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                          <button onClick={handleGenerate} disabled={generating || !canWrite}
                            className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                            {generating ? (
                              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
                            ) : (
                              <><Play size={16} /> Generate Report</>
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Generated Report View */
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{generatedReport.name}</h3>
                          <p className="text-sm text-gray-500">
                            {generatedReport.date_from} to {generatedReport.date_to} — Generated {new Date(generatedReport.generated_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleDownloadReport(generatedReport)}
                            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
                            <Download size={16} /> Download JSON
                          </button>
                          <button onClick={() => setGeneratedReport(null)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                            New Report
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-gray-400 font-mono">Report ID: {generatedReport.report_id}</p>

                      {/* Render report data based on type */}
                      {generatedReport.data?.summary && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-gray-50 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold">{parseInt(generatedReport.data.summary.total).toLocaleString()}</p>
                            <p className="text-xs text-gray-500">Total Transactions</p>
                          </div>
                          <div className="bg-success-50 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-success-600">{parseInt(generatedReport.data.summary.successful).toLocaleString()}</p>
                            <p className="text-xs text-success-600">Successful</p>
                          </div>
                          <div className="bg-danger-50 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-danger-600">{parseInt(generatedReport.data.summary.failed).toLocaleString()}</p>
                            <p className="text-xs text-danger-600">Failed</p>
                          </div>
                          <div className="bg-primary-50 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-primary-600">₹{(parseFloat(generatedReport.data.summary.total_amount) / 100000).toFixed(1)}L</p>
                            <p className="text-xs text-primary-600">Total Volume</p>
                          </div>
                        </div>
                      )}

                      {/* Gateway breakdown chart */}
                      {generatedReport.data?.by_gateway && generatedReport.data.by_gateway.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-3">By Gateway</h4>
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={generatedReport.data.by_gateway}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="gateway" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} />
                              <Tooltip />
                              <Bar dataKey="count" name="Transactions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Gateway performance table */}
                      {generatedReport.data?.gateway_performance && (
                        <div>
                          <h4 className="text-sm font-semibold mb-3">Gateway Performance</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Gateway</th>
                                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Total Txns</th>
                                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Successful</th>
                                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Success Rate</th>
                                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Volume</th>
                                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Avg Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {generatedReport.data.gateway_performance.map((gw, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 text-sm font-medium">{gw.gateway}</td>
                                    <td className="px-4 py-2 text-sm">{parseInt(gw.total_txns).toLocaleString()}</td>
                                    <td className="px-4 py-2 text-sm text-success-600">{parseInt(gw.successful).toLocaleString()}</td>
                                    <td className="px-4 py-2 text-sm font-medium">{gw.success_rate}%</td>
                                    <td className="px-4 py-2 text-sm">₹{(parseFloat(gw.total_volume) / 1000).toFixed(0)}k</td>
                                    <td className="px-4 py-2 text-sm">₹{parseFloat(gw.avg_amount).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Revenue chart */}
                      {generatedReport.data?.daily_revenue && generatedReport.data.daily_revenue.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-3">Daily Revenue Trend</h4>
                          <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={generatedReport.data.daily_revenue}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="date" tick={{ fontSize: 11 }}
                                tickFormatter={(v) => new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
                              <YAxis tick={{ fontSize: 11 }}
                                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                              <Tooltip formatter={(v) => `₹${parseFloat(v).toLocaleString()}`} />
                              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                          {generatedReport.data.net_revenue && (
                            <div className="grid grid-cols-3 gap-4 mt-4">
                              <div className="bg-success-50 rounded-lg p-3 text-center">
                                <p className="text-lg font-bold text-success-600">₹{(generatedReport.data.net_revenue.gross / 100000).toFixed(2)}L</p>
                                <p className="text-xs text-success-600">Gross Revenue</p>
                              </div>
                              <div className="bg-warning-50 rounded-lg p-3 text-center">
                                <p className="text-lg font-bold text-warning-600">₹{(generatedReport.data.net_revenue.refunded / 1000).toFixed(1)}k</p>
                                <p className="text-xs text-warning-600">Refunded</p>
                              </div>
                              <div className="bg-danger-50 rounded-lg p-3 text-center">
                                <p className="text-lg font-bold text-danger-600">₹{(generatedReport.data.net_revenue.chargedback / 1000).toFixed(1)}k</p>
                                <p className="text-xs text-danger-600">Chargedback</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fallback raw data */}
                      {generatedReport.data?.fallback && (
                        <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                          <p>Report data preview not available. Download the JSON for full details.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Report History */}
              {activeTab === 'history' && (
                <div className="space-y-3">
                  {reportHistory.length === 0 ? (
                    <EmptyState icon="file" title="No reports generated yet" description="Generate your first report to see it here" />
                  ) : (
                    reportHistory.map(report => (
                      <div key={report.report_id} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:shadow-sm">
                        <div className="flex items-center gap-3">
                          {templateIcons[report.report_type] || <FileText size={20} className="text-gray-400" />}
                          <div>
                            <p className="text-sm font-medium text-gray-900">{report.name}</p>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                              <span>{report.date_from} to {report.date_to}</span>
                              <span>{report.row_count} rows</span>
                              <span>{report.format}</span>
                              <span>by {report.generated_by}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="badge badge-success text-xs">{report.status}</span>
                          <span className="text-xs text-gray-400">{new Date(report.generated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Scheduled Reports */}
              {activeTab === 'scheduled' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Automated report generation and delivery</p>
                  </div>

                  {scheduledReports.length === 0 ? (
                    <EmptyState icon="file" title="No scheduled reports" description="Set up scheduled reports to receive automated updates" />
                  ) : (
                    <div className="space-y-3">
                      {scheduledReports.map(sched => (
                        <div key={sched.id} className={`border rounded-lg p-4 ${sched.is_active ? 'border-gray-200' : 'border-gray-200 opacity-50'}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-medium text-gray-900">{sched.name}</p>
                                <span className={`badge ${sched.is_active ? 'badge-success' : 'badge-gray'}`}>
                                  {sched.is_active ? 'Active' : 'Paused'}
                                </span>
                                <span className="text-xs px-2 py-0.5 bg-primary-50 text-primary-600 rounded">{sched.frequency}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-1">
                                <span>Format: {sched.format}</span>
                                <span>Time: {sched.time} {sched.timezone}</span>
                                {sched.day && <span>{sched.frequency === 'WEEKLY' ? `Every ${sched.day}` : `Day ${sched.day}`}</span>}
                                <span>Recipients: {sched.recipients.join(', ')}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                                <span>Last: {new Date(sched.last_run).toLocaleDateString()}</span>
                                <span>Next: {new Date(sched.next_run).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-700">Schedule creation UI and email delivery will be available in Phase 6 (SFTP/S3 integration).</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
