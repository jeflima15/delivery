self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* Still show a generic visible notification. */ }
  let url = '/';
  try {
    const target = new URL(payload.url, self.location.origin);
    if (target.origin === self.location.origin && /^\/[^/]+\/admin(?:\/|$)/.test(target.pathname)) url = target.pathname + target.search;
  } catch { /* Never open an external URL. */ }
  event.waitUntil(self.registration.showNotification('Pode Vir', {
    body: payload.body || 'Há novidades no painel da loja.',
    icon: '/brand/pode-vir-mark.png',
    badge: '/brand/pode-vir-mark.png',
    tag: payload.tag || 'podevir-update',
    data: { url },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || '/', self.location.origin);
    if (target.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const adminPath = target.pathname.split('/admin')[0] + '/admin';
    const existing = windows.find((client) => new URL(client.url).pathname.startsWith(adminPath));
    if (existing) { await existing.navigate(target.href); await existing.focus(); }
    else await self.clients.openWindow(target.href);
  })());
});
