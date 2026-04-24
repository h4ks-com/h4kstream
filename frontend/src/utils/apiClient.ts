import { ApiClient } from '../api';
import { authUtils } from './auth';

let userApiClient: ApiClient | null = null;
let adminApiClient: ApiClient | null = null;
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

const refreshToken = async (): Promise<boolean> => {
  const currentToken = authUtils.getUserToken();
  const currentRefresh = authUtils.getUserRefreshToken();

  if (!currentToken || !currentRefresh) {
    return false;
  }

  try {
    const response = await fetch(window.location.origin + '/api/users/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Refresh-Token': currentRefresh,
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

const wrapWithRefresh = (client: ApiClient): ApiClient => {
  const handler: ProxyHandler<ApiClient> = {
    get(target, prop) {
      const original = (target as any)[prop];
      if (typeof original !== 'object' || original === null) return original;

      return new Proxy(original, {
        get(serviceTarget, serviceProp) {
          const method = (serviceTarget as any)[serviceProp];
          if (typeof method !== 'function') return method;

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
                  if (!success) throw error;
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

// User API client — always sends user JWT. Never sends admin token.
const getUserApiClient = (): ApiClient => {
  if (!userApiClient) {
    userApiClient = wrapWithRefresh(new ApiClient({
      BASE: window.location.origin + '/api',
      TOKEN: async () => authUtils.getUserToken() || '',
    }));
  }
  return userApiClient;
};

// Admin API client — always sends the admin token. Only for AdminService.
const getAdminApiClient = (): ApiClient => {
  if (!adminApiClient) {
    adminApiClient = new ApiClient({
      BASE: window.location.origin + '/api',
      TOKEN: async () => authUtils.getAdminToken() || '',
    });
  }
  return adminApiClient;
};

export const UsersService = () => getUserApiClient().users;
export const ShowsService = () => getUserApiClient().shows;
export const QueueService = () => getUserApiClient().queue;
export const RecordingsService = () => getUserApiClient().recordings;
export const MetadataService = () => getUserApiClient().metadata;
export const PublicService = () => getUserApiClient().public;
export const OauthService = () => getUserApiClient().oauth;
export const WebhooksService = () => getUserApiClient().webhooks;
export const AdminService = () => getAdminApiClient().admin;
