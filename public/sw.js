// Service worker: ใช้ไฟล์จากเน็ตก่อนเสมอ (ได้เวอร์ชันล่าสุด) และใช้สำเนาในเครื่องเฉพาะตอนออฟไลน์
// เปลี่ยนเลข CACHE ทุกครั้งที่อยากล้างสำเนาเก่าในเครื่องผู้เล่น
const CACHE = 'ht-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/download')) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
