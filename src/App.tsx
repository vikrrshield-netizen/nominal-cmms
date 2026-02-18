// src/App.tsx
// NOMINAL CMMS — Hlavní aplikace s routingem

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuthContext } from './context/AuthContext';
import { LoadingSpinner } from './components/ui';
import ToastContainer from './components/ui/Toast';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import KioskPage from './pages/KioskPage';
import BuildingInspectionPage from './pages/BuildingInspectionPage';
import TasksPage from './pages/TasksPage';
import InventoryPage from './pages/InventoryPage';
import FleetPage from './pages/FleetPage';
import RevisionsPage from './pages/RevisionsPage';
import AssetCardPage from './pages/AssetCardPage';
import CalendarPage from './pages/CalendarPage';
import WastePage from './pages/WastePage';
import TrustBoxPage from './pages/TrustBoxPage';
import MapPage from './pages/MapPage';
import ReportsPage from './pages/ReportsPage';
import AdminPage from './pages/AdminPage';
import AIAssistantPage from './pages/AIAssistantPage';
import NotificationsPage from './pages/NotificationsPage';
import LouparnaPage from './pages/LouparnaPage';
import InspectionsPage from './pages/InspectionsPage';
import NoticeboardPage from './pages/NoticeboardPage';

// ═══════════════════════════════════════════════════════════════════
// PROTECTED ROUTE WRAPPER
// ═══════════════════════════════════════════════════════════════════

function ProtectedRoutes() {
  const { isAuthenticated, isLoading, isKiosk } = useAuthContext();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Načítám..." />
      </div>
    );
  }

  // Not authenticated → Login
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Kiosk mode → dedicated page
  if (isKiosk) {
    return <KioskPage />;
  }

  // Normal app routes
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/inspection" element={<BuildingInspectionPage />} />
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/inventory" element={<InventoryPage />} />
      <Route path="/fleet" element={<FleetPage />} />
      <Route path="/revisions" element={<RevisionsPage />} />
      <Route path="/asset/:assetId" element={<AssetCardPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/waste" element={<WastePage />} />
      <Route path="/trustbox" element={<TrustBoxPage />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/ai" element={<AIAssistantPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/louparna" element={<LouparnaPage />} />
      <Route path="/kiosk" element={<KioskPage />} />
      <Route path="/inspections" element={<InspectionsPage />} />
      <Route path="/noticeboard" element={<NoticeboardPage />} />
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ═══════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProtectedRoutes />
        <ToastContainer />
      </AuthProvider>
    </BrowserRouter>
  );
}
