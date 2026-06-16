const CACHE_NAME = 'fit-guide-v4';
const ASSETS = [
  './',
  './index.html',
];

// 설치: HTML만 캐싱 (영상은 네트워크에서 직접 로드)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('캐시 실패:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// 활성화: 이전 캐시 제거
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 요청 가로채기: 영상(.mp4)은 항상 네트워크로, 나머지는 캐시 우선
self.addEventListener('fetch', (e) => {
  if (e.request.url.endsWith('.mp4')) {
    return; // SW가 관여하지 않음 → 브라우저가 직접 네트워크 요청
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
