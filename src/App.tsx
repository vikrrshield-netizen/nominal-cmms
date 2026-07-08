// src/App.tsx
// VIKRR — Asset Shield — Hlavní aplikace s routingem

import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuthContext } from './context/AuthContext';
import { LoadingSpinner } from './components/ui';
import AppCoach from './components/ui/AppCoach';
import AppShell from './components/AppShell';
import ToastContainer, { showToast } from './components/ui/Toast';
import { AppErrorBoundary, AppErrorListeners, RouteErrorBoundary } from './components/AppErrorBoundary';
import { useTenantSettings, TenantSettingsProvider } from './hooks/useTenantSettings';
import { listenForForegroundPush } from './services/pushNotificationService';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const KioskPage = lazy(() => import('./pages/KioskPage'));
const BuildingInspectionPage = lazy(() => import('./pages/BuildingInspectionPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const FleetPage = lazy(() => import('./pages/FleetPage'));
const VzvPage = lazy(() => import('./pages/VzvPage'));
const HvacPage = lazy(() => import('./pages/HvacPage'));
const CalibrationPage = lazy(() => import('./pages/CalibrationPage'));
const GlassRegisterPage = lazy(() => import('./pages/GlassRegisterPage'));
const DetectorsPage = lazy(() => import('./pages/DetectorsPage'));
const OversightPage = lazy(() => import('./pages/OversightPage'));
const GuidesPage = lazy(() => import('./pages/GuidesPage'));
const LabelsPage = lazy(() => import('./pages/LabelsPage'));
const GearboxesPage = lazy(() => import('./pages/GearboxesPage'));
const DataloggersPage = lazy(() => import('./pages/DataloggersPage'));
const RevisionsPage = lazy(() => import('./pages/RevisionsPage'));
const AssetCardPage = lazy(() => import('./pages/AssetCardPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const TrustBoxPage = lazy(() => import('./pages/TrustBoxPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const InspectionsPage = lazy(() => import('./pages/InspectionsPage'));
const NoticeboardPage = lazy(() => import('./pages/NoticeboardPage'));
const AcademyPage = lazy(() => import('./pages/AcademyPage'));
const SchedulesPage = lazy(() => import('./pages/SchedulesPage'));
const PersonalDiaryPage = lazy(() => import('./pages/PersonalDiaryPage'));
const WorkDiaryPage = lazy(() => import('./pages/WorkDiaryPage'));
const ProductionPage = lazy(() => import('./pages/ProductionPage'));
const MasterDataPage = lazy(() => import('./pages/MasterDataPage'));
const WarehousePage = lazy(() => import('./pages/WarehousePage'));
const ShiftPlannerPage = lazy(() => import('./pages/ShiftPlannerPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const KartotekaPage = lazy(() => import('./pages/KartotekaPage'));
const MachineOverviewPage = lazy(() => import('./pages/MachineOverviewPage'));
const ProductionLinesPage = lazy(() => import('./pages/ProductionLinesPage'));
const MapaArealuPage = lazy(() => import('./pages/MapaArealuPage'));
const PreviewPage = lazy(() => import('./pages/PreviewPage'));

// ═══════════════════════════════════════════════════════════════════
// PROTECTED ROUTE WRAPPER
// ═══════════════════════════════════════════════════════════════════

function SandboxBanner() {
  const { isSandbox } = useAuthContext();
  if (!isSandbox) return null;
  return (
    <div className="bg-blue-600 text-white text-center py-2 text-sm font-bold tracking-wider sticky top-0 z-50 shadow-lg shadow-blue-600/30">
      UČŇOVSKÝ TRENAŽÉR — Změny se neukládají
    </div>
  );
}

function PageLoading() {
  return (
    <div className="min-h-screen bg-[#f1ece3] flex items-center justify-center">
      <LoadingSpinner size="lg" text="Načítám modul..." />
    </div>
  );
}

function NoAccessPage({ title = 'Sem nemáš přístup', message }: { title?: string; message?: string }) {
  return (
    <div className="min-h-screen bg-[#f1ece3] flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl">
        <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Oprávnění</p>
        <h1 className="mt-2 text-2xl font-black">{title}</h1>
        <p className="mt-3 text-slate-600">
          {message || 'Tahle část aplikace není povolená pro tvoji roli. Pokud ji potřebuješ, musí ti správce upravit oprávnění.'}
        </p>
        <a
          href="/"
          className="mt-5 inline-flex rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700"
        >
          Zpět na dashboard
        </a>
      </div>
    </div>
  );
}

function RequirePermission({
  children,
  moduleId,
  permissions = [],
  roles = [],
}: {
  children: ReactNode;
  moduleId?: string;
  permissions?: string[];
  roles?: string[];
}) {
  const { user, hasPermission } = useAuthContext();
  const { tenants, loading } = useTenantSettings();
  const tenant = tenants.find((item) => item.id === user?.tenantId);
  const moduleAllowed = !moduleId || loading || !tenant || tenant.activeModules.includes(moduleId);
  const allowedByRole = !!user && roles.includes(user.role);
  const allowedByPermission = permissions.length === 0 || permissions.some((permission) => hasPermission(permission));

  if (!moduleAllowed) {
    return (
      <NoAccessPage
        title="Modul je vypnutý"
        message="Tenhle modul je v administraci vypnutý pro celou firmu. Zapnout ho může správce v nastavení modulů."
      />
    );
  }

  if (allowedByRole || allowedByPermission) {
    return <>{children}</>;
  }

  return <NoAccessPage />;
}

function ProtectedPage({
  children,
  moduleId,
  permissions,
  roles,
}: {
  children: ReactNode;
  moduleId?: string;
  permissions?: string[];
  roles?: string[];
}) {
  return (
    <RequirePermission moduleId={moduleId} permissions={permissions} roles={roles}>
      {children}
    </RequirePermission>
  );
}

function RoutedContent() {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.pathname}>
      <div className="vik-fade-in">
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/inspection" element={<ProtectedPage moduleId="inspections" permissions={['asset.read', 'weekly.modify']}><BuildingInspectionPage /></ProtectedPage>} />
        <Route path="/tasks" element={<ProtectedPage moduleId="tasks" permissions={['wo.read']}><TasksPage /></ProtectedPage>} />
        <Route path="/inventory" element={<ProtectedPage permissions={['inv.consume', 'inv.restock', 'inv.manage', 'inv.order']}><InventoryPage /></ProtectedPage>} />
        <Route path="/fleet" element={<ProtectedPage moduleId="fleet" permissions={['fleet.read', 'fleet.manage']}><FleetPage /></ProtectedPage>} />
        <Route path="/vzv" element={<ProtectedPage moduleId="fleet" permissions={['fleet.read', 'fleet.manage']}><VzvPage /></ProtectedPage>} />
        <Route path="/hvac" element={<ProtectedPage moduleId="hvac" permissions={['asset.read', 'hvac.read', 'hvac.manage']}><HvacPage /></ProtectedPage>} />
        <Route path="/gearboxes" element={<ProtectedPage permissions={['asset.read', 'gearbox.temperature.write', 'gearbox.manage']}><GearboxesPage /></ProtectedPage>} />
        <Route path="/dataloggers" element={<ProtectedPage permissions={['datalogger.read', 'datalogger.temperature.write', 'datalogger.manage']}><DataloggersPage /></ProtectedPage>} />
        <Route path="/revisions" element={<ProtectedPage moduleId="revisions" permissions={['asset.read']}><RevisionsPage /></ProtectedPage>} />
        <Route path="/asset/:assetId" element={<ProtectedPage permissions={['asset.read']}><AssetCardPage /></ProtectedPage>} />
        <Route path="/stroje" element={<ProtectedPage permissions={['asset.read']}><MachineOverviewPage /></ProtectedPage>} />
        <Route path="/kalibrace" element={<ProtectedPage permissions={['asset.read']}><CalibrationPage /></ProtectedPage>} />
        <Route path="/registr-skla" element={<ProtectedPage permissions={['asset.read']}><GlassRegisterPage /></ProtectedPage>} />
        <Route path="/detektory" element={<ProtectedPage permissions={['asset.read']}><DetectorsPage /></ProtectedPage>} />
        <Route path="/dohled" element={<ProtectedPage permissions={['report.read']}><OversightPage /></ProtectedPage>} />
        <Route path="/navody" element={<ProtectedPage permissions={[]}><GuidesPage /></ProtectedPage>} />
        <Route path="/stitky" element={<ProtectedPage permissions={['asset.read']}><LabelsPage /></ProtectedPage>} />
        <Route path="/linky" element={<ProtectedPage permissions={['asset.read']}><ProductionLinesPage /></ProtectedPage>} />
        <Route path="/mapa" element={<ProtectedPage permissions={['asset.read']}><MapaArealuPage /></ProtectedPage>} />
        <Route path="/calendar" element={<ProtectedPage moduleId="calendar" permissions={['wo.read', 'schedule.manage']}><CalendarPage /></ProtectedPage>} />
        <Route path="/waste" element={<Navigate to="/" replace />} />
        <Route path="/trustbox" element={<ProtectedPage permissions={['secretbox.view']}><TrustBoxPage /></ProtectedPage>} />
        <Route path="/map" element={<Navigate to="/kartoteka" replace />} />
        <Route path="/reports" element={<ProtectedPage permissions={['report.read', 'audit.read']}><ReportsPage /></ProtectedPage>} />
        <Route
          path="/admin"
          element={(
            <RequirePermission moduleId="admin" permissions={['admin.view', 'admin.manage']} roles={['SUPERADMIN', 'VEDENI', 'MAJITEL']}>
              <AdminPage />
            </RequirePermission>
          )}
        />
        <Route path="/ai" element={<ProtectedPage permissions={['ai.use']}><AIAssistantPage /></ProtectedPage>} />
        <Route path="/notifications" element={<ProtectedPage><NotificationsPage /></ProtectedPage>} />
        <Route path="/louparna" element={<Navigate to="/" replace />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/inspections" element={<ProtectedPage moduleId="inspections" permissions={['asset.read', 'weekly.modify']}><InspectionsPage /></ProtectedPage>} />
        <Route path="/noticeboard" element={<NoticeboardPage />} />
        <Route path="/academy" element={<AcademyPage />} />
        <Route path="/schedules" element={<ProtectedPage permissions={['schedule.manage']}><SchedulesPage /></ProtectedPage>} />
        <Route path="/notes" element={<PersonalDiaryPage />} />
        <Route path="/work-diary" element={<ProtectedPage permissions={['wo.read', 'wo.update', 'wo.create']}><WorkDiaryPage /></ProtectedPage>} />
        <Route path="/production" element={<ProtectedPage moduleId="production" roles={['SUPERADMIN']} permissions={['production.manage']}><ProductionPage /></ProtectedPage>} />
        <Route path="/materials" element={<ProtectedPage permissions={['production.read', 'production.manage', 'report.read']}><MasterDataPage /></ProtectedPage>} />
        <Route path="/products" element={<ProtectedPage permissions={['production.read', 'production.manage', 'report.read']}><MasterDataPage /></ProtectedPage>} />
        <Route path="/warehouse" element={<ProtectedPage moduleId="warehouse" permissions={['warehouse.view', 'warehouse.manage']}><WarehousePage /></ProtectedPage>} />
        <Route path="/shifts" element={<ProtectedPage moduleId="shifts" permissions={['shifts.view', 'shifts.manage']}><ShiftPlannerPage /></ProtectedPage>} />
        <Route path="/settings" element={<ProtectedPage permissions={['admin.view', 'admin.manage']}><SettingsPage /></ProtectedPage>} />
        <Route path="/kartoteka" element={<ProtectedPage permissions={['asset.read']}><KartotekaPage /></ProtectedPage>} />
        <Route path="/preview" element={<ProtectedPage roles={['SUPERADMIN']} permissions={['preview.superadmin']}><PreviewPage /></ProtectedPage>} />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
    </RouteErrorBoundary>
  );
}

function ProtectedRoutes() {
  const { isAuthenticated, isLoading, isKiosk } = useAuthContext();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f1ece3] flex items-center justify-center">
        <LoadingSpinner size="lg" text="Načítám..." />
      </div>
    );
  }

  // Not authenticated → Login
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoading />}>
        <LoginPage />
      </Suspense>
    );
  }

  // Kiosk mode → dedicated page
  if (isKiosk) {
    return (
      <Suspense fallback={<PageLoading />}>
        <KioskPage />
      </Suspense>
    );
  }

  // Normal app routes — na PC obaleno boční lištou (AppShell), na mobilu beze změny
  return (
    <Suspense fallback={<PageLoading />}>
      <AppShell>
        <RoutedContent />
      </AppShell>
      <AppCoach />
    </Suspense>
  );
}

function ForegroundPushListener() {
  const { isAuthenticated } = useAuthContext();

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cleanup: (() => void) | undefined;
    listenForForegroundPush((payload) => {
      showToast(`${payload.title}: ${payload.body}`, 'success');
    }).then((unsubscribe) => {
      cleanup = unsubscribe;
    });
    return () => cleanup?.();
  }, [isAuthenticated]);

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantSettingsProvider>
          <AppErrorListeners />
          <ForegroundPushListener />
          <SandboxBanner />
          <AppErrorBoundary>
            <ProtectedRoutes />
          </AppErrorBoundary>
          <ToastContainer />
        </TenantSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
