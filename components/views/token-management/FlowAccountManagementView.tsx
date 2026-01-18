
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getBackendCookies, grabCookie, type BackendCookie } from '../../../services/tokenBackendService';
import { getAllFlowAccounts, addFlowAccount, updateFlowAccount, removeFlowAccount, type FlowAccount } from '../../../services/flowAccountService';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import { CheckCircleIcon, AlertTriangleIcon, XIcon, KeyIcon, PencilIcon, TrashIcon, RefreshCwIcon, PlusIcon, EyeIcon, EyeOffIcon, ClipboardIcon } from '../../Icons';
import ConfirmationModal from '../../common/ConfirmationModal';
import { BRAND_CONFIG } from '../../../services/brandConfig';

interface FlowAccountManagementViewProps {
  language: Language;
}

const FlowAccountManagementView: React.FC<FlowAccountManagementViewProps> = ({ language }) => {
  const [supabaseAccounts, setSupabaseAccounts] = useState<FlowAccount[]>([]);
  const [cookiesByFolder, setCookiesByFolder] = useState<Record<string, BackendCookie[]>>({});
  const [loading, setLoading] = useState(true);
  const [grabCookieModalOpen, setGrabCookieModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<FlowAccount | null>(null);
  const [grabLoading, setGrabLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Form state
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newCode, setNewCode] = useState('');
  
  // Edit form state
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [selectedSupabaseAccount, setSelectedSupabaseAccount] = useState<FlowAccount | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Helper function to calculate cookie pool info from cookiesByFolder
  const getCookiePoolInfo = (code: string): { cookie_count: number; cookie_pool_status: 'good' | 'needs_more' | 'none' } => {
    const cookies = cookiesByFolder[code] || [];
    const validCookies = cookies.filter(c => c.status === 'good' && c.valid);
    const cookieCount = validCookies.length;
    
    let status: 'good' | 'needs_more' | 'none' = 'none';
    if (cookieCount >= 3) {
      status = 'good';
    } else if (cookieCount >= 1) {
      status = 'needs_more';
    }
    
    return { cookie_count: cookieCount, cookie_pool_status: status };
  };

  // Get next cookie number for flow account
  const getNextCookieNumber = (code: string): number => {
    const cookies = cookiesByFolder[code] || [];
    if (cookies.length === 0) return 1;
    
    // Extract numbers from existing cookies (format: flow_g1_c1.json)
    const numbers: number[] = [];
    cookies.forEach(cookie => {
      const parts = cookie.filename.replace('.json', '').split('_');
      if (parts.length >= 3 && parts[2].startsWith('c')) {
        try {
          const num = parseInt(parts[2].substring(1), 10);
          if (!isNaN(num)) {
            numbers.push(num);
          }
        } catch (e) {
          // Ignore invalid numbers
        }
      }
    });
    
    if (numbers.length === 0) return 1;
    return Math.max(...numbers) + 1;
  };

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const [supabaseData, cookiesData] = await Promise.all([
        getAllFlowAccounts(),
        getBackendCookies(),
      ]);
      setSupabaseAccounts(supabaseData);
      setCookiesByFolder(cookiesData);
    } catch (error) {
      console.error('Error fetching flow accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Generate next available code (E1, E2, E3 for ESAIE or G1, G2, G3 for MONOKLIX)
  const generateNextCode = (existingAccounts: FlowAccount[]): string => {
    const isEsaie = BRAND_CONFIG.name === 'ESAIE';
    const prefix = isEsaie ? 'E' : 'G';
    const regex = new RegExp(`^${prefix}\\d+$`);
    
    const existingCodes = existingAccounts
      .map(acc => acc.code)
      .filter(code => regex.test(code));

    const numbers = existingCodes
      .map(code => {
        const match = code.match(new RegExp(`^${prefix}(\\d+)$`));
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(num => num > 0)
      .sort((a, b) => a - b);

    let nextNumber = 1;
    if (numbers.length > 0) {
      const maxNumber = Math.max(...numbers);
      nextNumber = maxNumber + 1;
      for (let i = 1; i <= maxNumber; i++) {
        if (!numbers.includes(i)) {
          nextNumber = i;
          break;
        }
      }
    }
    return `${prefix}${nextNumber}`;
  };

  useEffect(() => {
    if (isAddModalOpen) {
      const nextCode = generateNextCode(supabaseAccounts);
      setNewCode(nextCode);
    }
  }, [isAddModalOpen, supabaseAccounts]);

  const handleAddAccount = async () => {
    if (!newEmail.trim() || !newPassword.trim()) {
      setStatusMessage({ type: 'error', message: 'Please fill in email and password' });
      return;
    }

    const codeToUse = newCode.trim() || generateNextCode(supabaseAccounts);
    const result = await addFlowAccount(newEmail, newPassword, codeToUse);
    
    if (result.success) {
      setStatusMessage({ type: 'success', message: `Flow account added successfully with code ${codeToUse}` });
      setIsAddModalOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewCode('');
      fetchAccounts();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      // FIX: Use type assertion to access 'message' on union type.
      setStatusMessage({ type: 'error', message: (result as any).message });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleEditAccount = async () => {
    if (!selectedSupabaseAccount) return;

    if (!editEmail.trim()) {
      setStatusMessage({ type: 'error', message: 'Email is required' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    const updates: { email?: string; password?: string } = {};
    if (editEmail.trim() !== selectedSupabaseAccount.email) {
      updates.email = editEmail.trim();
    }
    if (editPassword.trim() && editPassword.trim() !== selectedSupabaseAccount.password) {
      updates.password = editPassword.trim();
    }

    if (Object.keys(updates).length === 0) {
      setStatusMessage({ type: 'error', message: 'No changes detected' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    const result = await updateFlowAccount(selectedSupabaseAccount.id, updates);
    
    if (result.success) {
      setStatusMessage({ type: 'success', message: 'Flow account updated successfully' });
      setIsEditModalOpen(false);
      setSelectedSupabaseAccount(null);
      setEditEmail('');
      setEditPassword('');
      fetchAccounts();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      // FIX: Use type assertion to access 'message' on union type.
      setStatusMessage({ type: 'error', message: (result as any).message || 'Failed to update account' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleRemoveAccount = async () => {
    if (!selectedSupabaseAccount) return;
    const result = await removeFlowAccount(selectedSupabaseAccount.id);
    
    if (result.success) {
      setStatusMessage({ type: 'success', message: 'Flow account removed successfully' });
      setIsRemoveModalOpen(false);
      setSelectedSupabaseAccount(null);
      fetchAccounts();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', message: result.message || 'Failed to remove account' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleGrabCookie = async () => {
    if (!selectedAccount) return;
    setGrabLoading(true);
    // Get next cookie number for this flow account
    const nextNum = getNextCookieNumber(selectedAccount.code);
    const cookieName = `flow_${selectedAccount.code.toLowerCase()}_c${nextNum}`;
    const result = await grabCookie(cookieName, selectedAccount.email);
    setGrabLoading(false);
    if (result.success) {
      fetchAccounts();
      setGrabCookieModalOpen(false);
      setSelectedAccount(null);
    } else {
      alert(result.error || 'Failed to grab cookie');
    }
  };

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      // Show temporary success feedback
      setStatusMessage({ type: 'success', message: 'Email copied to clipboard!' });
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
      setStatusMessage({ type: 'error', message: 'Failed to copy email' });
      setTimeout(() => setStatusMessage(null), 2000);
    }
  };

  const togglePasswordVisibility = (code: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  const getPoolStatusBadge = (status?: string, count?: number) => {
    if (status === 'good') {
      return (
        <div>
          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded text-xs font-semibold">
            {count || 0} cookies
          </span>
          <div className="text-xs text-green-600 dark:text-green-400 mt-1">Good</div>
        </div>
      );
    } else if (status === 'needs_more') {
      return (
        <div>
          <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 rounded text-xs font-semibold">
            {count || 0} cookie{count !== 1 ? 's' : ''}
          </span>
          <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Needs More</div>
        </div>
      );
    } else {
      return (
        <div>
          <span className="px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 rounded text-xs font-semibold">
            0 cookies
          </span>
          <div className="text-xs text-red-600 dark:text-red-400 mt-1">None</div>
        </div>
      );
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return dateString.substring(0, 10);
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm h-full overflow-y-auto">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-white">Flow Account Management</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Total: <strong>{supabaseAccounts.length}</strong> flow accounts
            </p>
          </div>
          <div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Add Flow Account
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className={`mb-4 p-3 rounded-lg ${
            statusMessage.type === 'success' 
              ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200' 
              : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircleIcon className="w-5 h-5" />
              ) : (
                <XIcon className="w-5 h-5" />
              )}
              <span>{statusMessage.message}</span>
            </div>
          </div>
        )}
      </div>

      {/* Flow Accounts Table */}
      {supabaseAccounts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Code</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Email</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Password</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Assigned Users</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Available Slots</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Cookie Pool</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Created</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {supabaseAccounts.map((account) => {
                const currentUsersCount = account.current_users_count || 0;
                const MAX_USERS = 10; // Hardcoded limit (max_users column doesn't exist in DB)
                const availableSlots = MAX_USERS - currentUsersCount;
                const poolInfo = getCookiePoolInfo(account.code);

                return (
                  <tr
                    key={account.code}
                    className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <td className="p-3">
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-sm font-semibold">
                        {account.code}
                      </span>
                    </td>
                    <td className="p-3">
                      <code className="text-sm text-neutral-900 dark:text-white">{account.email}</code>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300">
                          {showPasswords[account.code] ? account.password : '••••••••'}
                        </span>
                        <button
                          onClick={() => togglePasswordVisibility(account.code)}
                          className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                          title={showPasswords[account.code] ? 'Hide password' : 'Show password'}
                        >
                          {showPasswords[account.code] ? (
                            <EyeOffIcon className="w-4 h-4" />
                          ) : (
                            <EyeIcon className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded text-xs font-semibold cursor-help"
                        title={`Current users: ${currentUsersCount}`}
                      >
                        {currentUsersCount} / {MAX_USERS}
                      </span>
                    </td>
                    <td className="p-3">
                      {availableSlots > 0 ? (
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded text-xs font-semibold">
                          {availableSlots} slots available
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 rounded text-xs font-semibold">
                          Full
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {getPoolStatusBadge(poolInfo.cookie_pool_status, poolInfo.cookie_count)}
                    </td>
                    <td className="p-3">
                      <small className="text-neutral-600 dark:text-neutral-400">
                        {formatDate(account.created_at)}
                      </small>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => fetchAccounts()}
                          className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-xs font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/70"
                          title="Refresh"
                        >
                          <RefreshCwIcon className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAccount(account);
                            setGrabCookieModalOpen(true);
                          }}
                          className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded text-xs font-semibold hover:bg-green-200 dark:hover:bg-green-900/70"
                          title={`Generate General Cookies for ${account.email}`}
                        >
                          <KeyIcon className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSupabaseAccount(account);
                            setEditEmail(account.email);
                            setEditPassword('');
                            setShowEditPassword(false);
                            setIsEditModalOpen(true);
                          }}
                          className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 rounded text-xs font-semibold hover:bg-yellow-200 dark:hover:bg-yellow-900/70"
                          title="Edit Email"
                        >
                          <PencilIcon className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSupabaseAccount(account);
                            setIsRemoveModalOpen(true);
                          }}
                          disabled={currentUsersCount > 0}
                          className="px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 rounded text-xs font-semibold hover:bg-red-200 dark:hover:bg-red-900/70 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={currentUsersCount > 0 ? 'Cannot remove account with active users' : 'Delete'}
                        >
                          <TrashIcon className="w-4 h-4 inline" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
          <div className="text-4xl mb-4">📧</div>
          <h5 className="text-lg font-semibold mb-2">No Flow Accounts</h5>
          <p className="mb-4">No flow accounts in the system yet.</p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 mx-auto"
          >
            <PlusIcon className="w-5 h-5" />
            Add First Flow Account
          </button>
        </div>
      )}

      {/* Add Account Modal */}
      {isAddModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Add Flow Account</h3>
              <button onClick={() => {
                setIsAddModalOpen(false);
                setNewEmail('');
                setNewPassword('');
                setNewCode('');
              }} className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Code (Auto-generated)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={newCode}
                    readOnly
                    className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 font-mono font-semibold text-neutral-600 dark:text-neutral-400 cursor-not-allowed"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Auto</span>
                  </div>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Code will be automatically generated ({BRAND_CONFIG.name === 'ESAIE' ? 'E1, E2, E3' : 'G1, G2, G3'}, etc.) based on existing codes
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-neutral-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddAccount}
                className="flex-1 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
              >
                Add Account
              </button>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewEmail('');
                  setNewPassword('');
                  setNewCode('');
                }}
                className="flex-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Account Modal */}
      {isEditModalOpen && selectedSupabaseAccount && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Edit Flow Account ({selectedSupabaseAccount.code})</h3>
              <button onClick={() => {
                setIsEditModalOpen(false);
                setSelectedSupabaseAccount(null);
                setEditEmail('');
                setEditPassword('');
                setShowEditPassword(false);
              }} className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Code (Read-only)</label>
                <div className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 font-mono font-semibold text-neutral-600 dark:text-neutral-400 cursor-not-allowed">
                  {selectedSupabaseAccount.code}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-neutral-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Password (Leave empty to keep current)</label>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Enter new password (optional)"
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 pr-10 text-neutral-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                  >
                    {showEditPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Leave password empty if you don't want to change it
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleEditAccount}
                className="flex-1 bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-orange-700 transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedSupabaseAccount(null);
                  setEditEmail('');
                  setEditPassword('');
                  setShowEditPassword(false);
                }}
                className="flex-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Remove Confirmation Modal */}
      {/* FIX: Change onClose to onCancel to match ConfirmationModalProps. */}
      {isRemoveModalOpen && selectedSupabaseAccount && (
        <ConfirmationModal
          isOpen={isRemoveModalOpen}
          onCancel={() => {
            setIsRemoveModalOpen(false);
            setSelectedSupabaseAccount(null);
          }}
          onConfirm={handleRemoveAccount}
          title="Remove Flow Account"
          message={`Are you sure you want to remove flow account "${selectedSupabaseAccount.code}" (${selectedSupabaseAccount.email})? This action cannot be undone.`}
          confirmText="Remove"
          cancelText="Cancel"
          confirmButtonClass="bg-red-600"
          language={language}
        />
      )}

      {/* Grab Cookie Modal */}
      {grabCookieModalOpen && selectedAccount && (() => {
        const nextNum = getNextCookieNumber(selectedAccount.code);
        const nextFileName = `flow_${selectedAccount.code.toLowerCase()}_c${nextNum}.json`;
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border-[0.5px] border-neutral-200/80 dark:border-neutral-800/80">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">Grab Cookie for Flow Account</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                Generate general cookies for <span className="inline-flex items-center gap-2">
                  <strong>{selectedAccount.email}</strong>
                  <button
                    onClick={() => handleCopyEmail(selectedAccount.email)}
                    className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                    title="Copy email"
                  >
                    <ClipboardIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </button>
                </span> ({selectedAccount.code}).
              </p>
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-1">Next Cookie Filename:</p>
                <code className="text-sm font-mono text-blue-900 dark:text-blue-100">{nextFileName}</code>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                A browser will open for Google login.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setGrabCookieModalOpen(false);
                    setSelectedAccount(null);
                  }}
                  className="px-4 py-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGrabCookie}
                  disabled={grabLoading}
                  className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {grabLoading ? 'Grabbing...' : 'Grab Cookie'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default FlowAccountManagementView;
