/* Uzhu service worker: offline cache + notification clicks + optional Web Push. */
const CACHE = 'uzhu-v35'; // bump on every deploy: installed apps see the new sw.js and offer a refresh
const FILES = ['./', 'index.html', 'css/style.css', 'js/splash.js', 'js/config.js', 'js/icons.js', 'js/icons-a.js', 'js/icons-b.js', 'js/icons-c.js', 'js/illustrations.js', 'js/program.js', 'js/recipes.js', 'js/articles.js', 'js/poses.js', 'js/exercise.js', 'js/store.js', 'js/vendor/supabase.js', 'js/features-a.js', 'js/features-b.js', 'js/content-data.js', 'js/content-plus.js', 'js/sleep-data.js', 'js/sleep-sound.js', 'js/sleep.js', 'js/plus2.js', 'js/plus3.js', 'js/plus4.js', 'js/theme.js', 'js/move21.js', 'js/night-theme.js', 'js/breakfast.js', 'js/calorie.js', 'js/period.js', 'js/pregnancy-data.js', 'js/pregnancy.js', 'js/recipes-more.js', 'js/subscription.js', 'js/admin.js', 'js/gift.js', 'js/app.js', 'css/features-a.css', 'css/features-b.css', 'css/admin.css', 'css/content-plus.css', 'css/sleep.css', 'css/plus2.css', 'css/plus3.css', 'css/theme.css', 'css/move21.css', 'css/night-theme.css', 'css/breakfast.css', 'css/calorie.css', 'css/period.css', 'css/subscription.css', 'css/pregnancy.css', 'img/icon.svg', 'img/icon-192.png', 'img/icon-512.png', 'img/logos/icon-1.svg', 'img/logos/icon-2.svg', 'img/logos/icon-3.svg', 'img/logos/icon-4.svg', 'img/logos/icon-5.svg', 'img/logos/icon-6.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Network first (fresh content), but fall back to the cache when the network fails or is very slow.
  const cached = () => caches.match(e.request, { ignoreSearch: true }).then(m => m || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined));
  // no-cache: always revalidate with the server (cheap 304), so the browser's HTTP cache never hands back an old file.
  const net = fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; });
  e.respondWith(new Promise(done => {
    let settled = false;
    const t = setTimeout(() => cached().then(m => { if (m && !settled) { settled = true; done(m); } }), 4000);
    net.then(r => { clearTimeout(t); if (!settled) { settled = true; done(r); } })
      .catch(() => { clearTimeout(t); cached().then(m => { if (!settled) { settled = true; done(m || Response.error()); } }); });
  }));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'حبه 🌱', { body: d.body || '', icon: 'img/icon.svg', lang: 'fa', dir: 'rtl', data: { url: d.url || './#today' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './#today';
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ws => { for (const w of ws) { if ('focus' in w) { w.navigate(url); return w.focus(); } } return clients.openWindow(url); }));
});
