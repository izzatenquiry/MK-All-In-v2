import { supabase, type Database } from './supabaseClient';

// Note: The table structure needs to be created in Supabase first
// We'll define the types based on the expected schema
export interface UltraAiAccount {
  id: string;
  email: string;
  password?: string | null;
  status: 'available' | 'reserved' | 'sold' | 'suspended' | 'expired' | 'new_stock' | 'transferred';
  
  // Buyer Information
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  buyer_telegram?: string | null;
  buyer_notes?: string | null;
  
  // Sale Information
  sale_date?: string | null;
  sale_price?: number | null;
  payment_method?: string | null;
  payment_status?: 'pending' | 'paid' | 'refunded' | null;
  
  // Account Details
  account_type?: string | null;
  account_tier?: string | null;
  expiry_date?: string | null;
  last_checked_at?: string | null;
  account_status?: string | null;
  
  // Metadata
  notes?: string | null;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

// For now, we'll use a generic type since the table might not be in Database interface yet
// You'll need to add it to services/supabaseClient.ts after creating the table

type UltraAiAccountInsert = Omit<UltraAiAccount, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

type UltraAiAccountUpdate = Partial<Omit<UltraAiAccount, 'id' | 'created_at'>> & {
  updated_at?: string;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  return 'An unknown error occurred';
};

/**
 * Get all accounts with optional filters
 */
export const getAllAccounts = async (filters?: {
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<UltraAiAccount[]> => {
  try {
    let query = supabase
      .from('ultra_ai_account_sales')
      .select('*');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.search) {
      const searchTerm = filters.search.toLowerCase();
      query = query.or(`email.ilike.%${searchTerm}%,buyer_name.ilike.%${searchTerm}%,buyer_email.ilike.%${searchTerm}%`);
    }

    if (filters?.dateFrom) {
      query = query.gte('sale_date', filters.dateFrom);
    }

    if (filters?.dateTo) {
      query = query.lte('sale_date', filters.dateTo);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching accounts:', error);
      return [];
    }

    return (data || []) as UltraAiAccount[];
  } catch (error) {
    console.error('Exception fetching accounts:', getErrorMessage(error));
    return [];
  }
};

/**
 * Get account by ID
 */
export const getAccountById = async (id: string): Promise<UltraAiAccount | null> => {
  try {
    const { data, error } = await supabase
      .from('ultra_ai_account_sales')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching account:', error);
      return null;
    }

    return data as UltraAiAccount | null;
  } catch (error) {
    console.error('Exception fetching account:', getErrorMessage(error));
    return null;
  }
};

/**
 * Add a new account
 */
export const addAccount = async (
  account: Partial<UltraAiAccountInsert>
): Promise<{ success: true; account: UltraAiAccount } | { success: false; message: string }> => {
  try {
    // Check if email already exists
    const { data: existing } = await supabase
      .from('ultra_ai_account_sales')
      .select('id')
      .eq('email', account.email?.toLowerCase().trim() || '')
      .single();

    if (existing) {
      return { success: false, message: 'Email already exists' };
    }

    const newAccount: UltraAiAccountInsert = {
      email: account.email?.toLowerCase().trim() || '',
      password: account.password || null,
      status: account.status || 'available',
      buyer_name: account.buyer_name || null,
      buyer_email: account.buyer_email || null,
      buyer_phone: account.buyer_phone || null,
      buyer_telegram: account.buyer_telegram || null,
      buyer_notes: account.buyer_notes || null,
      sale_date: account.sale_date || null,
      sale_price: account.sale_price || null,
      payment_method: account.payment_method || null,
      payment_status: account.payment_status || null,
      account_type: account.account_type || 'ultra_ai',
      account_tier: account.account_tier || null,
      expiry_date: account.expiry_date || null,
      last_checked_at: account.last_checked_at || null,
      account_status: account.account_status || null,
      notes: account.notes || null,
      tags: account.tags || null,
      created_by: account.created_by || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ultra_ai_account_sales')
      .insert(newAccount)
      .select()
      .single();

    if (error || !data) {
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true, account: data as UltraAiAccount };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Update account
 */
export const updateAccount = async (
  id: string,
  updates: Partial<UltraAiAccountUpdate>
): Promise<{ success: true; account: UltraAiAccount } | { success: false; message: string }> => {
  try {
    const updateData: UltraAiAccountUpdate = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ultra_ai_account_sales')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true, account: data as UltraAiAccount };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Delete account
 */
export const deleteAccount = async (
  id: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    const { error } = await supabase
      .from('ultra_ai_account_sales')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Mark account as sold
 */
export const markAsSold = async (
  id: string,
  saleData: {
    buyer_name: string;
    buyer_email?: string;
    buyer_phone?: string;
    buyer_telegram?: string;
    buyer_notes?: string;
    sale_price: number;
    payment_method?: string;
    payment_status?: 'pending' | 'paid';
  }
): Promise<{ success: true; account: UltraAiAccount } | { success: false; message: string }> => {
  try {
    // Calculate expiry_date: 1 month from sale_date
    const saleDate = new Date();
    const expiryDate = new Date(saleDate);
    expiryDate.setMonth(expiryDate.getMonth() + 1);

    const updateData: UltraAiAccountUpdate = {
      status: 'sold',
      buyer_name: saleData.buyer_name,
      buyer_email: saleData.buyer_email || null,
      buyer_phone: saleData.buyer_phone || null,
      buyer_telegram: saleData.buyer_telegram || null,
      buyer_notes: saleData.buyer_notes || null,
      sale_date: saleDate.toISOString(),
      expiry_date: expiryDate.toISOString(),
      sale_price: saleData.sale_price,
      payment_method: saleData.payment_method || null,
      payment_status: saleData.payment_status || 'pending',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ultra_ai_account_sales')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true, account: data as UltraAiAccount };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Get sales statistics
 */
export const getSalesStatistics = async (): Promise<{
  total_accounts: number;
  available: number;
  sold: number;
  reserved: number;
  suspended: number;
  expired: number;
  total_revenue: number;
  monthly_revenue: number;
  average_price: number;
  pending_payments: number;
}> => {
  try {
    const { data, error } = await supabase
      .from('ultra_ai_account_sales')
      .select('status, sale_price, sale_date, payment_status');

    if (error) {
      console.error('Error fetching statistics:', error);
      return {
        total_accounts: 0,
        available: 0,
        sold: 0,
        transferred: 0,
        reserved: 0,
        suspended: 0,
        expired: 0,
        total_revenue: 0,
        monthly_revenue: 0,
        average_price: 0,
        pending_payments: 0,
      };
    }

    const accounts = data || [];
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const stats = {
      total_accounts: accounts.length,
      available: accounts.filter(a => a.status === 'available').length,
      sold: accounts.filter(a => a.status === 'sold').length,
      transferred: accounts.filter(a => a.status === 'transferred').length,
      reserved: accounts.filter(a => a.status === 'reserved').length,
      suspended: accounts.filter(a => a.status === 'suspended').length,
      expired: accounts.filter(a => a.status === 'expired').length,
      total_revenue: 0,
      monthly_revenue: 0,
      average_price: 0,
      pending_payments: 0,
    };

    const soldAccounts = accounts.filter(a => a.status === 'sold' && a.sale_price);
    const paidSales = soldAccounts.filter(a => a.payment_status === 'paid' || !a.payment_status);
    
    if (paidSales.length > 0) {
      stats.total_revenue = paidSales.reduce((sum, a) => sum + (Number(a.sale_price) || 0), 0);
      stats.average_price = stats.total_revenue / paidSales.length;
    }

    // Monthly revenue
    const monthlySales = soldAccounts.filter(a => {
      if (!a.sale_date) return false;
      const saleDate = new Date(a.sale_date);
      return saleDate >= firstDayOfMonth && (a.payment_status === 'paid' || !a.payment_status);
    });
    stats.monthly_revenue = monthlySales.reduce((sum, a) => sum + (Number(a.sale_price) || 0), 0);

    // Pending payments
    stats.pending_payments = accounts.filter(a => a.payment_status === 'pending').length;

    return stats;
  } catch (error) {
    console.error('Exception fetching statistics:', getErrorMessage(error));
    return {
      total_accounts: 0,
      available: 0,
      sold: 0,
      reserved: 0,
      suspended: 0,
      expired: 0,
      total_revenue: 0,
      monthly_revenue: 0,
      average_price: 0,
      pending_payments: 0,
    };
  }
};

/**
 * Bulk import accounts from CSV data
 */
export const bulkImportAccounts = async (
  accounts: Array<{
    email: string;
    password?: string;
    status?: string;
    account_type?: string;
    account_tier?: string;
    notes?: string;
  }>
): Promise<{ success: number; failed: number; errors: string[] }> => {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    const result = await addAccount({
      email: account.email,
      password: account.password,
      status: (account.status as any) || 'available',
      account_type: account.account_type || 'ultra_ai',
      account_tier: account.account_tier || null,
      notes: account.notes || null,
    });

    if (result.success) {
      success++;
    } else {
      failed++;
      errors.push(`${account.email}: ${result.message}`);
    }
  }

  return { success, failed, errors };
};

