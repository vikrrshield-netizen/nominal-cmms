/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDPdaXYoHvU3usmPRurKmlUqNk7atiUEsc',
  authDomain: 'nominal-cmms.firebaseapp.com',
  projectId: 'nominal-cmms',
  storageBucket: 'nominal-cmms.firebasestorage.app',
  messagingSenderId: '756412471928',
  appId: '1:756412471928:web:dd340536ee3e97e2172b8d',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'VIKRSHIELD';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/logo_nominal.png',
    badge: '/logo_nominal.png',
    data: {
      url: payload.data?.url || '/',
    },
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    })
  );
});
