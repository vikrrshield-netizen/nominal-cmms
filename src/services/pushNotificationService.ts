import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app, db, firebaseConfig, isFirebaseConfigured } from '../lib/firebase';

export type PushSetupResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'unsupported' | 'missing-key' | 'denied' | 'error'; message: string };

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

function tokenDocId(token: string) {
  return btoa(token).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function enablePushNotifications(user: {
  id?: string;
  uid?: string;
  displayName?: string;
  role?: string;
  tenantId?: string;
}): Promise<PushSetupResult> {
  if (!isFirebaseConfigured || !(await isSupported())) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Tento telefon nebo prohlížeč webová upozornění nepodporuje.',
    };
  }

  if (!vapidKey) {
    return {
      ok: false,
      reason: 'missing-key',
      message: 'Upozornění nejsou zatím aktivní. Správce musí dokončit nastavení ve Firebase.',
    };
  }

  if (!('serviceWorker' in navigator)) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Upozornění nejsou v tomto prohlížeči dostupná.',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Telefon upozornění nepovolil. Povolte je v nastavení prohlížeče nebo aplikace.',
    };
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return {
        ok: false,
        reason: 'error',
        message: 'Upozornění se nepodařilo zapnout. Zkuste stránku obnovit a povolit je znovu.',
      };
    }

    const uid = user.uid || user.id || '';
    await setDoc(doc(db, 'pushTokens', tokenDocId(token)), {
      token,
      userId: uid,
      userName: user.displayName || '',
      role: user.role || '',
      tenantId: user.tenantId || 'main_firm',
      platform: navigator.userAgent,
      enabled: true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });

    return { ok: true, token };
  } catch (err) {
    console.error('[Push] enable failed:', err);
    return {
      ok: false,
      reason: 'error',
      message: 'Upozornění se nepodařilo zapnout. Zkuste to později znovu.',
    };
  }
}

export async function listenForForegroundPush(callback: (payload: { title: string; body: string; url?: string }) => void) {
  if (!isFirebaseConfigured || !(await isSupported())) return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    callback({
      title: payload.notification?.title || payload.data?.title || 'VIKRSHIELD',
      body: payload.notification?.body || payload.data?.body || '',
      url: payload.data?.url,
    });
  });
}

export function firebaseMessagingConfigForDebug() {
  return {
    projectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    hasVapidKey: Boolean(vapidKey),
  };
}
