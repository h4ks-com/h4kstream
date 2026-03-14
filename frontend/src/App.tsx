import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { AdminPage } from './pages/AdminPage';
import { ManagePage } from './pages/ManagePage';
import { ArchiveDetailPage } from './pages/ArchiveDetailPage';
import { StreamPage } from './pages/StreamPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { WebSocketProvider } from './contexts/WebSocketContext';

const App: React.FC = () => {
  return (
    <WebSocketProvider>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/:section" element={<AdminPage />} />
      <Route path="/manage" element={<ManagePage />} />
      <Route path="/manage/:section" element={<ManagePage />} />
      <Route path="/archives" element={<ArchiveDetailPage />} />
      <Route path="/archives/:showName" element={<ArchiveDetailPage />} />
      <Route path="/stream" element={<StreamPage />} />
      <Route path="/login/callback" element={<OAuthCallbackPage />} />
    </Routes>
    </WebSocketProvider>
  );
};

export default App;
