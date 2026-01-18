import { supabase, type Database } from './supabaseClient';

type FlowAccountRow = Database['public']['Tables']['ultra_ai_email_pool']['Row'];
type FlowAccountInsert = Database['public']['Tables']['ultra_ai_email_pool']['Insert'];
type FlowAccountUpdate = Database['public']['Tables']['ultra_ai_email_pool']['Update'];

export interface FlowAccount {
  id: number;
  email: string;
  password: string;
  code: string;
  current_users_count: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

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
 * Get all flow accounts
 */
export const getAllFlowAccounts = async (): Promise<FlowAccount[]> => {
  try {
    const { data, error } = await supabase
      .from('ultra_ai_email_pool')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching flow accounts:', error);
      return [];
    }

    return (data || []) as FlowAccount[];
  } catch (error) {
    console.error('Exception fetching flow accounts:', getErrorMessage(error));
    return [];
  }
};

/**
 * Add a new flow account
 */
export const addFlowAccount = async (
  email: string,
  password: string,
  code: string
): Promise<{ success: true; account: FlowAccount } | { success: false; message: string }> => {
  try {
    // Check if code already exists
    const { data: existing } = await supabase
      .from('ultra_ai_email_pool')
      .select('id')
      .eq('code', code)
      .single();

    if (existing) {
      return { success: false, message: `Code ${code} already exists` };
    }

    // Check if email already exists
    const { data: existingEmail } = await supabase
      .from('ultra_ai_email_pool')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (existingEmail) {
      return { success: false, message: 'Email already exists in pool' };
    }

    const newAccount: FlowAccountInsert = {
      email: email.trim().toLowerCase(),
      password: password,
      code: code,
      current_users_count: 0,
      status: 'active',
    };

    const { data, error } = await supabase
      .from('ultra_ai_email_pool')
      .insert(newAccount)
      .select()
      .single();

    if (error || !data) {
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true, account: data as FlowAccount };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Update flow account
 */
export const updateFlowAccount = async (
  id: number,
  updates: Partial<Pick<FlowAccount, 'email' | 'password' | 'status'>>
): Promise<{ success: true; account: FlowAccount } | { success: false; message: string }> => {
  try {
    const updateData: FlowAccountUpdate = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ultra_ai_email_pool')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true, account: data as FlowAccount };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Remove flow account (delete from Supabase)
 */
export const removeFlowAccount = async (
  id: number
): Promise<{ success: boolean; message?: string }> => {
  try {
    // Actually delete the record from Supabase table
    const { error } = await supabase
      .from('ultra_ai_email_pool')
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
 * Get flow account by code
 */
export const getFlowAccountByCode = async (
  code: string
): Promise<{ success: true; account: FlowAccount } | { success: false; message: string }> => {
  try {
    const { data, error } = await supabase
      .from('ultra_ai_email_pool')
      .select('*')
      .eq('code', code)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      return { success: false, message: 'Flow account not found' };
    }

    return { success: true, account: data as FlowAccount };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Assign email code to user (G1, G2, G3, etc. for MONOKLIX; E1, E2, E3, etc. for ESAIE)
 * If flowAccountCode is provided, assign to that specific account
 * Otherwise, find the first available account with space
 */
export const assignEmailCodeToUser = async (
  userId: string,
  flowAccountCode?: string
): Promise<{ success: true; emailCode: string; email: string; password: string } | { success: false; message: string }> => {
  try {
    // Import BRAND_CONFIG dynamically to avoid circular dependency
    const { BRAND_CONFIG } = await import('./brandConfig');
    const isEsaie = BRAND_CONFIG.name === 'ESAIE';

    let availableEmail: FlowAccount | null = null;

    if (flowAccountCode) {
      // Manual assign: use the specified flow account (only fetch needed fields)
      const { data, error } = await supabase
        .from('ultra_ai_email_pool')
        .select('id, code, email, password, current_users_count')
        .eq('code', flowAccountCode)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        return { success: false, message: `Flow account ${flowAccountCode} not found or inactive` };
      }

      if (data.current_users_count >= 10) {
        return { success: false, message: `Flow account ${flowAccountCode} is full (10/10 users)` };
      }

      availableEmail = data as FlowAccount;
    } else {
      // Auto assign: find first available account (only fetch needed fields)
      const { data, error: findError } = await supabase
        .from('ultra_ai_email_pool')
        .select('id, code, email, password, current_users_count')
        .eq('status', 'active')
        .lt('current_users_count', 10)
        .order('current_users_count', { ascending: true })
        .order('code', { ascending: true })
        .limit(1)
        .single();

      if (findError || !data) {
        return { success: false, message: 'No available flow account. Please add more accounts.' };
      }

      availableEmail = data as FlowAccount;
    }

    if (!availableEmail) {
      return { success: false, message: 'No available flow account found.' };
    }

    // Always use base code directly (G1, G2, G3, etc. for MONOKLIX; E1, E2, E3, etc. for ESAIE) - same as flow account code
    // Limit is enforced by current_users_count in flow account (max 10)
    const nextCode = availableEmail.code;

    if (isEsaie) {
      // ESAIE: Update users.email_code directly (no token_ultra_registrations table)
      console.log('[assignEmailCodeToUser] ESAIE: Starting assignment for userId:', userId, 'to code:', nextCode);
      
      // Get current email_code from users table
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email_code')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('[assignEmailCodeToUser] ESAIE: Failed to fetch user:', userError);
        return { success: false, message: getErrorMessage(userError) };
      }
      
      console.log('[assignEmailCodeToUser] ESAIE: Current email_code:', user.email_code, 'New code:', nextCode);

      // If user already has an email_code, decrement the old flow account count first
      if (user.email_code && user.email_code !== nextCode) {
        console.log('[assignEmailCodeToUser] ESAIE: User has existing code, decrementing old flow account:', user.email_code);
        const { data: oldFlowAccount } = await supabase
          .from('ultra_ai_email_pool')
          .select('id, current_users_count')
          .eq('code', user.email_code)
          .eq('status', 'active')
          .maybeSingle();

        if (oldFlowAccount && oldFlowAccount.current_users_count > 0) {
          const newCount = oldFlowAccount.current_users_count - 1;
          console.log('[assignEmailCodeToUser] ESAIE: Decrementing old flow account count from', oldFlowAccount.current_users_count, 'to', newCount);
          const { error: decrementError } = await supabase
            .from('ultra_ai_email_pool')
            .update({ 
              current_users_count: newCount
            })
            .eq('id', oldFlowAccount.id);
          
          if (decrementError) {
            console.error('[assignEmailCodeToUser] ESAIE: Failed to decrement old flow account:', decrementError);
          } else {
            console.log('[assignEmailCodeToUser] ESAIE: Old flow account decremented successfully');
          }
        }
      }

      // Update users.email_code directly
      console.log('[assignEmailCodeToUser] ESAIE: Updating users.email_code to:', nextCode);
      const { error: updateError, data: updateData } = await supabase
        .from('users')
        .update({ email_code: nextCode })
        .eq('id', userId)
        .select('email_code'); // Add select to verify update

      if (updateError) {
        console.error('[assignEmailCodeToUser] ESAIE: Update failed:', updateError);
        return { success: false, message: `Failed to update email_code: ${getErrorMessage(updateError)}` };
      }
      
      console.log('[assignEmailCodeToUser] ESAIE: Update successful, verified email_code:', updateData?.[0]?.email_code);

      // Fetch fresh flow account data before incrementing to avoid stale count
      const { data: freshFlowAccount, error: freshError } = await supabase
        .from('ultra_ai_email_pool')
        .select('id, current_users_count')
        .eq('id', availableEmail.id)
        .single();
      
      if (freshError) {
        console.error('[assignEmailCodeToUser] ESAIE: Failed to fetch fresh flow account:', freshError);
      }

      // Only increment if email_code actually changed (not reassigning to same code)
      if (user.email_code !== nextCode) {
        const currentCount = freshFlowAccount?.current_users_count ?? availableEmail.current_users_count;
        const newCount = currentCount + 1;
        console.log('[assignEmailCodeToUser] ESAIE: Incrementing flow account count from', currentCount, 'to', newCount);
        
        // Increment current_users_count in email pool
        const { error: incrementError } = await supabase
          .from('ultra_ai_email_pool')
          .update({ 
            current_users_count: newCount
          })
          .eq('id', availableEmail.id);

        if (incrementError) {
          console.error('[assignEmailCodeToUser] ESAIE: Failed to increment user count:', incrementError);
          // Still return success since email_code was updated
        } else {
          console.log('[assignEmailCodeToUser] ESAIE: Flow account count incremented successfully');
        }
      } else {
        console.log('[assignEmailCodeToUser] ESAIE: Email code unchanged, skipping increment');
      }

      console.log('[assignEmailCodeToUser] ESAIE: Assignment completed successfully');
      return {
        success: true,
        emailCode: nextCode,
        email: availableEmail.email,
        password: availableEmail.password
      };
    } else {
      // MONOKLIX: Use token_ultra_registrations table
      console.log('[assignEmailCodeToUser] MONOKLIX: Starting assignment for userId:', userId, 'to code:', nextCode);
      
      // Get token_ultra_registrations record for this user
      const { data: existingRegistration, error: regError } = await supabase
        .from('token_ultra_registrations')
        .select('id, email_code')
        .eq('user_id', userId)
        .order('registered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (regError) {
        console.error('[assignEmailCodeToUser] MONOKLIX: Failed to fetch registration:', regError);
        return { success: false, message: getErrorMessage(regError) };
      }

      if (!existingRegistration) {
        // No registration exists, user needs to register Token Ultra first
        console.error('[assignEmailCodeToUser] MONOKLIX: No registration found for user');
        return { success: false, message: 'User must have an active Token Ultra registration to assign email code' };
      }
      
      console.log('[assignEmailCodeToUser] MONOKLIX: Current email_code:', existingRegistration.email_code, 'New code:', nextCode);

      // If user already has an email_code, decrement the old flow account count first
      if (existingRegistration.email_code && existingRegistration.email_code !== nextCode) {
        console.log('[assignEmailCodeToUser] MONOKLIX: User has existing code, decrementing old flow account:', existingRegistration.email_code);
        const { data: oldFlowAccount } = await supabase
          .from('ultra_ai_email_pool')
          .select('id, current_users_count')
          .eq('code', existingRegistration.email_code)
          .eq('status', 'active')
          .maybeSingle();

        if (oldFlowAccount && oldFlowAccount.current_users_count > 0) {
          const newCount = oldFlowAccount.current_users_count - 1;
          console.log('[assignEmailCodeToUser] MONOKLIX: Decrementing old flow account count from', oldFlowAccount.current_users_count, 'to', newCount);
          const { error: decrementError } = await supabase
            .from('ultra_ai_email_pool')
            .update({ 
              current_users_count: newCount
            })
            .eq('id', oldFlowAccount.id);
          
          if (decrementError) {
            console.error('[assignEmailCodeToUser] MONOKLIX: Failed to decrement old flow account:', decrementError);
          } else {
            console.log('[assignEmailCodeToUser] MONOKLIX: Old flow account decremented successfully');
          }
        }
      }

      // Update registration with new email_code (no updated_at, let DB handle it)
      console.log('[assignEmailCodeToUser] MONOKLIX: Updating token_ultra_registrations.email_code to:', nextCode);
      const { error: updateError, data: updateData } = await supabase
        .from('token_ultra_registrations')
        .update({ email_code: nextCode })
        .eq('id', existingRegistration.id)
        .select('email_code'); // Add select to verify update

      if (updateError) {
        console.error('[assignEmailCodeToUser] MONOKLIX: Update failed:', updateError);
        return { success: false, message: `Failed to update email_code: ${getErrorMessage(updateError)}` };
      }
      
      console.log('[assignEmailCodeToUser] MONOKLIX: Update successful, verified email_code:', updateData?.[0]?.email_code);

      // Fetch fresh flow account data before incrementing to avoid stale count
      const { data: freshFlowAccount, error: freshError } = await supabase
        .from('ultra_ai_email_pool')
        .select('id, current_users_count')
        .eq('id', availableEmail.id)
        .single();
      
      if (freshError) {
        console.error('[assignEmailCodeToUser] MONOKLIX: Failed to fetch fresh flow account:', freshError);
      }

      // Only increment if email_code actually changed (not reassigning to same code)
      if (existingRegistration.email_code !== nextCode) {
        const currentCount = freshFlowAccount?.current_users_count ?? availableEmail.current_users_count;
        const newCount = currentCount + 1;
        console.log('[assignEmailCodeToUser] MONOKLIX: Incrementing flow account count from', currentCount, 'to', newCount);
        
        // Increment current_users_count in email pool
        const { error: incrementError } = await supabase
          .from('ultra_ai_email_pool')
          .update({ 
            current_users_count: newCount
          })
          .eq('id', availableEmail.id);

        if (incrementError) {
          console.error('[assignEmailCodeToUser] MONOKLIX: Failed to increment user count:', incrementError);
          // Still return success since email_code was updated
        } else {
          console.log('[assignEmailCodeToUser] MONOKLIX: Flow account count incremented successfully');
        }
      } else {
        console.log('[assignEmailCodeToUser] MONOKLIX: Email code unchanged, skipping increment');
      }

      console.log('[assignEmailCodeToUser] MONOKLIX: Assignment completed successfully');
      return {
        success: true,
        emailCode: nextCode,
        email: availableEmail.email,
        password: availableEmail.password
      };
    }
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Reset email code from user (clear email_code and decrement user count)
 */
export const resetEmailCodeFromUser = async (
  userId: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    // Import BRAND_CONFIG dynamically to avoid circular dependency
    const { BRAND_CONFIG } = await import('./brandConfig');
    const isEsaie = BRAND_CONFIG.name === 'ESAIE';

    if (isEsaie) {
      // ESAIE: Get user's current email_code from users table
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email_code')
        .eq('id', userId)
        .single();

      if (userError) {
        return { success: false, message: getErrorMessage(userError) };
      }

      if (!user.email_code) {
        return { success: false, message: 'User does not have an email code assigned' };
      }

      // Email code is now the same as flow account code (E1, E2, E3, etc.)
      const baseCode = user.email_code;

      // Find the flow account (only need id and current_users_count)
      const { data: flowAccount } = await supabase
        .from('ultra_ai_email_pool')
        .select('id, current_users_count')
        .eq('code', baseCode)
        .eq('status', 'active')
        .maybeSingle();

      // Clear email_code from users table
      const { error: updateError } = await supabase
        .from('users')
        .update({ email_code: null })
        .eq('id', userId);

      if (updateError) {
        return { success: false, message: getErrorMessage(updateError) };
      }

      // Decrement user count if flow account exists
      if (flowAccount && flowAccount.current_users_count > 0) {
        const { error: decrementError } = await supabase
          .from('ultra_ai_email_pool')
          .update({ 
            current_users_count: flowAccount.current_users_count - 1
          })
          .eq('id', flowAccount.id);

        if (decrementError) {
          console.error('Failed to decrement user count:', decrementError);
          // Don't fail the reset if decrement fails
        }
      }

      return { success: true };
    } else {
      // MONOKLIX: Get user's current email_code from token_ultra_registrations
      const { data: registration, error: regError } = await supabase
        .from('token_ultra_registrations')
        .select('id, email_code')
        .eq('user_id', userId)
        .order('registered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (regError) {
        return { success: false, message: getErrorMessage(regError) };
      }

      if (!registration) {
        return { success: false, message: 'User does not have a Token Ultra registration' };
      }

      if (!registration.email_code) {
        return { success: false, message: 'User does not have an email code assigned' };
      }

      // Email code is now the same as flow account code (G1, G2, G3, etc.)
      const baseCode = registration.email_code;

      // Find the flow account (only need id and current_users_count)
      const { data: flowAccount } = await supabase
        .from('ultra_ai_email_pool')
        .select('id, current_users_count')
        .eq('code', baseCode)
        .eq('status', 'active')
        .maybeSingle();

      // Clear email_code from token_ultra_registrations (no updated_at, let DB handle it)
      const { error: updateError } = await supabase
        .from('token_ultra_registrations')
        .update({ email_code: null })
        .eq('id', registration.id);

      if (updateError) {
        return { success: false, message: getErrorMessage(updateError) };
      }

      // Decrement user count if flow account exists
      if (flowAccount && flowAccount.current_users_count > 0) {
        const { error: decrementError } = await supabase
          .from('ultra_ai_email_pool')
          .update({ 
            current_users_count: flowAccount.current_users_count - 1
          })
          .eq('id', flowAccount.id);

        if (decrementError) {
          console.error('Failed to decrement user count:', decrementError);
          // Don't fail the reset if decrement fails
        }
      }

      return { success: true };
    }
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Assign flow code to user by email (for Token Management)
 * Assumes user already exists in users table from payment/registration
 */
export const assignFlowCodeToUserByEmail = async (
  email: string,
  flowAccountCode: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    // Import BRAND_CONFIG dynamically to avoid circular dependency
    const { BRAND_CONFIG } = await import('./brandConfig');
    const isEsaie = BRAND_CONFIG.name === 'ESAIE';

    const cleanedEmail = email.trim().toLowerCase();
    
    if (!cleanedEmail || !flowAccountCode) {
      return { success: false, message: 'Email and Flow Code are required' };
    }
    
    console.log('[assignFlowCodeToUserByEmail] Starting:', { email: cleanedEmail, flowCode: flowAccountCode, brand: BRAND_CONFIG.name });
    
    // Step 1: Find user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, email_code')
      .eq('email', cleanedEmail)
      .maybeSingle();
    
    if (userError) {
      console.error('[assignFlowCodeToUserByEmail] User lookup error:', userError);
      return { success: false, message: `Error finding user: ${getErrorMessage(userError)}` };
    }
    
    if (!user) {
      console.error('[assignFlowCodeToUserByEmail] User not found:', cleanedEmail);
      return { success: false, message: `User with email ${cleanedEmail} not found in users table. Please ensure user exists from payment/registration.` };
    }
    
    const userId = user.id;
    const userEmail = user.email || cleanedEmail;
    const currentEmailCode = user.email_code;
    console.log('[assignFlowCodeToUserByEmail] User found:', { userId, email: userEmail, currentEmailCode });
    
    // Step 2: Check if flow account exists and has available slots
    const MAX_USERS_PER_ACCOUNT = 10;
    
    const { data: flowAccount, error: flowError } = await supabase
      .from('ultra_ai_email_pool')
      .select('id, current_users_count')
      .eq('code', flowAccountCode)
      .eq('status', 'active')
      .maybeSingle();
    
    if (flowError) {
      console.error('[assignFlowCodeToUserByEmail] Flow account lookup error:', flowError);
      return { success: false, message: `Error finding flow account: ${getErrorMessage(flowError)}` };
    }
    
    if (!flowAccount) {
      console.error('[assignFlowCodeToUserByEmail] Flow account not found:', flowAccountCode);
      return { success: false, message: `Flow account ${flowAccountCode} not found or inactive` };
    }
    
    if (flowAccount.current_users_count >= MAX_USERS_PER_ACCOUNT) {
      return { success: false, message: `Flow account ${flowAccountCode} is full (${flowAccount.current_users_count}/${MAX_USERS_PER_ACCOUNT})` };
    }
    
    console.log('[assignFlowCodeToUserByEmail] Flow account found:', { id: flowAccount.id, current: flowAccount.current_users_count, max: MAX_USERS_PER_ACCOUNT });

    if (isEsaie) {
      // ESAIE: Update users.email_code directly (no token_ultra_registrations table)
      
      // If user already has this email_code, no need to do anything
      if (currentEmailCode === flowAccountCode) {
        return { success: true, message: 'User already has this flow code assigned' };
      }
      
      // If user has different email_code, decrement old flow account
      if (currentEmailCode) {
        const { data: oldFlow } = await supabase
          .from('ultra_ai_email_pool')
          .select('id, current_users_count')
          .eq('code', currentEmailCode)
          .eq('status', 'active')
          .maybeSingle();
        
        if (oldFlow && oldFlow.current_users_count > 0) {
          await supabase
            .from('ultra_ai_email_pool')
            .update({ current_users_count: oldFlow.current_users_count - 1 })
            .eq('id', oldFlow.id);
        }
      }
      
      // Update users.email_code directly
      const { error: updateError } = await supabase
        .from('users')
        .update({ email_code: flowAccountCode })
        .eq('id', userId);
      
      if (updateError) {
        console.error('[assignFlowCodeToUserByEmail] Update user error:', updateError);
        return { success: false, message: `Failed to update user: ${getErrorMessage(updateError)}` };
      }
      
      console.log('[assignFlowCodeToUserByEmail] User email_code updated successfully');
      
      // Increment flow account user count (only if email_code changed)
      if (currentEmailCode !== flowAccountCode) {
        const newCount = flowAccount.current_users_count + 1;
        const { error: incrementError } = await supabase
          .from('ultra_ai_email_pool')
          .update({ 
            current_users_count: newCount
          })
          .eq('id', flowAccount.id);
        
        if (incrementError) {
          console.error('[assignFlowCodeToUserByEmail] Failed to increment user count:', incrementError);
          // Don't fail if increment fails - assignment succeeded
          return { success: true, message: `Flow code ${flowAccountCode} assigned, but failed to update count: ${getErrorMessage(incrementError)}` };
        }
        
        console.log('[assignFlowCodeToUserByEmail] Flow account count incremented:', { from: flowAccount.current_users_count, to: newCount });
      }
      
      console.log('[assignFlowCodeToUserByEmail] Success!');
      return { success: true, message: `Flow code ${flowAccountCode} assigned successfully` };
      
    } else {
      // MONOKLIX: Use token_ultra_registrations table
      
      // Derive username from full_name or email (users table doesn't have username column)
      const username = user.full_name || userEmail.split('@')[0] || 'User';
      
      // Step 3: Check if token_ultra_registrations exists for this user
      const { data: existingReg, error: regError } = await supabase
        .from('token_ultra_registrations')
        .select('id, email_code')
        .eq('user_id', userId)
        .order('registered_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (regError) {
        console.error('[assignFlowCodeToUserByEmail] Registration lookup error:', regError);
        return { success: false, message: `Error checking registration: ${getErrorMessage(regError)}` };
      }
      
      console.log('[assignFlowCodeToUserByEmail] Existing registration:', existingReg ? { id: existingReg.id, email_code: existingReg.email_code } : 'none');
      
      // Step 4: Handle existing registration or create new one
      if (existingReg) {
        // User already has registration
        
        // If user already has this email_code, no need to do anything
        if (existingReg.email_code === flowAccountCode) {
          return { success: true, message: 'User already has this flow code assigned' };
        }
        
        // If user has different email_code, decrement old flow account
        if (existingReg.email_code) {
          const { data: oldFlow } = await supabase
            .from('ultra_ai_email_pool')
            .select('id, current_users_count')
            .eq('code', existingReg.email_code)
            .eq('status', 'active')
            .maybeSingle();
          
          if (oldFlow && oldFlow.current_users_count > 0) {
            await supabase
              .from('ultra_ai_email_pool')
              .update({ current_users_count: oldFlow.current_users_count - 1 })
              .eq('id', oldFlow.id);
          }
        }
        
        // Update existing registration with new email_code
        const { error: updateError } = await supabase
          .from('token_ultra_registrations')
          .update({ email_code: flowAccountCode })
          .eq('id', existingReg.id);
        
        if (updateError) {
          console.error('[assignFlowCodeToUserByEmail] Update registration error:', updateError);
          return { success: false, message: `Failed to update registration: ${getErrorMessage(updateError)}` };
        }
        
        console.log('[assignFlowCodeToUserByEmail] Registration updated successfully');
        
      } else {
        // No registration exists - create new token_ultra_registrations record
        // Calculate expires_at (30 days from now)
        const registeredAt = new Date();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now
        
        const { data: insertedData, error: insertError } = await supabase
          .from('token_ultra_registrations')
          .insert({
            user_id: userId,
            username: username,
            email: userEmail,
            telegram_id: '', // Empty string as placeholder (column is required but not used)
            email_code: flowAccountCode,
            status: 'active',
            registered_at: registeredAt.toISOString(),
            expires_at: expiresAt.toISOString(),
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('[assignFlowCodeToUserByEmail] Insert registration error:', insertError);
          return { success: false, message: `Failed to create registration: ${getErrorMessage(insertError)}` };
        }
        
        console.log('[assignFlowCodeToUserByEmail] Registration created successfully:', insertedData?.id);
      }
      
      // Step 5: Increment flow account user count (only if email_code changed or new registration)
      if (!existingReg || existingReg.email_code !== flowAccountCode) {
        const newCount = flowAccount.current_users_count + 1;
        const { error: incrementError } = await supabase
          .from('ultra_ai_email_pool')
          .update({ 
            current_users_count: newCount
          })
          .eq('id', flowAccount.id);
        
        if (incrementError) {
          console.error('[assignFlowCodeToUserByEmail] Failed to increment user count:', incrementError);
          // Don't fail if increment fails - assignment succeeded
          return { success: true, message: `Flow code ${flowAccountCode} assigned, but failed to update count: ${getErrorMessage(incrementError)}` };
        }
        
        console.log('[assignFlowCodeToUserByEmail] Flow account count incremented:', { from: flowAccount.current_users_count, to: newCount });
      }
      
      console.log('[assignFlowCodeToUserByEmail] Success!');
      return { success: true, message: `Flow code ${flowAccountCode} assigned successfully` };
    }
    
  } catch (error) {
    console.error('[assignFlowCodeToUserByEmail] Unexpected error:', error);
    return { success: false, message: `Unexpected error: ${getErrorMessage(error)}` };
  }
};