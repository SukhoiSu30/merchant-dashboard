import { useState, useEffect } from 'react';
import { altIdAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { TableSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import {
  Download, Upload, RefreshCw, CheckCircle, XCircle, Clock,
  FileText, AlertCircle, Eye, EyeOff
} from 'lucide-react';

function StatusBadge({ status }) {
  const styles = {
    'ACCEPTED': 'bg-green-100 text-green-800 border-green-200',
    'FAILED': 'bg-red-100 text-red-800 border-red-200',
    'QUEUED': 'bg-blue-100 text-blue-800 border-blue-200',
  };
  const icons = {
    'ACCEPTED': CheckCircle,
    'FAILED': XCircle,
    'QUEUED': Clock,
  };
  const Icon = icons[status];
  return (
    <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || ''}`}>
      {Icon && <Icon size={14} />}
      {status}
    </div>
  );
}

export default function AltIdPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('batch_operations', 'READ_WRITE');
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('generate');

  // Generate tab
  const [csvInput, setCsvInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [description, setDescription] = useState('');
  const [uploadMethod, setUploadMethod] = useState('paste'); // 'paste' or 'file'
  const [csvFile, setCsvFile] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [rowCount, setRowCount] = useState(0);

  const [results, setResults] = useState(null);
  const [generating, setGenerating] = useState(false);

  // History tab
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  // Parse CSV text
  const parseCsv = (text) => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [], errors: [] };

    const headers = lines[0]
      .split(',')
      .map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));

    const rows = lines.slice(1).map((line, idx) => {
      const values = line.split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, i) => {
        row[h] = values[i] || '';
      });
      return { ...row, _lineNumber: idx + 2 };
    });

    return { headers, rows };
  };

  // Validate rows
  const validateRows = (rows) => {
    const errors = [];
    rows.forEach((row, idx) => {
      const cn = String(row.cardnumber || row.cardNumber || '').replace(/\s/g, '');
      if (!cn) {
        errors.push({ row: row._lineNumber, field: 'cardNumber', message: 'Card number is required' });
      } else if (cn.length < 15 || cn.length > 16 || !/^\d+$/.test(cn)) {
        errors.push({ row: row._lineNumber, field: 'cardNumber', message: 'Card number must be 15-16 digits' });
      }

      const month = row.cardexpirymonth || row.cardExpiryMonth;
      if (!month) {
        errors.push({ row: row._lineNumber, field: 'cardExpiryMonth', message: 'Expiry month required' });
      } else if (parseInt(month) < 1 || parseInt(month) > 12) {
        errors.push({ row: row._lineNumber, field: 'cardExpiryMonth', message: 'Month must be 01-12' });
      }

      const year = row.cardexpiryyear || row.cardExpiryYear;
      if (!year) {
        errors.push({ row: row._lineNumber, field: 'cardExpiryYear', message: 'Expiry year required' });
      } else if (parseInt(year) < new Date().getFullYear()) {
        errors.push({ row: row._lineNumber, field: 'cardExpiryYear', message: 'Year must be in the future' });
      }
    });
    return errors;
  };

  // Handle CSV input change
  const handleCsvInput = (text) => {
    setCsvInput(text);
    const { rows } = parseCsv(text);
    setRowCount(rows.length);

    if (rows.length > 0) {
      const errors = validateRows(rows);
      setValidationErrors(errors);
    } else {
      setValidationErrors([]);
    }
  };

  // Handle file upload
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        toast.error('Please upload a CSV file');
        return;
      }
      setCsvFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        handleCsvInput(event.target.result);
      };
      reader.readAsText(file);
      setFileName(file.name);
    }
  };

  // Download template
  const handleDownloadTemplate = async () => {
    try {
      const { data } = await altIdAPI.template();
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'batch_altid_provision_sample.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch (err) {
      toast.error('Failed to download template');
    }
  };

  // Generate ALT IDs
  const handleGenerate = async () => {
    if (!csvInput && !csvFile) {
      toast.warning('Please provide CSV data');
      return;
    }

    const { rows } = parseCsv(csvInput || '');
    if (rows.length === 0) {
      toast.warning('Please provide at least one data row');
      return;
    }

    if (rows.length > 1000) {
      toast.warning('Maximum 1000 rows per upload');
      return;
    }

    const errors = validateRows(rows);
    if (errors.length > 0) {
      toast.error(`Please fix ${errors.length} validation errors before generating`);
      return;
    }

    setGenerating(true);
    try {
      const { data } = await altIdAPI.generate({
        data: rows,
        file_name: fileName || csvFile?.name || 'altid_batch.csv',
        description: description || 'ALT ID batch generation'
      });
      setResults(data);
      toast.success(`ALT IDs generated successfully (${data.summary.accepted} accepted, ${data.summary.failed} failed, ${data.summary.queued} queued)`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Generation failed';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Export results to CSV
  const exportResults = () => {
    if (!results) return;

    const headers = ['Row', 'Card Number', 'Expiry', 'ALT ID', 'Status', 'Associate ID', 'Message'];
    const rows = results.results.map(r => [
      r.row_number,
      r.cardNumber,
      `${r.cardExpiryMonth}/${r.cardExpiryYear}`,
      r.altId || '-',
      r.status,
      r.associateId || '-',
      r.message || '-'
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${results.batch_id}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Results exported successfully');
  };

  // Fetch history
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await altIdAPI.history();
      setHistory(data.batches);
    } catch (err) {
      toast.error('Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  if (!canWrite) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">ALT ID Generation</h1>
          <p className="text-gray-500 mt-1">Generate ALT IDs for card tokenization in bulk</p>
        </div>
        <EmptyState
          icon="alert"
          title="Access Denied"
          description="You don't have permission to access batch operations. Contact your administrator."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Batch ALT ID Generation</h1>
          <p className="text-gray-500 mt-1">Generate ALT IDs for card tokenization in bulk</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-1">
        <button
          onClick={() => setActiveTab('generate')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'generate'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Upload size={16} />
            Generate ALT IDs
          </div>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText size={16} />
            History
          </div>
        </button>
      </div>

      {/* Generate Tab */}
      {activeTab === 'generate' && (
        <div className="space-y-6">
          {/* Download Template */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-blue-600" />
              <div>
                <h3 className="font-semibold text-blue-900">CSV Template Available</h3>
                <p className="text-sm text-blue-700">Download a sample CSV file to understand the required format</p>
              </div>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Download size={16} />
              Download Template
            </button>
          </div>

          {/* Upload Method Selection */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Step 1: Upload CSV</h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={() => setUploadMethod('paste')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  uploadMethod === 'paste'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <h3 className="font-semibold text-center">Paste CSV Data</h3>
              </button>
              <button
                onClick={() => setUploadMethod('file')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  uploadMethod === 'file'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <h3 className="font-semibold text-center">Upload File</h3>
              </button>
            </div>

            {/* Paste textarea */}
            {uploadMethod === 'paste' && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-900">CSV Data</label>
                <textarea
                  value={csvInput}
                  onChange={(e) => handleCsvInput(e.target.value)}
                  placeholder="cardNumber,cardExpiryMonth,cardExpiryYear,associateId,udf1,udf2&#10;4111111111111111,12,2027,ASSOC001,custom1,custom2"
                  className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none font-mono text-sm"
                />
              </div>
            )}

            {/* File upload */}
            {uploadMethod === 'file' && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-900">Select CSV File</label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="sr-only"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="block w-full border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 transition-colors"
                  >
                    <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-900">Click to upload or drag and drop</p>
                    <p className="text-xs text-gray-500">CSV files only</p>
                  </label>
                </div>
                {csvFile && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
                    <CheckCircle size={16} className="text-green-600" />
                    <span className="text-sm text-green-700">{csvFile.name}</span>
                  </div>
                )}
              </div>
            )}

            {/* Row count */}
            {rowCount > 0 && (
              <div className="mt-4 flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">
                  <strong>{rowCount}</strong> rows ready to process {rowCount > 1000 && '(exceeds 1000 limit)'}
                </span>
              </div>
            )}
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                <AlertCircle size={18} />
                Validation Errors ({validationErrors.length})
              </h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {validationErrors.slice(0, 20).map((err, i) => (
                  <p key={i} className="text-sm text-red-700">
                    Row {err.row}: <strong>{err.field}</strong> — {err.message}
                  </p>
                ))}
                {validationErrors.length > 20 && (
                  <p className="text-sm text-red-700 font-medium">
                    ... and {validationErrors.length - 20} more errors
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Details input */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Step 2: Enter Details</h2>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">File Name (Optional)</label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="e.g., altid_batch_2024_april.csv"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Description (Optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the purpose of this batch..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                rows="3"
              />
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={
                generating ||
                !csvInput && !csvFile ||
                rowCount === 0 ||
                validationErrors.length > 0
              }
              className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
            >
              {generating ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Generate ALT IDs
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {results && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Total Records</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{results.summary.total}</p>
                </div>
                <div className="bg-white rounded-lg border border-green-200 p-4 bg-green-50">
                  <p className="text-xs text-green-600 uppercase font-semibold">Accepted</p>
                  <p className="text-2xl font-bold text-green-700 mt-2">{results.summary.accepted}</p>
                </div>
                <div className="bg-white rounded-lg border border-red-200 p-4 bg-red-50">
                  <p className="text-xs text-red-600 uppercase font-semibold">Failed</p>
                  <p className="text-2xl font-bold text-red-700 mt-2">{results.summary.failed}</p>
                </div>
                <div className="bg-white rounded-lg border border-blue-200 p-4 bg-blue-50">
                  <p className="text-xs text-blue-600 uppercase font-semibold">Queued</p>
                  <p className="text-2xl font-bold text-blue-700 mt-2">{results.summary.queued}</p>
                </div>
              </div>

              {/* Batch ID */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase font-semibold">Batch ID</p>
                <p className="text-lg font-mono text-gray-900 mt-1 break-all">{results.batch_id}</p>
              </div>

              {/* Export Button */}
              <div className="flex justify-end">
                <button
                  onClick={exportResults}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Download size={16} />
                  Export Results as CSV
                </button>
              </div>

              {/* Results Table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-900">Row</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-900">Card Number</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-900">Expiry</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-900">ALT ID</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-900">Status</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-900">Associate ID</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-900">Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {results.results.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600">{row.row_number}</td>
                          <td className="px-4 py-3 font-mono text-gray-900">{row.cardNumber}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {row.cardExpiryMonth}/{row.cardExpiryYear}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600 break-all max-w-xs">
                            {row.altId || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{row.associateId || '-'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs max-w-xs">{row.message || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {historyLoading ? (
            <TableSkeleton />
          ) : history.length === 0 ? (
            <EmptyState
              icon="file"
              title="No ALT ID Batches Yet"
              description="Start by generating your first batch of ALT IDs above"
            />
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Batch ID</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">File Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Total</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Accepted</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Failed</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Created</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {history.map((batch) => (
                      <tr key={batch.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-900 break-all max-w-xs">
                          {batch.batch_id}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{batch.file_name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                            batch.status === 'COMPLETED'
                              ? 'bg-green-100 text-green-800'
                              : batch.status === 'PROCESSING'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {batch.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-semibold">{batch.total_tasks}</td>
                        <td className="px-4 py-3 text-green-600 font-semibold">{batch.accepted_tasks}</td>
                        <td className="px-4 py-3 text-red-600 font-semibold">{batch.rejected_tasks}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {new Date(batch.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              setSelectedBatch(batch);
                              setShowDetails(!showDetails && selectedBatch?.id === batch.id);
                            }}
                            className="text-primary-600 hover:text-primary-700 font-medium text-xs"
                          >
                            {showDetails && selectedBatch?.id === batch.id ? (
                              <EyeOff size={16} />
                            ) : (
                              <Eye size={16} />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
