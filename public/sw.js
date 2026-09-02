/* Credenciales Digitales QR CHC - Service Worker v1.0.55
 *
 * La PWA sigue siendo una aplicacion conectada: no se cachean paginas de
 * administracion, sesiones, eventos ni respuestas de la base de datos.
 * El fetch se mantiene network-only para que la instalacion como PWA no
 * cambie la logica actual ni muestre informacion desactualizada.
 */
const SW_VERSION = 'chc-credenciales-pwa-v1.0.55';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('chc-credenciales-pwa-') && key !== SW_VERSION)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Network-only a proposito: evita cachear CSRF, sesiones, QR, asistencias,
  // premios o cualquier informacion administrativa sensible/dinamica.
  event.respondWith(fetch(event.request));
});
