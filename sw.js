const CACHE_NAME = 'fit-guide-v7';
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

// 자동 복구: 앱이 "이 영상 깨진 것 같다"고 알려오면 해당 캐시만 삭제 → 다음 요청 때 새로 받음
self.addEventListener('message', (e) => {
  const d = e.data;
  if (d && d.type === 'PURGE' && d.url) {
    caches.open(CACHE_NAME)
      .then((c) => c.delete(d.url, { ignoreVary: true }))
      .catch(() => {});
  }
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // ── 영상(.mp4): 캐시 우선, 없으면 "끝까지 다 받은 뒤에만" 저장 ──
  if (url.endsWith('.mp4')) {
    e.respondWith(handleVideo(e.request, url));
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

// 영상 처리: 반쪽짜리(잘린) 캐시가 생기지 않도록,
// 네트워크에서 전체를 끝까지 받은 뒤에만 캐시에 저장한다.
async function handleVideo(request, url) {
  const cache = await caches.open(CACHE_NAME);
  let res = await cache.match(url, { ignoreVary: true });

  if (!res) {
    try {
      const net = await fetch(new Request(url, { mode: 'cors', credentials: 'omit' }));
      if (!net || net.status !== 200) return net;           // 비정상 응답은 캐시 안 함
      const buf = await net.arrayBuffer();                  // ★ 전체를 끝까지 다운로드
      res = new Response(buf, {
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.byteLength) }
      });
      await cache.put(url, res.clone()).catch(() => {});    // ★ 완전한 파일만 저장
    } catch {
      return fetch(request);                                // 네트워크 실패 시 원래 요청대로
    }
  }

  // 키오스크 WebView 영상 재생기가 기대하는 Range(206) 응답으로 변환 → 검정화면 방지
  return toRangeResponse(res, request);
}

async function toRangeResponse(res, request) {
  const buf = await res.arrayBuffer();
  const len = buf.byteLength;
  const range = request.headers.get('range');

  if (!range) {
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(len),
        'Accept-Ranges': 'bytes'
      }
    });
  }

  const m = /bytes=(\d+)-(\d*)/.exec(range);
  const start = m ? parseInt(m[1], 10) : 0;
  const end   = (m && m[2]) ? parseInt(m[2], 10) : len - 1;
  const chunk = buf.slice(start, end + 1);

  return new Response(chunk, {
    status: 206,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${len}`,
      'Content-Length': String(chunk.byteLength),
      'Accept-Ranges': 'bytes'
    }
  });
}
