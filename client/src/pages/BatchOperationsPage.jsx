import { useState, useEffect } from 'react';
import { batchAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { TableSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, Upload, Download,
  Eye, X, FileText, CheckCircle, XCircle, Clock, AlertTriangle
} from 'lucide-react';

function StatusBadge({ status }) {
  const styles = {
    COMPLETED: 'badge-success', PROCESSING: 'badge-info', FAILED: 'badge-danger',
    PENDING: 'badge-warning', PARTIALLY_COMPLETED: 'badge-warning',
  };
  return <span className={`badge ${styles[status] || 'badge-gray'}`}>{status}</span>;
}

export default function BatchOperationsPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('batch_operations', 'READ_WRITE');
  const toast = useToast();

  const [batches, setBatches] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [batchTypes, setBatchTypes] = useState([]);
  const [uploadForm, setUploadForm] = useState({ batch_type: '', file_name: '', description: '' });
  const [csvData, setCsvData] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // Detail modal
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchBatches = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.batch_type = typeFilter;
      const { data } = await batchAPI.list(params);
      setBatches(data.batches);
      setPagination(data.pagination);
    } catch (err) { toast.error('Failed to load batch operations'); }
    finally { setLoading(false); }
  };

  const fetchTypes = async () => {
    try {
      const { data } = await batchAPI.types();
      setBatchTypes(data.types);
    } catch (err) { toast.error('Failed to load batch types'); }
  };

  useEffect(() => { fetchBatches(); fetchTypes(); }, []);

  const parseCsv = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    });
  };

  const handleUpload = async () => {
    if (!uploadForm.batch_type) return toast.warning('Please select a batch type');
    const data = parseCsv(csvData);
    if (data.length === 0) return toast.warning('Enter valid CSV data (header + at least 1 row)');
    if (data.length > 1000) return toast.warning('Maximum 1000 rows per batch');

    setUploading(true);
    try {
      const { data: result } = await batchAPI.upload({
        batch_type: uploadForm.batch_type,
        file_name: uploadForm.file_name || `${uploadForm.batch_type.toLowerCase()}_upload.csv`,
        description: uploadForm.description,
        data,
      });
      setUploadResult(result);
      toast.success('Batch uploaded successfully');
      fetchBatches();
    } catch (err) {
      const msg = err.response?.data?.error || 'Upload failed';
      const details = err.response?.data?.details;
      if (details) {
        const detailMsg = details.map(d => `Row ${d.row}: ${d.field} — ${d.message}`).join(' | ');
        toast.error(`${msg}: ${detailMsg}`);
      } else {
        toast.error(msg);
      }
    }
    finally { setUploading(false); }
  };

  const openDetail = async (batch) => {
    setSelectedBatch(batch);
    setDetailLoading(true);
    try {
      const { data } = await batchAPI.get(batch.id);
      setDetailData(data);
    } catch (err) { toast.error('Failed to load batch details'); }
    finally { setDetailLoading(false); }
  };

  const handleDownload = async (batch) => {
    try {
      const { data } = await batchAPI.download(batch.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.batch_id}_results.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error('Failed to download batch results'); }
  };

  const closeUpload = () => {
    setShowUpload(false);
    setUploadForm({ batch_type: '', file_name: '', description: '' });
    setCsvData('');
    setUploadResult(null);
  };

  // Group batch types by category
  const typesByCategory = batchTypes.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batch Operations</h1>
          <p className="text-gray-500 text-sm mt-1">Upload and manage bulk CSV operations</p>
        </div>
        {canWrite && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors">
            <Upload size={16} /> New Batch Upload
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-3">
          <form onSubmit={(e) => { e.preventDefault(); fetchBatches(1); }} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Batch ID or file name..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
          </form>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setTimeout(() => fetchBatches(1), 0); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PROCESSING">Processing</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setTimeout(() => fetchBatches(1), 0); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Types</option>
            {batchTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button onClick={() => fetchBatches()} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Batch ID</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Type</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">File</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Total</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Accepted</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Rejected</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Uploaded</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <TableSkeleton rows={5} cols={9} />
              ) : batches.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12"><EmptyState icon="file" title="No batch operations" message="No batch operations found" /></td></tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm font-mono text-primary-600">{b.batch_id}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {b.batch_type?.replace('BATCH_', '').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 max-w-[150px] truncate">{b.file_name}</td>
                    <td className="px-5 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-5 py-3 text-sm font-medium">{b.total_tasks}</td>
                    <td className="px-5 py-3 text-sm text-success-600 font-medium">{b.accepted_tasks}</td>
                    <td className="px-5 py-3 text-sm text-danger-600 font-medium">{b.rejected_tasks}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      <div>{new Date(b.created_at).toLocaleDateString()}</div>
                      <div className="text-xs text-gray-400">{b.uploaded_by_email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openDetail(b)} title="View details"
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => handleDownload(b)} title="Download results"
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded">
                          <Download size={14} />
                        </button>
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
              <button onClick={() => fetchBatches(pagination.page - 1)} disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
              <button onClick={() => fetchBatches(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <Upload size={20} className="text-primary-600" />
                <h2 className="text-lg font-semibold">
                  {uploadResult ? 'Upload Results' : 'New Batch Upload'}
                </h2>
              </div>
              <button onClick={closeUpload} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {uploadResult ? (
              /* Results View */
              <div className="p-5 space-y-4">
                <div className="bg-success-50 border border-success-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle size={18} className="text-success-600" />
                    <span className="font-semibold text-success-700">Batch Processed Successfully</span>
                  </div>
                  <p className="text-sm text-success-600">{uploadResult.message}</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{uploadResult.summary.total}</p>
                    <p className="text-xs text-gray-500">Total Rows</p>
                  </div>
                  <div className="bg-success-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-success-600">{uploadResult.summary.accepted}</p>
                    <p className="text-xs text-success-600">Accepted</p>
                  </div>
                  <div className="bg-danger-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-danger-600">{uploadResult.summary.rejected}</p>
                    <p className="text-xs text-danger-600">Rejected</p>
                  </div>
                </div>

                <p className="text-sm text-gray-500">Batch ID: <span className="font-mono text-primary-600">{uploadResult.batch?.batch_id}</span></p>

                <button onClick={closeUpload}
                  className="w-full py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                  Done
                </button>
              </div>
            ) : (
              /* Upload Form */
              <div className="p-5 space-y-4">
                {/* Batch Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Batch Type *</label>
                  <select value={uploadForm.batch_type}
                    onChange={(e) => setUploadForm(f => ({ ...f, batch_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select batch type...</option>
                    {Object.entries(typesByCategory).map(([cat, types]) => (
                      <optgroup key={cat} label={cat}>
                        {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Required Fields Hint */}
                {uploadForm.batch_type && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-700 font-medium mb-1">Required CSV Columns:</p>
                    <p className="text-sm text-blue-600">
                      {uploadForm.batch_type === 'BATCH_REFUND' && 'order_id, amount, reason'}
                      {uploadForm.batch_type === 'BATCH_USERS' && 'email, first_name, role'}
                      {uploadForm.batch_type === 'BATCH_MERCHANTS' && 'merchant_id, name'}
                      {uploadForm.batch_type === 'BATCH_TRANSACTIONS' && 'order_id'}
                      {uploadForm.batch_type === 'BATCH_CHARGEBACKS' && 'order_id, amount, reason'}
                      {uploadForm.batch_type === 'BATCH_MANDATE_CREATE' && 'customer_id, amount, frequency'}
                      {uploadForm.batch_type === 'BATCH_MANDATE_RETRY' && 'order_id, mandate_id'}
                      {uploadForm.batch_type === 'BATCH_MANDATE_PAUSE' && 'mandate_id'}
                      {uploadForm.batch_type === 'BATCH_MANDATE_RESUME' && 'mandate_id'}
                      {uploadForm.batch_type === 'BATCH_MANDATE_REVOKE' && 'mandate_id'}
                      {uploadForm.batch_type === 'BATCH_VPA_DELETE' && 'vpa_id'}
                      {uploadForm.batch_type === 'BATCH_CARD_DELETE' && 'card_reference'}
                      {uploadForm.batch_type === 'BATCH_CARD_TOKENIZE' && 'card_number, expiry'}
                      {uploadForm.batch_type === 'BATCH_ORDER_DETAIL' && 'order_id'}
                      {uploadForm.batch_type === 'BATCH_SYNC' && 'order_id'}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">File Name</label>
                    <input type="text" value={uploadForm.file_name}
                      onChange={(e) => setUploadForm(f => ({ ...f, file_name: e.target.value }))}
                      placeholder="Optional file name" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input type="text" value={uploadForm.description}
                      onChange={(e) => setUploadForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Optional description" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>

                {/* CSV Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CSV Data *</label>
                  <textarea value={csvData} onChange={(e) => setCsvData(e.target.value)}
                    placeholder={`Paste CSV data here (header row + data rows):\n\nExample for BATCH_REFUND:\norder_id,amount,reason\nORD_001,500,Customer request\nORD_002,1200,Defective product`}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono h-48 resize-y" />
                  <p className="text-xs text-gray-400 mt-1">
                    {csvData ? `${parseCsv(csvData).length} rows detected` : 'Max 1000 rows per upload'}
                  </p>
                </div>

                {/* File Upload Alternative */}
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                  <FileText size={24} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 mb-1">Or upload a CSV file</p>
                  <input type="file" accept=".csv" className="text-sm"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => setCsvData(ev.target.result);
                        reader.readAsText(file);
                        setUploadForm(f => ({ ...f, file_name: file.name }));
                      }
                    }} />
                </div>

                <div className="flex gap-3">
                  <button onClick={closeUpload}
                    className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={handleUpload} disabled={uploading || !uploadForm.batch_type || !csvData}
                    className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {uploading ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
                    ) : (
                      <><Upload size={16} /> Upload & Process</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-semibold">Batch Details</h2>
                <p className="text-sm text-gray-500 font-mono">{selectedBatch.batch_id}</p>
              </div>
              <button onClick={() => { setSelectedBatch(null); setDetailData(null); }}
                className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div className="p-8 space-y-4">
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ) : detailData && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Type</p>
                    <span className="text-sm px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                      {detailData.batch.batch_type?.replace('BATCH_', '').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div><p className="text-xs text-gray-500">Status</p><StatusBadge status={detailData.batch.status} /></div>
                  <div><p className="text-xs text-gray-500">File</p><p className="text-sm">{detailData.batch.file_name}</p></div>
                  <div><p className="text-xs text-gray-500">Uploaded By</p><p className="text-sm">{detailData.batch.uploaded_by_email || '—'}</p></div>
                  <div><p className="text-xs text-gray-500">Created</p><p className="text-sm">{new Date(detailData.batch.created_at).toLocaleString()}</p></div>
                  {detailData.batch.description && (
                    <div className="col-span-2"><p className="text-xs text-gray-500">Description</p><p className="text-sm">{detailData.batch.description}</p></div>
                  )}
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Progress</span>
                    <span className="font-medium">{detailData.batch.total_tasks} rows</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                    <div className="bg-success-500 h-full transition-all"
                      style={{ width: `${(detailData.batch.accepted_tasks / detailData.batch.total_tasks) * 100}%` }} />
                    <div className="bg-danger-500 h-full transition-all"
                      style={{ width: `${(detailData.batch.rejected_tasks / detailData.batch.total_tasks) * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-success-600">{detailData.batch.accepted_tasks} accepted</span>
                    <span className="text-danger-600">{detailData.batch.rejected_tasks} rejected</span>
                  </div>
                </div>

                {/* Results Preview */}
                {detailData.batch.results && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Results Preview (first 10)</h3>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {(typeof detailData.batch.results === 'string'
                        ? JSON.parse(detailData.batch.results)
                        : detailData.batch.results
                      ).slice(0, 10).map((r, i) => (
                        <div key={i} className={`flex items-center justify-between p-2 rounded text-sm ${
                          r.status === 'ACCEPTED' ? 'bg-success-50' : 'bg-danger-50'
                        }`}>
                          <span className="text-gray-600">Row {r.row_number}</span>
                          <span className={`flex items-center gap-1 ${r.status === 'ACCEPTED' ? 'text-success-600' : 'text-danger-600'}`}>
                            {r.status === 'ACCEPTED' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            {r.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={() => handleDownload(detailData.batch)}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  <Download size={16} /> Download Full Results
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
