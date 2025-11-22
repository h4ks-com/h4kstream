/**
 * Authentication utilities for managing JWT tokens and admin tokens
 */

import { getUserRole } from './jwt';

const USER_TOKEN_KEY = 'userToken';
const ADMIN_TOKEN_KEY = 'adminToken';
const USER_REFRESH_TOKEN_KEY = 'userRefreshToken';

export const authUtils = {
  // User JWT token management
  getUserToken: (): string | null => {
    return localStorage.getItem(USER_TOKEN_KEY);
  },

  setUserToken: (token: string): void => {
    localStorage.setItem(USER_TOKEN_KEY, token);
  },

  clearUserToken: (): void => {
    localStorage.removeItem(USER_TOKEN_KEY);
  },

  isUserAuthenticated: (): boolean => {
    return !!localStorage.getItem(USER_TOKEN_KEY);
  },

  // User refresh token management
  getUserRefreshToken: (): string | null => {
    return localStorage.getItem(USER_REFRESH_TOKEN_KEY);
  },

  setUserRefreshToken: (refreshToken: string): void => {
    localStorage.setItem(USER_REFRESH_TOKEN_KEY, refreshToken);
  },

  clearUserRefreshToken: (): void => {
    localStorage.removeItem(USER_REFRESH_TOKEN_KEY);
  },

  // Set both tokens at once (login/register)
  setUserTokens: (token: string, refreshToken: string): void => {
    localStorage.setItem(USER_TOKEN_KEY, token);
    localStorage.setItem(USER_REFRESH_TOKEN_KEY, refreshToken);
  },

  // Clear both user tokens
  clearUserTokens: (): void => {
    localStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem(USER_REFRESH_TOKEN_KEY);
  },

  // Admin token management
  getAdminToken: (): string | null => {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  setAdminToken: (token: string): void => {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  },

  clearAdminToken: (): void => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  },

  isAdminAuthenticated: (): boolean => {
    return !!localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  // Clear all tokens
  clearAll: (): void => {
    localStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem(USER_REFRESH_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  },

  // Role-based access control
  hasAdminRole: (): boolean => {
    const token = localStorage.getItem(USER_TOKEN_KEY);
    if (!token) return false;
    return getUserRole(token) === 'admin';
  },

  // Check if user has admin access (either admin TOKEN or admin role)
  hasAdminAccess: (): boolean => {
    return authUtils.isAdminAuthenticated() || authUtils.hasAdminRole();
  },
};
