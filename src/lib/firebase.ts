import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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

  const email = pinToEmail(pin);
  const password = pin + '00';
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
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
