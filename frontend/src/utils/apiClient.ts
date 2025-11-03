/**
 * API client wrapper with automatic authentication and token refresh
 */

import { ApiClient } from '../api';
import { authUtils } from './auth';

// Create a global API client instance
let apiClient: ApiClient | null = null;
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Refresh the JWT token using the refresh token
 */
const refreshToken = async (): Promise<boolean> => {
  const currentToken = authUtils.getUserToken();
  const refreshToken = authUtils.getUserRefreshToken();

  if (!currentToken || !refreshToken) {
    return false;
  }

  try {
    const response = await fetch(window.location.origin + '/api/users/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Refresh-Token': refreshToken,
      },
      body: JSON.stringify({ token: currentToken }),
    });

    if (!response.ok) {
      authUtils.clearAll();
      window.location.href = '/login';
      return false;
    }

    const data = await response.json();
    authUtils.setUserTokens(data.token, data.refresh_token);
    return true;
  } catch (error) {
    authUtils.clearAll();
    window.location.href = '/login';
    return false;
  }
};

/**
 * Wrapper to handle token refresh on 401/403 errors
 */
const wrapApiClientWithRefresh = (client: ApiClient): ApiClient => {
  const handler: ProxyHandler<ApiClient> = {
    get(target, prop) {
      const original = (target as any)[prop];

      if (typeof original !== 'object' || original === null) {
        return original;
      }

      return new Proxy(original, {
        get(serviceTarget, serviceProp) {
          const method = (serviceTarget as any)[serviceProp];

          if (typeof method !== 'function') {
            return method;
          }

          return async (...args: any[]) => {
            try {
              return await method.apply(serviceTarget, args);
            } catch (error: any) {
              const status = error?.status;

              if (status === 401 || status === 403) {
                if (isRefreshing) {
                  await refreshPromise;
                } else {
                  isRefreshing = true;
                  refreshPromise = refreshToken().then((success) => {
                    isRefreshing = false;
                    refreshPromise = null;
                    return success;
                  });
                  const success = await refreshPromise;

                  if (!success) {
                    throw error;
                  }
                }

                return await method.apply(serviceTarget, args);
              }

              throw error;
            }
          };
        },
      });
    },
  };

  return new Proxy(client, handler);
};

export const initializeApiClient = () => {
  const baseClient = new ApiClient({
    BASE: window.location.origin + '/api',
    TOKEN: async () => {
      const userToken = authUtils.getUserToken();
      const adminToken = authUtils.getAdminToken();

      // Use admin token only on /admin routes, user token elsewhere
      const isAdminRoute = window.location.pathname.startsWith('/admin');

      if (isAdminRoute) {
        return adminToken || userToken || '';
      } else {
        return userToken || '';
      }
    },
  });

  apiClient = wrapApiClientWithRefresh(baseClient);
};

// Get the API client instance (creates it if needed)
export const getApiClient = (): ApiClient => {
  if (!apiClient) {
    initializeApiClient();
  }
  return apiClient!;
};

// Export individual services for direct import
export const UsersService = () => getApiClient().users;
export const ShowsService = () => getApiClient().shows;
export const AdminService = () => getApiClient().admin;
export const QueueService = () => getApiClient().queue;
export const RecordingsService = () => getApiClient().recordings;
export const MetadataService = () => getApiClient().metadata;
export const WebhooksService = () => getApiClient().webhooks;
