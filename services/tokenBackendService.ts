import { getBotAdminApiUrlWithFallback } from './appConfig';
import { isLocalhost } from './environment';

const BACKEND_API_BASE = 'http://localhost:1247'; // Backend Flask app

export interface BackendUser {
  email: string;
  cookie_file?: string;
  cookie_files?: string[];
  notes?: string;
  flow_account_code?: string;
  flow_account_email?: string;
  created_at?: string;
  registered_at?: string;
  expires_at?: string;
  last_used?: string;
  usage_count?: number;
  cookie_status?: 'good' | 'warning' | 'expired' | 'missing';
  cookie_age?: string | number;
  total_cookie_count?: number;
  is_from_supabase?: boolean;
  missing_email?: boolean;
}

export interface BackendFlowAccount {
  code: string;
  email: string;
  password?: string;
  max_users: number;
  assigned_users: string[];
  current_users_count?: number;  // From Supabase
  available_slots?: number;
  status?: string;
  cookie_count?: number;
  cookie_pool_status?: 'good' | 'needs_more' | 'none';
}

export interface BackendCookie {
  filename: string;
  path: string;
  status: 'good' | 'warning' | 'expired' | 'missing';
  age_days: number | string;
  cookies_count: number;
  valid: boolean;
  used_by?: string[] | null;
  is_pool_cookie: boolean;
}

export interface BackendStats {
  total_users: number;
  active_users: number;
  good_cookies: number;
  warning_cookies: number;
  expired_cookies: number;
  total_requests: number;
  users_without_email: number;
  assigned_flow_slots: number;
  total_flow_slots: number;
}

export interface ApiRequestUser {
  email: string;
  total_requests: number;
  success_count: number;
  failed_count: number;
  last_request_time: string | null;
  last_request_status: string | null;
}

export interface CookieStatistics {
  all_cookies: Array<{
    filename: string;
    path: string;
    status: string;
    age_days: number | string;
    cookies_count: number;
    valid: boolean;
    is_pool_cookie: boolean;
    usage_count: number;
    last_used: string | null;
    first_used: string | null;
    flow_account: string;
    total_tokens_generated: number;
  }>;
  overall_stats: {
    total_cookies: number;
    total_usage: number;
    average_usage: number;
  };
}

// Get backend API URL (auto-detects localhost vs production)
const getBackendUrl = async (): Promise<string> => {
  // Use appConfig which already handles localhost detection
  return await getBotAdminApiUrlWithFallback();
};

// Helper to handle API errors
const handleApiError = (error: any, defaultMessage: string): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return defaultMessage;
};

// Helper to get current user email from localStorage
const getCurrentUserEmail = (): string | null => {
  try {
    const savedUserJson = localStorage.getItem('currentUser');
    if (savedUserJson) {
      const user = JSON.parse(savedUserJson);
      return user?.email || null;
    }
  } catch (error) {
    console.error('Failed to get user email:', error);
  }
  return null;
};

// Helper to get API headers with user email (for production)
const getApiHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  // Only add user email in production (not localhost)
  if (!isLocalhost()) {
    const userEmail = getCurrentUserEmail();
    if (userEmail) {
      headers['X-User-Email'] = userEmail;
    }
  }
  
  return headers;
};

// Dashboard Stats
export const getBackendStats = async (): Promise<BackendStats | null> => {
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}/api/stats`, {
      headers: getApiHeaders(),
      credentials: 'include', // Include cookies for session
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch stats: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching backend stats:', error);
    return null;
  }
};

// Cookie Management
export const getBackendCookies = async (): Promise<Record<string, BackendCookie[]>> => {
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}/api/cookies`, {
      headers: getApiHeaders(),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch cookies');
    const data = await response.json();
    return data.cookies_by_folder || {};
  } catch (error) {
    console.error('Error fetching backend cookies:', error);
    return {};
  }
};

export const uploadCookie = async (file: File, customName?: string): Promise<{ success: boolean; error?: string; filename?: string }> => {
  try {
    const url = await getBackendUrl();
    const formData = new FormData();
    formData.append('cookie_file', file);
    if (customName) formData.append('custom_name', customName);
    
    // Get headers (but don't set Content-Type for FormData - browser will set it with boundary)
    const headers: HeadersInit = {};
    if (!isLocalhost()) {
      const userEmail = getCurrentUserEmail();
      if (userEmail) {
        headers['X-User-Email'] = userEmail;
      }
    }
    
    const response = await fetch(`${url}/api/cookies/upload`, {
      method: 'POST',
      headers: headers,
      credentials: 'include',
      body: formData,
    });
    
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || 'Upload failed' };
    }
    return { success: true, filename: data.filename };
  } catch (error) {
    return { success: false, error: handleApiError(error, 'Failed to upload cookie') };
  }
};

