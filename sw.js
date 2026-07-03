// ============================================================
// sw.js — 서비스워커 (PWA의 심부름꾼)
//
// 하는 일: 한 번 받은 파일(CSS·JS·라이브러리)을 브라우저 안에
// 저장해 두었다가, 다음 방문 때 훨씬 빠르게 보여준다.
//
// 규칙:
//   · HTML(첫 페이지)은 항상 인터넷에서 새로 받는다
//     (업데이트가 바로 반영되도록) — 안 되면 저장본 사용
//   · 나머지 파일은 저장본 우선, 없으면 인터넷에서
//   · AI 해석(/api/)은 절대 저장하지 않는다 (매번 새 요청)
// ============================================================
const CACHE_NAME = 'saju-i-v1'; // 파일을 크게 바꾸면 v2, v3...로 올린다

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 옛 버전 저장소는 지운다
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 우리 사이트 파일이 아니거나(GET이 아니거나) 해석 요청이면 관여하지 않는다
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/api/')) return;

  // HTML은 "인터넷 우선" — 실패하면 저장본
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 나머지는 "저장본 우선" — 없으면 인터넷에서 받아서 저장
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
