
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom'; // FIX: Import missing createPortal
import { getBackendCookies, uploadCookie, deleteCookie, grabCookie, viewCookie, bulkDeleteCookies, getBackendCookieStatistics, type BackendCookie, type CookieStatistics } from '../../../services/tokenBackendService';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import { UploadIcon, TrashIcon, CheckCircleIcon, AlertTriangleIcon, XIcon, KeyIcon, EyeIcon, RefreshCwIcon, ActivityIcon } from '../../Icons';
import ConfirmationModal from '../../common/ConfirmationModal';
import { BRAND_CONFIG } from '../../../services/brandConfig';

interface CookieManagementViewProps {
  language: Language;
}

const CookieManagementView: React.FC<CookieManagementViewProps> = ({ language }) => {
  const [cookiesByFolder, setCookiesByFolder] = useState<Record<string, BackendCookie[]>>({});
  const [cookieStats, setCookieStats] = useState<CookieStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'good' | 'warning' | 'expired' | 'none'>('all');
  const [usedByFilter, setUsedByFilter] = useState<'all' | 'used' | 'not-used' | 'pool'>('all');
  const [selectedCookies, setSelectedCookies] = useState<Set<string>>(new Set());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [selectedCookie, setSelectedCookie] = useState<BackendCookie | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [grabModalOpen, setGrabModalOpen] = useState(false);
  const [viewCookieModalOpen, setViewCookieModalOpen] = useState(false);
  const [viewCookieContent, setViewCookieContent] = useState<string>('');
  const [viewCookieFilename, setViewCookieFilename] = useState<string>('');
  const [grabCookieName, setGrabCookieName] = useState('');
  const [grabCookieEmail, setGrabCookieEmail] = useState('');
  const [grabLoading, setGrabLoading] = useState(false);
  const [regenerateLoading, setRegenerateLoading] = useState<Record<string, boolean>>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [customUploadName, setCustomUploadName] = useState('');

  useEffect(() => {
    fetchCookies();
  }, []);

  const fetchCookies = async () => {
    setLoading(true);
    setStatsLoading(true);
    try {
      const [cookiesData, statsData] = await Promise.all([
        getBackendCookies(),
        getBackendCookieStatistics().catch(() => null)
      ]);
      setCookiesByFolder(cookiesData);
      setCookieStats(statsData);
    } catch (error) {
      console.error('Error fetching cookies:', error);
    } finally {
      setLoading(false);
      setStatsLoading(false);
    }
  };

  const filteredCookiesByFolder = useMemo(() => {
    const isEsaie = BRAND_CONFIG.name === 'ESAIE';
    const filtered: Record<string, BackendCookie[]> = {};
    Object.entries(cookiesByFolder).forEach(([folderName, cookies]) => {
      const shouldInclude = folderName === 'Root' || 
        (isEsaie && /^E\d+$/i.test(folderName)) || 
        (!isEsaie && /^G\d+$/i.test(folderName));
      if (shouldInclude) filtered[folderName] = cookies;
    });
    return filtered;
  }, [cookiesByFolder]);

  const allCookies = useMemo(() => {
    const cookies: Array<BackendCookie & { folder: string }> = [];
    Object.entries(filteredCookiesByFolder).forEach(([folder, folderCookies]) => {
      folderCookies.forEach(cookie => {
        cookies.push({ ...cookie, folder });
      });
    });
    return cookies;
  }, [filteredCookiesByFolder]);

  const filteredCookies = useMemo(() => {
    return allCookies.filter(cookie => {
      const status = cookie.status || 'none';
      const usedBy = cookie.is_pool_cookie ? 'pool' : (cookie.used_by && cookie.used_by.length > 0 ? 'used' : 'not-used');
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesUsedBy = usedByFilter === 'all' || usedBy === usedByFilter;
      return matchesStatus && matchesUsedBy;
    });
  }, [allCookies, statusFilter, usedByFilter]);

  const usageStatistics = useMemo(() => {
    if (!cookieStats) {
      const total = allCookies.length;
      const totalUsage = allCookies.reduce((sum, cookie) => sum + ((cookie as any).usage_count || 0), 0);
      const average = total > 0 ? totalUsage / total : 0;
      return { total_cookies: total, total_usage: totalUsage, average_usage: average, filtered_cookies: [] };
    }
    const isEsaie = BRAND_CONFIG.name === 'ESAIE';
    const filtered = cookieStats.all_cookies?.filter(cookie => {
      if (!cookie.flow_account || cookie.flow_account === 'Personal') return true;
      const flowAccount = String(cookie.flow_account).toUpperCase();
      return isEsaie ? /^E\d+$/.test(flowAccount) : /^G\d+$/.test(flowAccount);
    }) || [];
    const total_cookies = filtered.length;
    const total_usage = filtered.reduce((sum, c) => sum + (c?.usage_count || 0), 0);
    const average_usage = total_cookies > 0 ? total_usage / total_cookies : 0;
    return { total_cookies, total_usage, average_usage, filtered_cookies: filtered };
  }, [cookieStats, allCookies]);

  const mostUsedCookie = useMemo(() => {
    if (!usageStatistics.filtered_cookies || usageStatistics.filtered_cookies.length === 0) return null;
    const sorted = [...usageStatistics.filtered_cookies].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    return sorted[0] || null;
  }, [usageStatistics]);

  const usageCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (cookieStats?.all_cookies) {
      cookieStats.all_cookies.forEach(cookie => {
        map.set(cookie.filename, cookie.usage_count || 0);
      });
    }
    return map;
  }, [cookieStats]);

  const handleUpload = async () => {
    if (!uploadFile) return;
    const result = await uploadCookie(uploadFile, customUploadName || undefined);
    if (result.success) {
      fetchCookies();
      setUploadModalOpen(false);
      setUploadFile(null);
      setCustomUploadName('');
    } else alert(result.error || 'Upload failed');
  };

  const handleDelete = async () => {
    if (!selectedCookie) return;
    const result = await deleteCookie(selectedCookie.path);
    if (result.success) {
      fetchCookies();
      setDeleteModalOpen(false);
      setSelectedCookie(null);
    } else alert(result.error || 'Delete failed');
  };

  const handleBulkDelete = async () => {
    if (selectedCookies.size === 0) return;
    const result = await bulkDeleteCookies(Array.from(selectedCookies));
    if (result.success) {
      fetchCookies();
      setBulkDeleteModalOpen(false);
      setSelectedCookies(new Set());
    } else alert(result.error || 'Bulk delete failed');
  };

  const handleGrab = async () => {
    if (!grabCookieName.trim()) return;
    setGrabLoading(true);
    const result = await grabCookie(grabCookieName.trim(), grabCookieEmail || undefined);
    setGrabLoading(false);
    if (result.success) {
      fetchCookies();
      setGrabModalOpen(false);
      setGrabCookieName('');
      setGrabCookieEmail('');
    } else alert(result.error || 'Failed to grab cookie');
  };

  const handleViewCookie = async (cookie: BackendCookie) => {
    setViewCookieFilename(cookie.filename);
    setViewCookieContent('Loading...');
    setViewCookieModalOpen(true);
    const result = await viewCookie(cookie.path);
    if (result.success && result.content) setViewCookieContent(JSON.stringify(result.content, null, 2));
    else setViewCookieContent(`Error: ${result.error || 'Failed to load cookie'}`);
  };

  const handleRegenerateCookie = async (cookie: BackendCookie) => {
    const cookieName = cookie.filename.replace(/\.json$/, '');
    setRegenerateLoading(prev => ({ ...prev, [cookie.path]: true }));
    try {
      const result = await grabCookie(cookieName, undefined);
      if (result.success) await fetchCookies();
      else alert(result.error || 'Failed to regenerate cookie');
    } catch (error) {
      alert('Failed to regenerate cookie');
    } finally {
      setRegenerateLoading(prev => ({ ...prev, [cookie.path]: false }));
    }
  };

  const toggleSelectAll = () => {
    if (selectedCookies.size === filteredCookies.length) setSelectedCookies(new Set());
    else setSelectedCookies(new Set(filteredCookies.map(c => c.path)));
  };

  const toggleSelectCookie = (path: string) => {
    const newSelected = new Set(selectedCookies);
    if (newSelected.has(path)) newSelected.delete(path);
    else newSelected.add(path);
    setSelectedCookies(newSelected);
  };

  const totalCookies = Object.values(filteredCookiesByFolder).reduce((sum, cookies) => sum + cookies.length, 0);

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

  return (
    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm h-full overflow-y-auto">
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-white">Cookie Pool Management</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Total: <strong>{totalCookies}</strong> cookies</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setBulkDeleteModalOpen(true)} disabled={selectedCookies.size === 0} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"><TrashIcon className="w-4 h-4" /> Delete ({selectedCookies.size})</button>
            <button onClick={() => setGrabModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"><KeyIcon className="w-4 h-4" /> Grab</button>
            <button onClick={() => setUploadModalOpen(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"><UploadIcon className="w-4 h-4" /> Upload</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-100 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold text-blue-900 dark:text-blue-200">Total Cookies</h3>
          <p className="text-2xl font-bold text-blue-600">{usageStatistics.total_cookies}</p>
        </div>
        <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <h3 className="font-semibold text-green-900 dark:text-green-200">Total Usage</h3>
          <p className="text-2xl font-bold text-green-600">{usageStatistics.total_usage}</p>
        </div>
        <div className="bg-purple-100 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
          <h3 className="font-semibold text-purple-900 dark:text-purple-200">Average Usage</h3>
          <p className="text-2xl font-bold text-green-600">{usageStatistics.average_usage.toFixed(1)}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="text-left p-3"><input type="checkbox" checked={filteredCookies.length > 0 && selectedCookies.size === filteredCookies.length} onChange={toggleSelectAll} className="cursor-pointer" /></th>
              <th className="text-left p-3">File Name</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Usage</th>
              <th className="text-left p-3">Used By</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(filteredCookiesByFolder).map(([folderName, cookies]) => {
              const folderCookies = cookies.filter(cookie => {
                const status = cookie.status || 'missing';
                return statusFilter === 'all' || status === statusFilter;
              });
              if (folderCookies.length === 0) return null;
              return (
                <React.Fragment key={folderName}>
                  <tr className="bg-neutral-100 dark:bg-neutral-800"><td colSpan={6} className="p-3 font-semibold">📁 Folder: {folderName}</td></tr>
                  {folderCookies.map((cookie) => (
                    <tr key={cookie.path} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                      <td className="p-3"><input type="checkbox" checked={selectedCookies.has(cookie.path)} onChange={() => toggleSelectCookie(cookie.path)} className="cursor-pointer" /></td>
                      <td className="p-3"><code>{cookie.filename}</code></td>
                      <td className="p-3">
                        {cookie.status === 'good' && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">Good</span>}
                        {cookie.status === 'warning' && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">Attention</span>}
                        {cookie.status === 'expired' && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">Expired</span>}
                        {(!cookie.status || (cookie.status as any) === 'missing') && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800">Unknown</span>}
                      </td>
                      <td className="p-3 font-semibold">{usageCountMap.get(cookie.filename) || 0}</td>
                      <td className="p-3 text-xs">{cookie.is_pool_cookie ? 'Pool' : (cookie.used_by?.join(', ') || '-')}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <button onClick={() => handleViewCookie(cookie)} className="p-1 hover:bg-neutral-200 rounded"><EyeIcon className="w-4 h-4" /></button>
                          <button onClick={() => handleRegenerateCookie(cookie)} disabled={regenerateLoading[cookie.path]} className="p-1 hover:bg-neutral-200 rounded">{regenerateLoading[cookie.path] ? <Spinner /> : <RefreshCwIcon className="w-4 h-4" />}</button>
                          <button onClick={() => { setSelectedCookie(cookie); setDeleteModalOpen(true); }} className="p-1 hover:bg-neutral-200 rounded text-red-500"><TrashIcon className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmationModal isOpen={deleteModalOpen} onCancel={() => setDeleteModalOpen(false)} onConfirm={handleDelete} title="Delete Cookie" message={`Delete ${selectedCookie?.filename}?`} language={language} />
      <ConfirmationModal isOpen={bulkDeleteModalOpen} onCancel={() => setBulkDeleteModalOpen(false)} onConfirm={handleBulkDelete} title="Bulk Delete" message={`Delete ${selectedCookies.size} cookies?`} language={language} />

      {uploadModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Upload Cookie</h3>
            <input type="file" accept=".json" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="mb-4 w-full" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setUploadModalOpen(false)} className="px-4 py-2">Cancel</button>
              <button onClick={handleUpload} className="px-4 py-2 bg-green-600 text-white rounded">Upload</button>
            </div>
          </div>
        </div>, document.body
      )}

      {grabModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Grab Cookie</h3>
            <input type="text" value={grabCookieName} onChange={(e) => setGrabCookieName(e.target.value)} placeholder="Cookie Name" className="w-full p-2 border rounded mb-4" />
            <input type="email" value={grabCookieEmail} onChange={(e) => setGrabCookieEmail(e.target.value)} placeholder="Email (Optional)" className="w-full p-2 border rounded mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setGrabModalOpen(false)} className="px-4 py-2">Cancel</button>
              <button onClick={handleGrab} disabled={grabLoading} className="px-4 py-2 bg-blue-600 text-white rounded">{grabLoading ? 'Grabbing...' : 'Grab'}</button>
            </div>
          </div>
        </div>, document.body
      )}

      {viewCookieModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg max-w-4xl w-full h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">📄 {viewCookieFilename}</h3>
              <button onClick={() => setViewCookieModalOpen(false)}><XIcon className="w-5 h-5" /></button>
            </div>
            <pre className="flex-1 overflow-auto bg-neutral-50 dark:bg-neutral-800 p-4 rounded text-xs font-mono">{viewCookieContent}</pre>
          </div>
        </div>, document.body
      )}
    </div>
  );
};

export default CookieManagementView;
