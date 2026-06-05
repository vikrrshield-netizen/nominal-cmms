import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

export const isFirebaseConfigured =
  typeof envApiKey === 'string'
  && envApiKey.trim().length > 0
  && !envApiKey.includes('...')
  && typeof envProjectId === 'string'
  && envProjectId.trim().length > 0
  && !envProjectId.includes('...');

export const isSandboxLoginEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_SANDBOX_LOGIN === 'true';

// F2 přepínač: true = přihlášení přes Cloud Function loginWithPin (custom token),
// false = stará cesta (e-mail/heslo odvozené z PINu). Default false do F2.
export const useTokenLogin = import.meta.env.VITE_USE_TOKEN_LOGIN === 'true';

export const firebaseConfig = {
  apiKey: envApiKey || 'AIzaSyDUMMY_LOCAL_DEMO_KEY_DO_NOT_USE',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'nominal-local-demo.firebaseapp.com',
  projectId: envProjectId || 'nominal-local-demo',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'nominal-local-demo.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:localdemo'
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

setPersistence(auth, browserLocalPersistence);

enableIndexedDbPersistence(db).catch((err) => {
  console.warn('Offline persistence:', err.code);
});

const pinToEmail = (pin: string): string => `pin_${pin}@nominal.local`;
const sandboxUser = {
  uid: 'sandbox-user',
  email: 'sandbox@nominal.local',
} as FirebaseUser;

const notifySandboxAuthChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('nominal-sandbox-auth-changed'));
  }
};

export const signInWithPin = async (pin: string): Promise<FirebaseUser> => {
  if (pin === '0000') {
    if (!isSandboxLoginEnabled) {
      throw new Error('Demo login is disabled in this environment.');
    }
    notifySandboxAuthChanged();
    return sandboxUser;
  }

  if (!isFirebaseConfigured) {
    throw new Error('Firebase neni nastaveny. Pro lokalni ukazku pouzij PIN 0000.');
  }

  // F2+: přihlášení přes Cloud Function (PIN se nepřevádí na heslo)
  if (useTokenLogin) {
    const callable = httpsCallable<{ pin: string }, { token: string }>(functions, 'loginWithPin');
    const res = await callable({ pin });
    const token = res.data?.token;
    if (!token) throw new Error('Přihlášení selhalo.');
    const result = await signInWithCustomToken(auth, token);
    return result.user;
  }

  // Legacy (F1): e-mail + heslo odvozené z PINu
  const email = pinToEmail(pin);
  const password = pin + '00';
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

// Admin: nastavit/změnit PIN uživatele (hash počítá server kvůli pepperu)
export const adminSetUserPin = async (userId: string, pin: string): Promise<void> => {
  const callable = httpsCallable<{ userId: string; pin: string }, { ok: boolean }>(functions, 'adminSetUserPin');
  await callable({ userId, pin });
};

// Admin/migrace: doplnit pinHash všem (F1) — stará cesta dál funguje
export const adminBackfillPinHashes = async (): Promise<{ updated: number; skipped: number }> => {
  const callable = httpsCallable<Record<string, never>, { updated: number; skipped: number }>(functions, 'backfillPinHashes');
  const res = await callable({});
  return res.data;
};

// Admin/migrace: vypnout starou cestu (F3, NEVRATNÉ) — náhodná hesla + smazat plaintext PIN
export const adminDisableLegacyLogin = async (): Promise<{ processed: number; missingSecret: number }> => {
  const callable = httpsCallable<{ confirm: string }, { processed: number; missingSecret: number }>(functions, 'disableLegacyLogin');
  const res = await callable({ confirm: 'ANO' });
  return res.data;
};

export const signOut = async (): Promise<void> => {
  if (!isFirebaseConfigured || (isSandboxLoginEnabled && sessionStorage.getItem('nominal-sandbox') === 'true')) {
    notifySandboxAuthChanged();
    return;
  }

  await firebaseSignOut(auth);
};

export const onAuthChange = (callback: (user: FirebaseUser | null) => void) => {
  const emitCurrentSandboxState = () => {
    if (!isSandboxLoginEnabled) {
      sessionStorage.removeItem('nominal-sandbox');
      callback(null);
      return;
    }
    callback(sessionStorage.getItem('nominal-sandbox') === 'true' ? sandboxUser : null);
  };

  if (!isFirebaseConfigured) {
    queueMicrotask(emitCurrentSandboxState);
    window.addEventListener('nominal-sandbox-auth-changed', emitCurrentSandboxState);
    return () => window.removeEventListener('nominal-sandbox-auth-changed', emitCurrentSandboxState);
  }

  const unsubscribeFirebase = onAuthStateChanged(auth, (user) => {
    if (isSandboxLoginEnabled && sessionStorage.getItem('nominal-sandbox') === 'true') {
      callback(sandboxUser);
      return;
    }
    if (!isSandboxLoginEnabled) {
      sessionStorage.removeItem('nominal-sandbox');
    }
    callback(user);
  });
  window.addEventListener('nominal-sandbox-auth-changed', emitCurrentSandboxState);
  return () => {
    unsubscribeFirebase();
    window.removeEventListener('nominal-sandbox-auth-changed', emitCurrentSandboxState);
  };
};

export const isOnline = () => navigator.onLine;

export default app;
