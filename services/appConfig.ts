/**
 * Centralized configuration for application-wide constants.
 * Unified version that works for both Electron and Web.
 */
import { isElectron, isLocalhost } from './environment';
import { BRAND_CONFIG } from './brandConfig';

// Get APP_VERSION from brand config based on environment
export const APP_VERSION = isElectron() 
  ? BRAND_CONFIG.appVersion.electron
  : BRAND_CONFIG.appVersion.web;

/**
 * Get Bot Admin API base URL
 * Development: localhost:1247 (local backend)
 * Production: api.monoklix.com (centralized backend)
 */
export const getBotAdminApiUrl = (): string => {
  if (isLocalhost()) {
    return 'http://localhost:1247'; // Local backend for development
  }
  return 'https://api.monoklix.com'; // Production backend
};

/**
 * Get Bot Admin API URL with auto-detection
 * Development: localhost:1247 (local backend)
 * Production: api.monoklix.com (centralized backend)
 */
export const getBotAdminApiUrlWithFallback = async (): Promise<string> => {
  if (isLocalhost()) {
    return 'http://localhost:1247'; // Local backend for development
  }
  return 'https://api.monoklix.com'; // Production backend
};

export const BOT_ADMIN_API_URL = getBotAdminApiUrl();

