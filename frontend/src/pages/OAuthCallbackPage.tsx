import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authUtils } from '../utils/auth';

export const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const refreshToken = params.get('refresh_token');

    if (token && refreshToken) {
      authUtils.setUserTokens(token, refreshToken);
    }
    navigate('/', { replace: true });
  }, [navigate]);

  return <div>Logging in...</div>;
};
