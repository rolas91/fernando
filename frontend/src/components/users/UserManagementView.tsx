import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppContext } from '@/contexts/AppContext';
import { UserProfile, UserRole, Worker } from '@/lib/types';
import {
  Users,
  Plus,
  Search,
  Shield,
  Mail,
  Phone,
  MoreVertical,
  Edit2,
  Trash2,
  Archive,
  RotateCcw,
  Key,
  Check,
  AlertCircle,
  Loader2,
  X,
  UserPlus,
  Clock,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_PREFIX = '/api';

function getAuthToken() {
  return (
    localStorage.getItem('auth_token') || localStorage.getItem('dr_auth_token')
  );
}

async function userRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options?.headers as Record<string, string> | undefined) || {}),
    },
  });
  if (!res.ok) {
    let message = `Auth API error ${res.status}`;
    try {
      const body = await res.json();
      const detail = Array.isArray(body?.message)
        ? body.message.join(', ')
        : body?.message || body?.error;
      if (detail) message = String(detail);
    } catch {}
    throw new Error(message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

const UserManagementView: React.FC<{ embedded?: boolean }> = ({
  embedded = false,
}) => {
  const { user: currentUser, hasPermission } = useAuth();
  const { workers } = useAppContext();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState<
    'create' | 'edit' | 'reset' | null
  >(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [actionMenuUser, setActionMenuUser] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await userRequest<UserProfile[]>('/users');
      setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = users.filter((u) => {
    const matchesSearch = `${u.firstName} ${u.lastName} ${u.email}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const existingUserEmailsLower = useMemo(
    () =>
      new Set(users.map((u) => u.email.trim().toLowerCase()).filter(Boolean)),
    [users],
  );

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      setFeedback({
        type: 'error',
        message: 'You cannot delete your own account',
      });
      return;
    }
    if (
      !confirm(
        'Are you sure you want to delete this user? This action cannot be undone.',
      )
    )
      return;

    const data = await userRequest<{ success: boolean }>(`/users/${userId}`, {
      method: 'DELETE',
    });
    if (data?.success) {
      setFeedback({ type: 'success', message: 'User deleted successfully' });
      fetchUsers();
    } else {
      setFeedback({ type: 'error', message: 'Failed to delete user' });
    }
    setActionMenuUser(null);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleArchiveUser = async (
    userId: string,
    newStatus: 'active' | 'archived',
  ) => {
    if (userId === currentUser?.id) {
      setFeedback({
        type: 'error',
        message: 'You cannot archive your own account',
      });
      return;
    }

    const data = await userRequest<UserProfile>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    if (data?.id) {
      setFeedback({
        type: 'success',
        message: `User ${newStatus === 'archived' ? 'archived' : 'restored'} successfully`,
      });
      fetchUsers();
    } else {
      setFeedback({ type: 'error', message: 'Failed to update user' });
    }
    setActionMenuUser(null);
    setTimeout(() => setFeedback(null), 4000);
  };

  const roleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-700';
      case 'manager':
        return 'bg-blue-100 text-blue-700';
      case 'scheduler':
        return 'bg-green-100 text-green-700';
      case 'viewer':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'inactive':
        return 'bg-yellow-100 text-yellow-700';
      case 'archived':
        return 'bg-gray-100 text-gray-500';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (!hasPermission('admin')) {
    return (
      <div className="p-3 sm:p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield size={48} className="text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-500">Only administrators can manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'p-6'}>
      {!embedded ? (
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              User Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {users.length} total users
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedUser(null);
              setShowModal('create');
            }}
            className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
          >
            <UserPlus size={16} /> Add User
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">System users</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {users.length} login{users.length === 1 ? '' : 's'}. Optionally
              pre-fill from a worker on create.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedUser(null);
              setShowModal('create');
            }}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-2 shrink-0"
          >
            <UserPlus size={16} /> Add User
          </button>
        </div>
      )}

      {}
      {feedback && (
        <div
          className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            feedback.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          {feedback.message}
        </div>
      )}

      {}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center bg-gray-100 rounded-lg px-3 py-2 flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="text-gray-400 mr-2" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-sm outline-none w-full placeholder-gray-400"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="scheduler">Schedule</option>
          <option value="viewer">Viewer</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {}
      <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : (
          <div
            className="responsive-table"
            role="region"
            aria-label="Table data"
            tabIndex={0}
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    User
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Email
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Role
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Last Login
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                            u.role === 'admin'
                              ? 'bg-red-500'
                              : u.role === 'manager'
                                ? 'bg-blue-500'
                                : u.role === 'scheduler'
                                  ? 'bg-green-500'
                                  : 'bg-gray-400'
                          }`}
                        >
                          {u.firstName[0]}
                          {u.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {u.firstName} {u.lastName}
                            {u.id === currentUser?.id && (
                              <span className="text-xs text-primary ml-2">
                                (You)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {u.phone || 'No phone'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${roleBadge(u.role)}`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusBadge(u.status)}`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {u.lastLogin
                        ? new Date(u.lastLogin).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right relative">
                      <button
                        onClick={() =>
                          setActionMenuUser(
                            actionMenuUser === u.id ? null : u.id,
                          )
                        }
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical size={16} className="text-gray-400" />
                      </button>
                      {actionMenuUser === u.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setActionMenuUser(null)}
                          />
                          <div className="absolute right-4 top-12 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50 py-1">
                            <button
                              onClick={() => {
                                setSelectedUser(u);
                                setShowModal('edit');
                                setActionMenuUser(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Edit2 size={14} /> Edit User
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUser(u);
                                setShowModal('reset');
                                setActionMenuUser(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Key size={14} /> Reset Password
                            </button>
                            {u.status === 'active' ? (
                              <button
                                onClick={() =>
                                  handleArchiveUser(u.id, 'archived')
                                }
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-yellow-700 hover:bg-yellow-50"
                              >
                                <Archive size={14} /> Archive
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  handleArchiveUser(u.id, 'active')
                                }
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                              >
                                <RotateCcw size={14} /> Restore
                              </button>
                            )}
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={14} /> Delete User
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-500">
                      No users found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {}
      {(showModal === 'create' || showModal === 'edit') && (
        <UserFormModal
          workersCatalog={workers}
          existingUserEmailsLower={existingUserEmailsLower}
          user={selectedUser}
          mode={showModal}
          onClose={() => {
            setShowModal(null);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            setShowModal(null);
            setSelectedUser(null);
            fetchUsers();
            setFeedback({
              type: 'success',
              message:
                showModal === 'create'
                  ? 'User created successfully'
                  : 'User updated successfully',
            });
            setTimeout(() => setFeedback(null), 4000);
          }}
        />
      )}

      {}
      {showModal === 'reset' && selectedUser && (
        <ResetPasswordModal
          user={selectedUser}
          onClose={() => {
            setShowModal(null);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            setShowModal(null);
            setSelectedUser(null);
            setFeedback({
              type: 'success',
              message: 'Password reset successfully',
            });
            setTimeout(() => setFeedback(null), 4000);
          }}
        />
      )}
    </div>
  );
};

const UserFormModal: React.FC<{
  user: UserProfile | null;
  mode: 'create' | 'edit';
  workersCatalog: Worker[];
  existingUserEmailsLower: Set<string>;
  onClose: () => void;
  onSuccess: () => void;
}> = ({
  user,
  mode,
  workersCatalog,
  existingUserEmailsLower,
  onClose,
  onSuccess,
}) => {
  const workersForPrefill = useMemo(() => {
    const list = [...workersCatalog]
      .filter((w) => (w.email || '').trim())
      .filter((w) => !existingUserEmailsLower.has(w.email.trim().toLowerCase()))
      .filter((w) => w.status !== 'archived')
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        ),
      );
    return list;
  }, [workersCatalog, existingUserEmailsLower]);

  const [presetWorkerId, setPresetWorkerId] = useState('');

  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    role: (user?.role || 'viewer') as UserRole,
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const body: any = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      role: form.role,
    };

    if (mode === 'create') {
      if (!form.password || form.password.length < 6) {
        setError('Password must be at least 6 characters');
        setSaving(false);
        return;
      }
      body.password = form.password;
    }

    const data =
      mode === 'create'
        ? await userRequest<UserProfile>('/users', {
            method: 'POST',
            body: JSON.stringify(body),
          })
        : await userRequest<UserProfile>(`/users/${user?.id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });

    if (data?.id) {
      onSuccess();
    } else {
      setError('Operation failed');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-800">
            {mode === 'create' ? 'Create New User' : 'Edit User'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-5 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {mode === 'create' && workersForPrefill.length > 0 ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prefill from worker catalog (optional)
              </label>
              <select
                value={presetWorkerId}
                onChange={(event) => {
                  const workerId = event.target.value;
                  setPresetWorkerId(workerId);
                  const wx =
                    workerId !== ''
                      ? workersForPrefill.find((w) => w.id === workerId)
                      : undefined;
                  if (wx) {
                    setForm((current) => ({
                      ...current,
                      firstName: wx.firstName,
                      lastName: wx.lastName,
                      email: wx.email.trim().toLowerCase(),
                      phone: (wx.phone || '').trim(),
                    }));
                  }
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">— Manual entry</option>
                {workersForPrefill.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.firstName} {w.lastName} — {w.email}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-500">
                Shows workers whose email does not yet match any user login.
              </p>
            </div>
          ) : null}

          <div className="responsive-grid grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name *
              </label>
              <input
                required
                value={form.firstName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, firstName: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name *
              </label>
              <input
                required
                value={form.lastName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lastName: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="(555) 000-0000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role *
            </label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as UserRole }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="admin">Admin - Full access</option>
              <option value="manager">Manager - Edit all data</option>
              <option value="scheduler">Schedule - Edit schedules only</option>
              <option value="viewer">Viewer - Read-only</option>
            </select>
          </div>

          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password *
              </label>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Min 6 characters"
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {mode === 'create' ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ResetPasswordModal: React.FC<{
  user: UserProfile;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ user, onClose, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    setError('');

    const data = await userRequest<{ success: boolean }>(
      `/users/${user.id}/reset-password`,
      {
        method: 'POST',
        body: JSON.stringify({
          newPassword,
        }),
      },
    );
    if (data?.success) {
      onSuccess();
    } else {
      setError('Failed to reset password');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-800">
            Reset Password
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Reset password for{' '}
            <strong>
              {user.firstName} {user.lastName}
            </strong>{' '}
            ({user.email})
          </p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password *
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Min 6 characters"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Key size={16} />
              )}
              Reset Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserManagementView;