export const deleteCookie = async (filename: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}/api/cookies/delete/${encodeURIComponent(filename)}`, {
      method: 'POST',
      headers: getApiHeaders(),
      credentials: 'include',
    });
    
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || 'Delete failed' };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: handleApiError(error, 'Failed to delete cookie') };
  }
};

export const bulkDeleteCookies = async (filenames: string[]): Promise<{ success: boolean; deleted_count?: number; error?: string }> => {
  try {
    const url = await getBackendUrl();
    // Backend doesn't have bulk delete API, so we'll delete one by one
    let deletedCount = 0;
    let errors: string[] = [];
    
    for (const filename of filenames) {
      const result = await deleteCookie(filename);
      if (result.success) {
        deletedCount++;
      } else {
        errors.push(filename);
      }
    }
    
    if (deletedCount === filenames.length) {
      return { success: true, deleted_count: deletedCount };
    } else if (deletedCount > 0) {
      return { success: true, deleted_count: deletedCount, error: `Failed to delete ${errors.length} cookie(s)` };
    } else {
      return { success: false, error: 'Failed to delete all cookies' };
    }
  } catch (error) {
    return { success: false, error: handleApiError(error, 'Failed to bulk delete cookies') };
  }
};

export const viewCookie = async (filename: string): Promise<{ success: boolean; content?: any; error?: string }> => {
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}/api/cookies/view/${encodeURIComponent(filename)}`, {
      headers: getApiHeaders(),
      credentials: 'include',
    });
    
    const data = await response.json();
    if (!response.ok || data.error) {
      return { success: false, error: data.error || 'Failed to view cookie' };
    }
    return { success: true, content: data };
  } catch (error) {
    return { success: false, error: handleApiError(error, 'Failed to view cookie') };
  }
};

export const grabCookie = async (
  cookieName: string, 
  email?: string
): Promise<{ success: boolean; filename?: string; error?: string; cookies_count?: number }> => {
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}/api/cookies/grab`, {
      method: 'POST',
      headers: getApiHeaders(),
      credentials: 'include',
      body: JSON.stringify({ cookie_name: cookieName, email }),
    });
    
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to grab cookie' };
    }
    return data;
  } catch (error: any) {
    return { success: false, error: handleApiError(error, 'Failed to grab cookie') };
  }
};

// Flow Accounts
export const getBackendFlowAccounts = async (): Promise<BackendFlowAccount[]> => {
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}/api/flow-accounts`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch flow accounts');
    const data = await response.json();
    return data.accounts || [];
  } catch (error) {
    console.error('Error fetching backend flow accounts:', error);
    return [];
  }
};

// API Requests
export const getBackendApiRequests = async (): Promise<{ users: ApiRequestUser[]; total_requests: number }> => {
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}/api/api-requests`, {
      headers: getApiHeaders(),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch API requests');
    return await response.json();
  } catch (error) {
    console.error('Error fetching backend API requests:', error);
    return { users: [], total_requests: 0 };
  }
};

export const clearBackendApiRequests = async (): Promise<{ success: boolean; message?: string }> => {
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}/api/api-requests`, {
      method: 'DELETE',
      headers: getApiHeaders(),
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to clear API requests' }));
      throw new Error(errorData.message || 'Failed to clear API requests');
    }
    
    const data = await response.json();
    return { success: data.success || false, message: data.message };
  } catch (error) {
    console.error('Error clearing backend API requests:', error);
    const message = error instanceof Error ? error.message : 'Failed to clear API requests';
    return { success: false, message };
  }
};

// Cookie Statistics
export const getBackendCookieStatistics = async (): Promise<CookieStatistics | null> => {
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}/api/cookie-statistics`, {
      headers: getApiHeaders(),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch cookie statistics');
    return await response.json();
  } catch (error) {
    console.error('Error fetching backend cookie statistics:', error);
    return null;
  }
};

// Get Token from Cookie
export interface GetTokenResult {
  success: boolean;
  token?: string;
  cookie_file?: string;
  credits?: number | string;
  timestamp?: string;
  error?: string;
}

export const getTokenFromCookie = async (cookieFile: string): Promise<GetTokenResult> => {
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}/api/get-token`, {
      method: 'POST',
      headers: getApiHeaders(),
      credentials: 'include',
      body: JSON.stringify({ cookie_file: cookieFile }),
    });
    
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to get token' };
    }
    return data;
  } catch (error) {
    return { success: false, error: handleApiError(error, 'Failed to get token') };
  }
};
