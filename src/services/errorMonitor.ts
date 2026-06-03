import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';

export interface ErrorMonitorUser {
  id?: string;
  uid?: string;
  displayName?: string;
  role?: string;
  tenantId?: string;
}

interface LogAppErrorInput {
  error: unknown;
  user?: ErrorMonitorUser | null;
  action?: string;
  severity?: 'warning' | 'error' | 'fatal';
  componentStack?: string;
  handled?: boolean;
  context?: Record<string, unknown>;
}

function trimText(value: unknown, maxLength = 6000) {
  if (typeof value !== 'string') return '';
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Neznámá chyba',
      stack: trimText(error.stack),
    };
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: error, stack: '' };
  }

  try {
    return {
      name: 'Error',
      message: JSON.stringify(error),
      stack: '',
    };
  } catch {
    return { name: 'Error', message: 'Neznámá chyba', stack: '' };
  }
}

export async function logAppError({
  error,
  user,
  action = 'APP_ERROR',
  severity = 'error',
  componentStack,
  handled = false,
  context,
}: LogAppErrorInput) {
  if (!isFirebaseConfigured) return;

  const userId = user?.uid || user?.id;
  if (!userId) return;

  const serialized = serializeError(error);

  try {
    await addDoc(collection(db, 'audit_logs'), {
      type: 'error',
      category: 'app_error',
      action,
      severity,
      handled,
      name: serialized.name,
      message: serialized.message,
      stack: serialized.stack,
      componentStack: trimText(componentStack),
      path: typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '',
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      userId,
      userName: user?.displayName || 'Neznámý uživatel',
      userRole: user?.role || '',
      tenantId: user?.tenantId || 'main_firm',
      context: context || {},
      createdAt: serverTimestamp(),
    });
  } catch (loggingError) {
    console.warn('[ErrorMonitor] Chybu se nepodařilo uložit:', loggingError);
  }
}
