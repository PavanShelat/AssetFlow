import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrgSetupPage from './pages/OrgSetupPage';
import AssetRegistryPage from './pages/AssetRegistryPage';
import AllocationPage from './pages/AllocationPage';
import ResourceBookingPage from './pages/ResourceBookingPage';
import MaintenancePage from './pages/MaintenancePage';
import AuditPage from './pages/AuditPage';
import ReportsPage from './pages/ReportsPage';
import NotificationsPage from './pages/NotificationsPage';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/organization" element={<OrgSetupPage />} />
            <Route path="/assets" element={<AssetRegistryPage />} />
            <Route path="/allocations" element={<AllocationPage />} />
            <Route path="/bookings" element={<ResourceBookingPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/audits" element={<AuditPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
