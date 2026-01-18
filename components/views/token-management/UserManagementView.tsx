import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getAllUsers, removeUser, updateUserStatus, forceUserLogout, updateUserSubscription, saveUserPersonalAuthToken, updateUserBatch02 } from '../../../services/userService';
import { BRAND_CONFIG } from '../../../services/brandConfig';
import { supabase } from '../../../services/supabaseClient';
import { type User, type Language, type UserStatus } from '../../../types';
import { getAllFlowAccounts, assignFlowCodeToUserByEmail, resetEmailCodeFromUser, type FlowAccount } from '../../../services/flowAccountService';
import { getAllTokenUltraRegistrations, type TokenUltraRegistrationWithUser } from '../../../services/tokenUltraService';
import { getBackendApiRequests, getBackendCookies, grabCookie } from '../../../services/tokenBackendService';
import Spinner from '../../common/Spinner';
import ConfirmationModal from '../../common/ConfirmationModal';
import { UsersIcon, TrashIcon, PencilIcon, CheckCircleIcon, XIcon, AlertTriangleIcon, KeyIcon, PlusIcon, DatabaseIcon } from '../../Icons';

interface UserManagementViewProps {
  language: Language;
}

interface EnhancedUser extends User {
  registered_at?: string;
  expires_at?: string;
  usage_count?: number;
  cookie_status?: 'good' | 'warning' | 'expired' | 'missing';
  flow_account_email?: string;
  total_cookie_count?: number;
  missing_email?: boolean;
  registration?: TokenUltraRegistrationWithUser;
  app_version?: string;
  last_device?: string;
  proxy_server?: string;
  personal_auth_token?: string;
  last_seen_at?: string;
  batch_02?: string;
}

const UserManagementView: React.FC<UserManagementViewProps> = ({ language }) => {
  const [users, setUsers] = useState<EnhancedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'good' | 'needs_attention' | 'none'>('all');
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isConfirmLogoutOpen, setIsConfirmLogoutOpen] = useState(false);
  const [isConfirmRemoveOpen, setIsConfirmRemoveOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState<EnhancedUser | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [addUserLoading, setAddUserLoading] = useState(false);
  
  const [newStatus, setNewStatus] = useState<UserStatus>('trial');
  const [personalToken, setPersonalToken] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'loading'; message: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const supabaseUsers = await getAllUsers();
      if (supabaseUsers) {
        setUsers(supabaseUsers as EnhancedUser[]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleForceLogout = async () => {
    if (selectedUser && await forceUserLogout(selectedUser.id)) {
      fetchData();
      setStatusMessage({ type: 'success', message: 'Session terminated.' });
    }
    setIsConfirmLogoutOpen(false);
  };

  const handleRemoveUser = async () => {
    if (selectedUser) {
      const result = await removeUser(selectedUser.id);
      if (result.success) {
        fetchData();
        setStatusMessage({ type: 'success', message: 'User removed.' });
      }
    }
    setIsConfirmRemoveOpen(false);
  };

  const getStatusBadge = (status?: string) => {
    const cls = status === 'good' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-800';
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cls}`}>{status || 'None'}</span>;
  };

  const filteredUsers = useMemo(() => {
    return users.filter(user => 
      (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.username || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  return (
    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm h-full overflow-y-auto">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold">User Management</h2>
        <button onClick={() => setIsAddUserModalOpen(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg flex items-center gap-2">
          <PlusIcon className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="mb-4">
        <input 
          type="text" 
          placeholder="Search users..." 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded-lg dark:bg-neutral-800"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id} className="border-b hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <td className="p-3">{user.email}</td>
                <td className="p-3">{getStatusBadge(user.status)}</td>
                <td className="p-3 flex gap-2">
                  <button onClick={() => { setSelectedUser(user); setEditModalOpen(true); }} className="p-1 text-blue-600"><PencilIcon className="w-4 h-4"/></button>
                  <button onClick={() => { setSelectedUser(user); setDeleteModalOpen(true); }} className="p-1 text-red-600"><TrashIcon className="w-4 h-4"/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editModalOpen && selectedUser && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-neutral-800 p-6 rounded-lg max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Edit User: {selectedUser.email}</h3>
            <div className="space-y-4">
               <button onClick={() => setIsConfirmLogoutOpen(true)} className="w-full py-2 bg-orange-600 text-white rounded">Force Logout</button>
               <button onClick={() => setIsConfirmRemoveOpen(true)} className="w-full py-2 bg-red-600 text-white rounded">Remove User</button>
               <button onClick={() => setEditModalOpen(false)} className="w-full py-2 bg-neutral-200 rounded">Cancel</button>
            </div>
          </div>
        </div>, document.body
      )}

      {isConfirmLogoutOpen && createPortal(
        <ConfirmationModal isOpen={true} title="Force Logout" message="Terminate session?" onConfirm={handleForceLogout} onCancel={() => setIsConfirmLogoutOpen(false)} language={language} />, document.body
      )}

      {isConfirmRemoveOpen && createPortal(
        <ConfirmationModal isOpen={true} title="Remove User" message="Permanently delete user?" onConfirm={handleRemoveUser} onCancel={() => setIsConfirmRemoveOpen(false)} language={language} />, document.body
      )}
    </div>
  );
};

export default UserManagementView;
