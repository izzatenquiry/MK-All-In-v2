import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  getAllAccounts,
  updateAccount,
  deleteAccount,
  markAsSold,
  addAccount,
  type UltraAiAccount,
} from '../../../services/ultraAiSalesService';
import { addFlowAccount, getAllFlowAccounts, updateFlowAccount, type FlowAccount } from '../../../services/flowAccountService';
import { BRAND_CONFIG } from '../../../services/brandConfig';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import ConfirmationModal from '../../common/ConfirmationModal';
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  XIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
  ClipboardIcon,
  RefreshCwIcon,
  DownloadIcon,
  PlusIcon,
  ActivityIcon,
  SendIcon,
  MailIcon,
} from '../../Icons';

interface AccountListViewProps {
  language: Language;
  refreshKey: number;
  onRefresh: () => void;
}

const AccountListView: React.FC<AccountListViewProps> = ({
  language,
  refreshKey,
  onRefresh,
}) => {
  const [accounts, setAccounts] = useState<UltraAiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSoldModalOpen, setIsSoldModalOpen] = useState(false);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<UltraAiAccount | null>(null);
  const [selectedAccountForEdit, setSelectedAccountForEdit] = useState<UltraAiAccount | null>(null);
  const [selectedAccountForActivate, setSelectedAccountForActivate] = useState<UltraAiAccount | null>(null);
  
  // Add account form state
  const [showPassword, setShowPassword] = useState(false);
  const [addAccountLoading, setAddAccountLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addStatus, setAddStatus] = useState<'available' | 'reserved' | 'suspended' | 'expired' | 'new_stock'>('new_stock');
  const [accountType, setAccountType] = useState('ultra_ai');
  const [accountTier, setAccountTier] = useState('');
  const [notes, setNotes] = useState('');
  
  // Sold form
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerContact, setBuyerContact] = useState(''); // Combined: phone @ telegram
  const [buyerNotes, setBuyerNotes] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending');

  // Edit form state
  const [editLoading, setEditLoading] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editBuyerName, setEditBuyerName] = useState('');
  const [editBuyerEmail, setEditBuyerEmail] = useState('');
  const [editBuyerContact, setEditBuyerContact] = useState('');
  const [editBuyerNotes, setEditBuyerNotes] = useState('');
  const [editSaleDate, setEditSaleDate] = useState('');
  const [editSalePrice, setEditSalePrice] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState<'pending' | 'paid' | 'refunded'>('pending');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editStatus, setEditStatus] = useState<'available' | 'reserved' | 'sold' | 'suspended' | 'expired' | 'new_stock' | 'transferred'>('sold');

  // Transfer state
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedAccountForTransfer, setSelectedAccountForTransfer] = useState<UltraAiAccount | null>(null);
  const [transferMode, setTransferMode] = useState<'new' | 'replace'>('new');
  const [selectedFlowAccountCode, setSelectedFlowAccountCode] = useState('');
  const [availableFlowAccounts, setAvailableFlowAccounts] = useState<FlowAccount[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, [refreshKey, statusFilter]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      if (searchTerm) {
        filters.search = searchTerm;
      }
      const data = await getAllAccounts(filters);
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setStatusMessage({ type: 'error', message: 'Failed to fetch accounts' });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchAccounts();
  };

  const handleDelete = async () => {
    if (!selectedAccount) return;
    const result = await deleteAccount(selectedAccount.id);
    if (result.success) {
      setStatusMessage({ type: 'success', message: 'Account deleted successfully' });
      setIsDeleteModalOpen(false);
      setSelectedAccount(null);
      fetchAccounts();
      onRefresh();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', message: result.message || 'Failed to delete account' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleMarkAsSold = async () => {
    if (!selectedAccount || !buyerName || !salePrice) {
      setStatusMessage({ type: 'error', message: 'Buyer name and sale price are required' });
      return;
    }
    // Parse buyerContact: format "phone @ telegram" or just phone/telegram
    let parsedPhone = '';
    let parsedTelegram = '';
    if (buyerContact) {
      const parts = buyerContact.split('@').map(p => p.trim());
      if (parts.length > 1) {
        parsedPhone = parts[0];
        parsedTelegram = parts.slice(1).join('@'); // In case there are multiple @
      } else {
        // If no @, assume it's phone
        parsedPhone = buyerContact;
      }
    }

    const result = await markAsSold(selectedAccount.id, {
      buyer_name: buyerName,
      buyer_email: buyerEmail || undefined,
      buyer_phone: parsedPhone || undefined,
      buyer_telegram: parsedTelegram || undefined,
      buyer_notes: buyerNotes || undefined,
      sale_price: parseFloat(salePrice),
      payment_method: paymentMethod || undefined,
      payment_status: paymentStatus,
    });
    if (result.success) {
      setStatusMessage({ type: 'success', message: 'Account marked as sold successfully' });
      setIsSoldModalOpen(false);
      setSelectedAccount(null);
      resetSoldForm();
      fetchAccounts();
      onRefresh();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', message: result.message || 'Failed to mark as sold' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const resetSoldForm = () => {
    setBuyerName('');
    setBuyerEmail('');
    setBuyerContact('');
    setBuyerNotes('');
    setSalePrice('');
    setPaymentMethod('');
    setPaymentStatus('pending');
  };

  const handleAddAccount = async () => {
    if (!email.trim()) {
      setStatusMessage({ type: 'error', message: 'Email is required' });
      return;
    }

    setAddAccountLoading(true);
    try {
      const result = await addAccount({
        email: email.trim(),
        password: addPassword.trim() || null,
        status: addStatus,
        account_type: accountType,
        account_tier: accountTier || null,
        notes: notes.trim() || null,
      });

      if (result.success) {
        setStatusMessage({ type: 'success', message: 'Account added successfully' });
        resetAddAccountForm();
        setIsAddAccountModalOpen(false);
        fetchAccounts();
        onRefresh();
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', message: result.message || 'Failed to add account' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while adding account' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setAddAccountLoading(false);
    }
  };

  const resetAddAccountForm = () => {
    setEmail('');
    setAddPassword('');
    setAddStatus('new_stock');
    setAccountType('ultra_ai');
    setAccountTier('');
    setNotes('');
  };

  const handleActivateAccount = (account: UltraAiAccount) => {
    setSelectedAccountForActivate(account);
    setIsActivateModalOpen(true);
  };

  const handleLoginGmail = () => {
    if (selectedAccountForActivate) {
      // Open Gmail in new window
      window.open('https://gmail.com', '_blank', 'noopener,noreferrer');
    }
  };

  const handleDoneActivate = async () => {
    if (!selectedAccountForActivate) return;

    const result = await updateAccount(selectedAccountForActivate.id, {
      status: 'available',
    });

    if (result.success) {
      setStatusMessage({ type: 'success', message: 'Account activated successfully. Status changed to Available.' });
      setIsActivateModalOpen(false);
      setSelectedAccountForActivate(null);
      fetchAccounts();
      onRefresh();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', message: result.message || 'Failed to activate account' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedAccountForEdit) return;

    // Parse buyerContact: format "phone @ telegram"
    let parsedPhone = '';
    let parsedTelegram = '';
    if (editBuyerContact) {
      const parts = editBuyerContact.split('@').map(p => p.trim());
      if (parts.length > 1) {
        parsedPhone = parts[0];
        parsedTelegram = parts.slice(1).join('@');
      } else {
        parsedPhone = editBuyerContact;
      }
    }

    setEditLoading(true);
    try {
      const updates: any = {
        password: editPassword || null,
        buyer_name: editBuyerName || null,
        buyer_email: editBuyerEmail || null,
        buyer_phone: parsedPhone || null,
        buyer_telegram: parsedTelegram || null,
        buyer_notes: editBuyerNotes || null,
        sale_date: editSaleDate ? new Date(editSaleDate).toISOString() : null,
        sale_price: editSalePrice ? parseFloat(editSalePrice) : null,
        payment_method: editPaymentMethod || null,
        payment_status: editPaymentStatus || null,
        expiry_date: editExpiryDate ? new Date(editExpiryDate).toISOString() : null,
        status: editStatus,
      };

      const result = await updateAccount(selectedAccountForEdit.id, updates);

      if (result.success) {
        setStatusMessage({ type: 'success', message: 'Account updated successfully' });
        setIsEditModalOpen(false);
        setSelectedAccountForEdit(null);
        fetchAccounts();
        onRefresh();
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', message: result.message || 'Failed to update account' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while updating account' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setEditLoading(false);
    }
  };

  // Generate next available code for Flow Account
  const generateNextCode = async (): Promise<string> => {
    const existingAccounts = await getAllFlowAccounts();
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

  const handleOpenTransferModal = async (account: UltraAiAccount) => {
    if (!account.email || !account.password) {
      setStatusMessage({ type: 'error', message: 'Email and password are required to transfer account' });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    setSelectedAccountForTransfer(account);
    setTransferMode('new');
    setSelectedFlowAccountCode('');
    
    // Fetch available flow accounts untuk dropdown
    const flowAccounts = await getAllFlowAccounts();
    setAvailableFlowAccounts(flowAccounts);
    
    setIsTransferModalOpen(true);
  };

  const handleTransferWithNewCode = async () => {
    if (!selectedAccountForTransfer) return;
    
    setTransferLoading(true);
    try {
      const code = await generateNextCode();
      const result = await addFlowAccount(
        selectedAccountForTransfer.email,
        selectedAccountForTransfer.password || '',
        code
      );

      if (result.success) {
        const updateResult = await updateAccount(selectedAccountForTransfer.id, {
          status: 'transferred',
        });
        
        if (updateResult.success) {
          setStatusMessage({ 
            type: 'success', 
            message: `Account transferred with new code ${code}. Status changed to Transferred.` 
          });
          setIsTransferModalOpen(false);
          setSelectedAccountForTransfer(null);
          await fetchAccounts();
          onRefresh();
          setTimeout(() => setStatusMessage(null), 3000);
        } else {
          setStatusMessage({ 
            type: 'error', 
            message: `Account transferred with code ${code}, but failed to update status: ${updateResult.message}` 
          });
          await fetchAccounts();
          onRefresh();
          setTimeout(() => setStatusMessage(null), 5000);
        }
      } else {
        setStatusMessage({ type: 'error', message: result.message || 'Failed to transfer account' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while transferring account' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setTransferLoading(false);
    }
  };

  const handleTransferReplaceEmail = async () => {
    if (!selectedAccountForTransfer || !selectedFlowAccountCode) {
      setStatusMessage({ type: 'error', message: 'Please select a flow account code' });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    setTransferLoading(true);
    try {
      // Find flow account by code
      const flowAccount = availableFlowAccounts.find(acc => acc.code === selectedFlowAccountCode);
      
      if (!flowAccount) {
        setStatusMessage({ type: 'error', message: 'Flow account not found' });
        setTimeout(() => setStatusMessage(null), 5000);
        return;
      }

      // Update flow account email
      const result = await updateFlowAccount(flowAccount.id, {
        email: selectedAccountForTransfer.email,
        password: selectedAccountForTransfer.password || undefined,
      });

      if (result.success) {
        const updateResult = await updateAccount(selectedAccountForTransfer.id, {
          status: 'transferred',
        });
        
        if (updateResult.success) {
          setStatusMessage({ 
            type: 'success', 
            message: `Account transferred to existing flow account ${selectedFlowAccountCode}. Email replaced. Status changed to Transferred.` 
          });
          setIsTransferModalOpen(false);
          setSelectedAccountForTransfer(null);
          setSelectedFlowAccountCode('');
          await fetchAccounts();
          onRefresh();
          setTimeout(() => setStatusMessage(null), 3000);
        } else {
          setStatusMessage({ 
            type: 'error', 
            message: `Email replaced in flow account ${selectedFlowAccountCode}, but failed to update status: ${updateResult.message}` 
          });
          await fetchAccounts();
          onRefresh();
          setTimeout(() => setStatusMessage(null), 5000);
        }
      } else {
        setStatusMessage({ type: 'error', message: result.message || 'Failed to replace email' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while replacing email' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setTransferLoading(false);
    }
  };

  const togglePasswordVisibility = (accountId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [accountId]: !prev[accountId],
    }));
  };

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setStatusMessage({ type: 'success', message: 'Email copied to clipboard!' });
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
      setStatusMessage({ type: 'error', message: 'Failed to copy email' });
      setTimeout(() => setStatusMessage(null), 2000);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { text: string; color: string }> = {
      available: { text: 'Available', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
      reserved: { text: 'Reserved', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
      sold: { text: 'Sold', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
      transferred: { text: 'Transferred', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
      suspended: { text: 'Suspended', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
      expired: { text: 'Expired', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300' },
      new_stock: { text: 'New Stock', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
    };
    const config = statusConfig[status] || { text: status, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const getPaymentStatusBadge = (status?: string | null) => {
    if (!status) return null;
    const config: Record<string, { text: string; color: string }> = {
      pending: { text: 'Pending', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
      paid: { text: 'Paid', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
      refunded: { text: 'Refunded', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
    };
    const badge = config[status] || { text: status, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString.substring(0, 10);
    }
  };

  const formatCurrency = (amount?: number | null) => {
    if (!amount) return '-';
    return `RM ${amount.toFixed(2)}`;
  };

  const filteredAccounts = useMemo(() => {
    if (!searchTerm) return accounts;
    const search = searchTerm.toLowerCase();
    return accounts.filter(account =>
      account.email.toLowerCase().includes(search) ||
      account.buyer_name?.toLowerCase().includes(search) ||
      account.buyer_email?.toLowerCase().includes(search)
    );
  }, [accounts, searchTerm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2 text-neutral-900 dark:text-white">Account List</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Total: <strong>{accounts.length}</strong> accounts
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsAddAccountModalOpen(true)}
              className="flex items-center gap-2 bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add Account
            </button>
            <button
              onClick={fetchAccounts}
              className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              <RefreshCwIcon className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by email, buyer name, or buyer email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="new_stock">New Stock</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="sold">Sold</option>
            <option value="transferred">Transferred</option>
            <option value="suspended">Suspended</option>
            <option value="expired">Expired</option>
          </select>
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

      {/* Accounts Table */}
      {filteredAccounts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Email</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Status</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Buyer</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Sale Date</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Expiry Date</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Price</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Payment</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => (
                <tr key={account.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900 dark:text-white">{account.email}</span>
                      <button
                        onClick={() => handleCopyEmail(account.email)}
                        className="text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
                        title="Copy email"
                      >
                        <ClipboardIcon className="w-4 h-4" />
                      </button>
                    </div>
                    {account.password && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                          {showPasswords[account.id] ? account.password : '••••••••'}
                        </span>
                        <button
                          onClick={() => togglePasswordVisibility(account.id)}
                          className="text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
                        >
                          {showPasswords[account.id] ? (
                            <EyeOffIcon className="w-4 h-4" />
                          ) : (
                            <EyeIcon className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="p-3">{getStatusBadge(account.status)}</td>
                  <td className="p-3">
                    {account.buyer_name ? (
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-white">{account.buyer_name}</div>
                        {account.buyer_email && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">{account.buyer_email}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">{formatDate(account.sale_date)}</td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">{formatDate(account.expiry_date)}</td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">{formatCurrency(account.sale_price)}</td>
                  <td className="p-3">{getPaymentStatusBadge(account.payment_status)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {account.status === 'new_stock' && (
                        <button
                          onClick={() => handleActivateAccount(account)}
                          className="p-1.5 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded transition-colors"
                          title="Activate Account (Opens Gmail)"
                        >
                          <ActivityIcon className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSelectedAccountForEdit(account);
                          // Initialize form dengan existing data
                          setEditPassword(account.password || '');
                          setShowEditPassword(false);
                          setEditBuyerName(account.buyer_name || '');
                          setEditBuyerEmail(account.buyer_email || '');
                          // Combine phone @ telegram
                          const contact = account.buyer_phone && account.buyer_telegram 
                            ? `${account.buyer_phone} @ ${account.buyer_telegram}`
                            : account.buyer_phone || account.buyer_telegram || '';
                          setEditBuyerContact(contact);
                          setEditBuyerNotes(account.buyer_notes || '');
                          setEditSaleDate(account.sale_date ? account.sale_date.split('T')[0] : '');
                          setEditSalePrice(account.sale_price?.toString() || '');
                          setEditPaymentMethod(account.payment_method || '');
                          setEditPaymentStatus((account.payment_status as 'pending' | 'paid' | 'refunded') || 'pending');
                          setEditExpiryDate(account.expiry_date ? account.expiry_date.split('T')[0] : '');
                          setEditStatus(account.status);
                          setIsEditModalOpen(true);
                        }}
                        className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded transition-colors"
                        title="Edit Account"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      {account.status !== 'sold' && account.status !== 'new_stock' && (
                        <button
                          onClick={() => {
                            setSelectedAccount(account);
                            setIsSoldModalOpen(true);
                          }}
                          className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50 rounded transition-colors"
                          title="Mark as sold"
                        >
                          <CheckCircleIcon className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenTransferModal(account)}
                        className="p-1.5 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/50 rounded transition-colors"
                        title="Transfer to Flow Account Management"
                      >
                        <SendIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedAccount(account);
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-colors"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-neutral-500 dark:text-neutral-400">No accounts found</p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedAccount && createPortal(
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onCancel={() => {
            setIsDeleteModalOpen(false);
            setSelectedAccount(null);
          }}
          onConfirm={handleDelete}
          title="Delete Account"
          message={`Are you sure you want to delete account ${selectedAccount.email}? This action cannot be undone.`}
          confirmText="Delete"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          language={language}
        />,
        document.body
      )}

      {/* Mark as Sold Modal */}
      {isSoldModalOpen && selectedAccount && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Mark as Sold</h3>
                <button
                  onClick={() => {
                    setIsSoldModalOpen(false);
                    setSelectedAccount(null);
                    resetSoldForm();
                  }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Account Email
                  </label>
                  <input
                    type="text"
                    value={selectedAccount.email}
                    disabled
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Buyer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Buyer Email
                  </label>
                  <input
                    type="email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Buyer Phone @ Telegram
                  </label>
                  <input
                    type="text"
                    value={buyerContact}
                    onChange={(e) => setBuyerContact(e.target.value)}
                    placeholder="e.g., 0123456789 @ username"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    Format: phone @ telegram (optional)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Sale Price (RM) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="">Select payment method</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="ewallet">E-Wallet</option>
                    <option value="monoklix">Monoklix.com</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Payment Status
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as 'pending' | 'paid')}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Notes
                  </label>
                  <textarea
                    value={buyerNotes}
                    onChange={(e) => setBuyerNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setIsSoldModalOpen(false);
                    setSelectedAccount(null);
                    resetSoldForm();
                  }}
                  className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkAsSold}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Mark as Sold
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Account Modal */}
      {isEditModalOpen && selectedAccountForEdit && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Edit Account</h3>
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedAccountForEdit(null);
                  }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Account Email (readonly) */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Account Email
                  </label>
                  <input
                    type="text"
                    value={selectedAccountForEdit.email}
                    disabled
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Password (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    />
                    <button
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                      type="button"
                    >
                      {showEditPassword ? (
                        <EyeOffIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="new_stock">New Stock</option>
                    <option value="available">Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="sold">Sold</option>
                    <option value="transferred">Transferred</option>
                    <option value="suspended">Suspended</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>

                {/* Buyer Information */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Buyer Name
                  </label>
                  <input
                    type="text"
                    value={editBuyerName}
                    onChange={(e) => setEditBuyerName(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Buyer Email
                  </label>
                  <input
                    type="email"
                    value={editBuyerEmail}
                    onChange={(e) => setEditBuyerEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Buyer Phone @ Telegram
                  </label>
                  <input
                    type="text"
                    value={editBuyerContact}
                    onChange={(e) => setEditBuyerContact(e.target.value)}
                    placeholder="e.g., 0123456789 @ username"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                      Sale Date
                    </label>
                    <input
                      type="date"
                      value={editSaleDate}
                      onChange={(e) => setEditSaleDate(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                      Expiry Date
                    </label>
                    <input
                      type="date"
                      value={editExpiryDate}
                      onChange={(e) => setEditExpiryDate(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Sale Price (RM)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editSalePrice}
                    onChange={(e) => setEditSalePrice(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                      Payment Method
                    </label>
                    <select
                      value={editPaymentMethod}
                      onChange={(e) => setEditPaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    >
                      <option value="">Select payment method</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="ewallet">E-Wallet</option>
                      <option value="monoklix">Monoklix.com</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                      Payment Status
                    </label>
                    <select
                      value={editPaymentStatus}
                      onChange={(e) => setEditPaymentStatus(e.target.value as 'pending' | 'paid' | 'refunded')}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Notes
                  </label>
                  <textarea
                    value={editBuyerNotes}
                    onChange={(e) => setEditBuyerNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedAccountForEdit(null);
                  }}
                  className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editLoading}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {editLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Activate Account Confirmation Modal */}
      {isActivateModalOpen && selectedAccountForActivate && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Activate Account</h3>
                <button
                  onClick={() => {
                    setIsActivateModalOpen(false);
                    setSelectedAccountForActivate(null);
                  }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6">
                <p className="text-neutral-700 dark:text-neutral-300 mb-2">
                  Account: <span className="font-medium">{selectedAccountForActivate.email}</span>
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Please login to Gmail first, then click "Done Activate" to change the status to Available.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsActivateModalOpen(false);
                    setSelectedAccountForActivate(null);
                  }}
                  className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLoginGmail}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <MailIcon className="w-5 h-5" />
                  Login Gmail
                </button>
                <button
                  onClick={handleDoneActivate}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircleIcon className="w-5 h-5" />
                  Done Activate
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Transfer Account Modal */}
      {isTransferModalOpen && selectedAccountForTransfer && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Transfer Account</h3>
                <button
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setSelectedAccountForTransfer(null);
                    setSelectedFlowAccountCode('');
                  }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-neutral-700 dark:text-neutral-300 mb-2">
                  Account: <span className="font-medium">{selectedAccountForTransfer.email}</span>
                </p>
              </div>

              {/* Transfer Mode Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
                  Transfer Mode
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setTransferMode('new');
                      setSelectedFlowAccountCode('');
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      transferMode === 'new'
                        ? 'bg-primary-600 text-white'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    Transfer with New Code
                  </button>
                  <button
                    onClick={() => {
                      setTransferMode('replace');
                      setSelectedFlowAccountCode('');
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      transferMode === 'replace'
                        ? 'bg-primary-600 text-white'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    Replace Email (Existing Code)
                  </button>
                </div>
              </div>

              {/* New Code Mode */}
              {transferMode === 'new' && (
                <div className="mb-4">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    A new code will be auto-generated ({BRAND_CONFIG.name === 'ESAIE' ? 'E1, E2, etc.' : 'G1, G2, etc.'})
                  </p>
                </div>
              )}

              {/* Replace Email Mode */}
              {transferMode === 'replace' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Select Flow Account Code
                  </label>
                  <select
                    value={selectedFlowAccountCode}
                    onChange={(e) => setSelectedFlowAccountCode(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="">Select flow account code</option>
                    {availableFlowAccounts.map(acc => (
                      <option key={acc.id} value={acc.code}>
                        {acc.code} - {acc.email} ({acc.current_users_count}/10 users)
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    This will replace the email in the selected flow account
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setSelectedAccountForTransfer(null);
                    setSelectedFlowAccountCode('');
                  }}
                  className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={transferMode === 'new' ? handleTransferWithNewCode : handleTransferReplaceEmail}
                  disabled={transferLoading || (transferMode === 'replace' && !selectedFlowAccountCode)}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {transferLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Transferring...
                    </>
                  ) : (
                    transferMode === 'new' ? 'Transfer with New Code' : 'Replace Email'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Account Modal */}
      {isAddAccountModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Add Account</h3>
                <button
                  onClick={() => {
                    setIsAddAccountModalOpen(false);
                    resetAddAccountForm();
                  }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Password (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={addPassword}
                      onChange={(e) => setAddPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                      type="button"
                    >
                      {showPassword ? (
                        <EyeOffIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                      Status
                    </label>
                    <select
                      value={addStatus}
                      onChange={(e) => setAddStatus(e.target.value as any)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    >
                      <option value="new_stock">New Stock</option>
                      <option value="available">Available</option>
                      <option value="reserved">Reserved</option>
                      <option value="suspended">Suspended</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                      Account Type
                    </label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    >
                      <option value="ultra_ai">ULTRA AI</option>
                      <option value="premium">Premium</option>
                      <option value="basic">Basic</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Account Tier (Optional)
                  </label>
                  <input
                    type="text"
                    value={accountTier}
                    onChange={(e) => setAccountTier(e.target.value)}
                    placeholder="e.g., basic, pro, enterprise"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Additional notes..."
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setIsAddAccountModalOpen(false);
                    resetAddAccountForm();
                  }}
                  className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAccount}
                  disabled={addAccountLoading || !email.trim()}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {addAccountLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-4 h-4" />
                      Add Account
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AccountListView;

