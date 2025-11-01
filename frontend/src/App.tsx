import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { AdminPage } from './pages/AdminPage';
import { ManagePage } from './pages/ManagePage';
import { ArchiveDetailPage } from './pages/ArchiveDetailPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/:section" element={<AdminPage />} />
      <Route path="/manage" element={<ManagePage />} />
      <Route path="/manage/:section" element={<ManagePage />} />
      <Route path="/archives/:archiveId" element={<ArchiveDetailPage />} />
    </Routes>
  );
};

export default App;
