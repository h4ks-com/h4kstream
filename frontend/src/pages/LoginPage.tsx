import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UsersService } from '../utils/apiClient';
import { authUtils } from '../utils/auth';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await UsersService().loginUserUsersLoginPost({
        email,
        password,
      });

      authUtils.setUserToken(response.token);
      navigate('/');
    } catch (err: any) {
      setError(err.body?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="border-2 border-h4ks-green-700 bg-h4ks-dark-900 p-8">
          <h1 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
            [h4kstream / login]
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2 focus:outline-none focus:border-h4ks-green-500"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2 focus:outline-none focus:border-h4ks-green-500"
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 transition-colors disabled:opacity-50"
            >
              {loading ? '[LOGGING IN...]' : '[LOGIN]'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full border border-h4ks-green-800 hover:border-h4ks-green-600 text-gray-400 hover:text-gray-300 font-mono py-2 px-4 transition-colors"
            >
              [BACK TO HOME]
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
