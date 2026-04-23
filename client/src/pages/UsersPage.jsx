import { useState, useEffect } from 'react';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Search, Plus, X, Lock, Unlock, Edit2, Shield, RefreshCw, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { TableSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';
import { downloadCSV } from '../utils/export';

function StatusBadge({ status }) {
  const styles = { ACTIVE: 'badge-success', INACTIVE: 'badge-danger', LOCKED: 'badge-warning', PENDING: 'badge-info' };
  return <span className={`badge ${styles[status] || 'badge-gray'}`}>{status}</span>;
}

export default function UsersPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission('users', 'READ_WRITE');
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [roles, setRoles] = useState([]);
  const [createForm, setCreateForm] = useState({ email: '', password: '', first_name: '', last_name: '', role_id: '' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ open: false, userId: null, userName: '', action: '', loading: false });

  const fetchUsers = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      const { data } = await usersAPI.list(params);
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  const fetchRoles = async () => {
    try {
      const { data } = await usersAPI.roles();
      setRoles(data.roles);
    } catch (err) { toast.error('Failed to load roles'); }
  };

  useEffect(() => { fetchUsers(); fetchRoles(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await usersAPI.create(createForm);
      toast.success('User created successfully');
      setShowCreate(false);
      setCreateForm({ email: '', password: '', first_name: '', last_name: '', role_id: '' });
      fetchUsers();
    } catch (err) {
      setCreateError(err.response?.data?.error || err.response?.data?.errors?.join(', ') || 'Failed');
    } finally { setCreating(false); }
  };

  const handleStatusChange = (userId, userName, action) => {
    setConfirmModal({
      open: true,
      userId,
      userName,
      action,
      loading: false
    });
  };

  const handleConfirmStatusChange = async () => {
    setConfirmModal({ ...confirmModal, loading: true });
    try {
      const { userId, action } = confirmModal;
      if (action === 'lock') await usersAPI.lock(userId);
      else if (action === 'unlock') await usersAPI.unlock(userId);
      else await usersAPI.update(userId, { status: action });
      toast.success('User status updated');
      fetchUsers(pagination.page);
      setConfirmModal({ open: false, userId: null, userName: '', action: '', loading: false });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user status');
      setConfirmModal({ ...confirmModal, loading: false });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm mt-1">{pagination.total} total users</p>
        </div>
        {canWrite && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
            <Plus size={16} /> Add User
          </button>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Create User</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {createError && <div className="mb-4 p-3 bg-danger-50 text-danger-700 rounded-lg text-sm">{createError}</div>}
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input type="text" value={createForm.first_name} onChange={(e) => setCreateForm({...createForm, first_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input type="text" value={createForm.last_name} onChange={(e) => setCreateForm({...createForm, last_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={createForm.email} onChange={(e) => setCreateForm({...createForm, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm({...createForm, password: e.target.value})}
                  placeholder="Min 8 chars, upper+lower+number" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={createForm.role_id} onChange={(e) => setCreateForm({...createForm, role_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
                  <option value="">Select role...</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={creating} className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create User'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <form onSubmit={(e) => { e.preventDefault(); fetchUsers(1); }} className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <button type="button" onClick={() => fetchUsers()} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={18} /></button>
          {users.length > 0 && (
            <button onClick={() => downloadCSV(users, 'users.csv')} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"><Download size={16} /> Export</button>
          )}
        </form>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : users.length === 0 ? (
        <EmptyState icon="search" title="No users found" description="Create a new user to get started" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">User</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">2FA</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Last Login</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Created</th>
                  {canWrite && <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-sm font-medium">
                          {u.first_name?.[0]}{u.last_name?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{u.first_name} {u.last_name}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <Shield size={14} className="text-gray-400" />
                        <span className="text-sm text-gray-700">{u.role_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={u.status} /></td>
                    <td className="px-5 py-3">
                      <span className={`text-sm ${u.totp_enabled ? 'text-success-600' : 'text-gray-400'}`}>
                        {u.totp_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                    {canWrite && (
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          {u.status === 'ACTIVE' && (
                            <button onClick={() => handleStatusChange(u.id, `${u.first_name} ${u.last_name}`, 'lock')} title="Lock user"
                              className="p-1.5 text-gray-400 hover:text-warning-600 hover:bg-warning-50 rounded">
                              <Lock size={14} />
                            </button>
                          )}
                          {u.status === 'LOCKED' && (
                            <button onClick={() => handleStatusChange(u.id, `${u.first_name} ${u.last_name}`, 'unlock')} title="Unlock user"
                              className="p-1.5 text-gray-400 hover:text-success-600 hover:bg-success-50 rounded">
                              <Unlock size={14} />
                            </button>
                          )}
                          {u.status === 'ACTIVE' && (
                            <button onClick={() => handleStatusChange(u.id, `${u.first_name} ${u.last_name}`, 'INACTIVE')} title="Disable user"
                              className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded">
                              <X size={14} />
                            </button>
                          )}
                          {u.status === 'INACTIVE' && (
                            <button onClick={() => handleStatusChange(u.id, `${u.first_name} ${u.last_name}`, 'ACTIVE')} title="Enable user"
                              className="p-1.5 text-gray-400 hover:text-success-600 hover:bg-success-50 rounded">
                              <Edit2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
              <span className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => fetchUsers(pagination.page - 1)} disabled={pagination.page <= 1}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
                <button onClick={() => fetchUsers(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={18} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm Status Change Modal */}
      <ConfirmModal
        open={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, userId: null, userName: '', action: '', loading: false })}
        onConfirm={handleConfirmStatusChange}
        title={confirmModal.action === 'lock' ? 'Lock User' : confirmModal.action === 'unlock' ? 'Unlock User' : confirmModal.action === 'INACTIVE' ? 'Disable User' : 'Enable User'}
        message={`Are you sure you want to ${confirmModal.action === 'lock' ? 'lock' : confirmModal.action === 'unlock' ? 'unlock' : confirmModal.action === 'INACTIVE' ? 'disable' : 'enable'} ${confirmModal.userName}?`}
        confirmText={confirmModal.action === 'lock' ? 'Lock' : confirmModal.action === 'unlock' ? 'Unlock' : confirmModal.action === 'INACTIVE' ? 'Disable' : 'Enable'}
        cancelText="Cancel"
        variant={confirmModal.action === 'INACTIVE' ? 'danger' : 'warning'}
        loading={confirmModal.loading}
      />
    </div>
  );
}
