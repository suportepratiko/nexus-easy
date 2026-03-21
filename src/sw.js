import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache app shell (injetado pelo vite-plugin-pwa no build)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA: navega para index.html em qualquer rota não-API
const handler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(handler, {
  denylist: [/^\/api/, /^\/ws/, /^\/health/, /^\/chatbot/],
});
registerRoute(navigationRoute);

// Estáticos: cache 30 dias
registerRoute(
  ({ request }) => ['style', 'script', 'worker', 'font', 'image'].includes(request.destination),
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);

// API: sempre rede
registerRoute(
  ({ url }) => url.pathname.startsWith('/api') || url.pathname.startsWith('/ws'),
  new NetworkOnly()
);

// ---------- Push Notifications ----------
self.addEventListener('push', (event) => {
  let data = { title: 'Nexus Bot', body: '' };
  try {
    if (event.data) data = event.data.json();
  } catch (_) {
    if (event.data) data.body = event.data.text();
  }
  const title = data.title || 'Nexus Bot';
  const options = {
    body: data.body || '',
    icon: '/logos/favicon.png',
    badge: '/logos/favicon.png',
    tag: data.tag || 'nexus',
    renotify: true,
    data: data.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        const c = clientList[0];
        if (c.url !== url) c.navigate(url);
        return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
