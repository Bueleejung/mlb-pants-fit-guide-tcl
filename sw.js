const CACHE_NAME = 'fit-guide-v6';
const CORE = ['./', './index.html'];

// 설치: 코어(HTML)만 미리 캐싱. 영상은 사용/프리페치 시 캐싱됨
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE).catch((err) => console.warn('코어 캐시 실패:', err)))
      .then(() => self.skipWaiting())
  );
});

// 활성화: 이전 버전 캐시 제거
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // ── 영상(.mp4): 캐시 우선 → 없으면 받아서 캐시에 저장 ──
  // (한 번 받으면 다음부터는 즉시 로드 → 전환 흰화면/버퍼링 제거)
  if (url.endsWith('.mp4')) {
    e.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(e.request, { ignoreVary: true }).then((hit) => {
          if (hit) return hit;
          // range 요청이면 전체 파일을 새로 받아 캐시(200)하고, 그 본문을 반환
          const full = new Request(url, { headers: {}, mode: 'cors', credentials: 'omit' });
          return fetch(full).then((res) => {
            if (res && res.status === 200) {
              cache.put(url, res.clone()).catch(() => {});
            }
            return res;
          }).catch(() => fetch(e.request)); // 실패 시 원래 요청대로
        })
      )
    );
    return;
  }

  // ── HTML 등: 네트워크 우선(최신 코드 보장), 실패 시 캐시 ──
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
