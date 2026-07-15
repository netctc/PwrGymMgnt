import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from './components/ui/sonner';
import Layout from './components/Layout';
import PageFallback from './components/PageFallback';
import { SettingsProvider } from './contexts/SettingsContext';
import { LocalizationProvider, useLocalization } from './contexts/LocalizationContext';
import { hasClientPermission, type ClientPermission } from './lib/permissions';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Members = lazy(() => import('./pages/Members'));
const Plans = lazy(() => import('./pages/Plans'));
const Classes = lazy(() => import('./pages/Classes'));
const QRScanner = lazy(() => import('./pages/QRScanner'));
const Settings = lazy(() => import('./pages/Settings'));
const Accounting = lazy(() => import('./pages/Accounting'));
const HumanResources = lazy(() => import('./pages/HumanResources'));
const PrivateClasses = lazy(() => import('./pages/PrivateClasses'));
const Support = lazy(() => import('./pages/Support'));
const Reports = lazy(() => import('./pages/Reports'));
const Warehouse = lazy(() => import('./pages/Warehouse'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const AccessControl = lazy(() => import('./pages/AccessControl'));
const Biometrics = lazy(() => import('./pages/Biometrics'));


function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function ProtectedRoute({ children, reqRole, requiredPermission }: { children: React.ReactNode, reqRole?: string[], requiredPermission?: ClientPermission }) {
  const { user, profile, loading } = useAuth();
  const { t } = useLocalization();
  if (loading) return <div>{t('app.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredPermission && !hasClientPermission(profile?.role, requiredPermission)) {
    return <Navigate to="/" replace />;
  }
  if (!requiredPermission && reqRole && profile && !reqRole.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <LocalizationProvider>
      <AuthProvider>
        <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<LazyPage><Dashboard /></LazyPage>} />
              <Route path="members" element={<ProtectedRoute requiredPermission="membership.read"><LazyPage><Members /></LazyPage></ProtectedRoute>} />
              <Route path="staff" element={<ProtectedRoute requiredPermission="hr.read"><Navigate to="/hr?tab=employees" replace /></ProtectedRoute>} />
              <Route path="hr" element={<ProtectedRoute requiredPermission="hr.read"><LazyPage><HumanResources /></LazyPage></ProtectedRoute>} />
              <Route path="plans" element={<ProtectedRoute requiredPermission="membership.read"><LazyPage><Plans /></LazyPage></ProtectedRoute>} />
              <Route path="classes" element={<ProtectedRoute requiredPermission="scheduling.read"><LazyPage><Classes /></LazyPage></ProtectedRoute>} />
              <Route path="private-classes" element={<ProtectedRoute requiredPermission="scheduling.read"><LazyPage><PrivateClasses /></LazyPage></ProtectedRoute>} />
              <Route path="scanner" element={<ProtectedRoute requiredPermission="membership.access.validate"><LazyPage><QRScanner /></LazyPage></ProtectedRoute>} />
              <Route path="accounting" element={<ProtectedRoute requiredPermission="finance.read"><LazyPage><Accounting /></LazyPage></ProtectedRoute>} />
              <Route path="warehouse" element={<ProtectedRoute requiredPermission="warehouse.read"><LazyPage><Warehouse /></LazyPage></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute requiredPermission="platform.audit.read"><LazyPage><Settings /></LazyPage></ProtectedRoute>} />
              <Route path="support" element={<ProtectedRoute requiredPermission="support.self"><LazyPage><Support /></LazyPage></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute requiredPermission="reports.read"><LazyPage><Reports /></LazyPage></ProtectedRoute>} />
              <Route path="subscriptions" element={<ProtectedRoute requiredPermission="membership.read"><LazyPage><Subscriptions /></LazyPage></ProtectedRoute>} />
              <Route path="access-control" element={<ProtectedRoute requiredPermission="membership.access.validate"><LazyPage><AccessControl /></LazyPage></ProtectedRoute>} />
              <Route path="biometrics" element={<ProtectedRoute requiredPermission="membership.read"><LazyPage><Biometrics /></LazyPage></ProtectedRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
        </SettingsProvider>
      </AuthProvider>
    </LocalizationProvider>
  );
}
