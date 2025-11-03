/**
 * API client wrapper with automatic authentication
 */

import { ApiClient } from '../api';
import { authUtils } from './auth';

// Create a global API client instance
let apiClient: ApiClient | null = null;

export const initializeApiClient = () => {
  apiClient = new ApiClient({
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
