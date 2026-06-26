import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

import { RootState } from './store';
import AppLayout from './components/layout/AppLayout';

// Auth
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Dashboard
import DashboardPage from './pages/dashboard/DashboardPage';

// Projects
import ProjectsPage from './pages/projects/ProjectsPage';
import ProjectDetailPage from './pages/projects/ProjectDetailPage';

// Layer Pages
import Layer1ContextPage from './pages/layer1-context/Layer1ContextPage';
import Layer2DesignPage from './pages/layer2-design/Layer2DesignPage';
import Layer3GenerationPage from './pages/layer3-generation/Layer3GenerationPage';
import Layer4ExecutionPage from './pages/layer4-execution/Layer4ExecutionPage';
import Layer5AnalysisPage from './pages/layer5-analysis/Layer5AnalysisPage';
import Layer6GovernancePage from './pages/layer6-governance/Layer6GovernancePage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />

        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />

        <Route path="projects/:id/layer1" element={<Layer1ContextPage />} />
        <Route path="projects/:id/layer2" element={<Layer2DesignPage />} />
        <Route path="projects/:id/layer3" element={<Layer3GenerationPage />} />
        <Route path="projects/:id/layer4" element={<Layer4ExecutionPage />} />
        <Route path="projects/:id/layer5" element={<Layer5AnalysisPage />} />
        <Route path="projects/:id/layer6" element={<Layer6GovernancePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
