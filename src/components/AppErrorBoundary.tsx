import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { logAppError, type ErrorMonitorUser } from '../services/errorMonitor';

interface BoundaryProps {
  children: ReactNode;
  user: ErrorMonitorUser | null;
}

interface BoundaryState {
  error: Error | null;
}

const DYNAMIC_IMPORT_RELOAD_KEY = 'vikrr-dynamic-import-reload-v1';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error || '');
}

function isDynamicImportError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module')
    || message.includes('importing a module script failed')
    || message.includes('loading chunk')
    || message.includes('chunkloaderror')
  );
}

class AppErrorBoundaryInner extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void logAppError({
      error,
      user: this.props.user,
      action: 'REACT_RENDER_ERROR',
      severity: 'fatal',
      componentStack: info.componentStack || '',
      handled: true,
    });

    if (isDynamicImportError(error)) {
      const alreadyReloaded = sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) === '1';
      if (!alreadyReloaded) {
        sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, '1');
        window.location.reload();
        return;
      }
    } else {
      sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-[#f1ece3] text-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-2xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold">Aplikace narazila na chybu</h1>
              <p className="text-slate-600 text-sm mt-2">
                Chyba se uložila do administrace do záložky Chyby. Můžeš obnovit stránku a pokračovat.
              </p>
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 break-words">
                {this.state.error.message || 'Neznámá chyba'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Zkusit obnovit
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition text-slate-700 font-semibold flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  return <AppErrorBoundaryInner user={user} children={children} />;
}

// ───────────────────────────────────────────────────────────────────
// ROUTE-LEVEL BOUNDARY — chytá pád jedné stránky a nechá rám appky
// (boční lišta / spodní menu) naživu, aby šlo přejít jinam. Resetuje se
// automaticky při změně route (přes `key`) i tlačítkem.
// ───────────────────────────────────────────────────────────────────

class RouteErrorBoundaryInner extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void logAppError({
      error,
      user: this.props.user,
      action: 'REACT_RENDER_ERROR',
      severity: 'fatal',
      componentStack: info.componentStack || '',
      handled: true,
    });

    if (isDynamicImportError(error)) {
      const alreadyReloaded = sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) === '1';
      if (!alreadyReloaded) {
        sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, '1');
        window.location.reload();
        return;
      }
    } else {
      sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="vik-fade-in flex items-center justify-center p-4 py-16">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold">Tahle stránka narazila na chybu</h1>
              <p className="text-slate-600 text-sm mt-2">
                Zbytek aplikace funguje dál — můžeš přejít jinam přes menu, nebo zkusit stránku načíst znovu.
                Chyba se uložila do administrace do záložky Chyby.
              </p>
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 break-words">
                {this.state.error.message || 'Neznámá chyba'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Zkusit znovu
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition text-slate-700 font-semibold flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  return <RouteErrorBoundaryInner user={user} children={children} />;
}

export function AppErrorListeners() {
  const { user } = useAuthContext();

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      void logAppError({
        error: event.error || event.message,
        user,
        action: 'WINDOW_ERROR',
        severity: 'error',
        handled: false,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void logAppError({
        error: event.reason,
        user,
        action: 'UNHANDLED_REJECTION',
        severity: 'error',
        handled: false,
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [user]);

  return null;
}
