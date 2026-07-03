// ============================================================
// sw.js — 서비스워커 (PWA의 심부름꾼)
//
// 하는 일: 받은 파일을 브라우저 안에 저장해 두었다가,
// 인터넷이 느리거나 끊겼을 때도 앱이 열리게 해준다.
//
// 규칙 (모두 "인터넷 우선"):
//   · 항상 인터넷에서 최신 파일을 먼저 받는다
//     → 앱을 업데이트하면 모든 사용자에게 바로 반영된다
//   · 인터넷이 안 될 때만 저장본을 사용한다 (오프라인 대비)
//   · AI 해석(/api/)은 절대 저장하지 않는다 (매번 새 요청)
// ============================================================
const CACHE_NAME = 'saju-i-v2'; // 버전을 올리면 옛 저장소는 자동으로 지워진다

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 옛 버전 저장소는 지우고, 열려 있는 화면도 바로 새 워커가 맡는다
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 우리 사이트 파일이 아니거나(GET이 아니거나) 해석 요청이면 관여하지 않는다
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/api/')) return;

  // 인터넷 우선 — 성공하면 저장해 두고, 실패하면(오프라인) 저장본 사용
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
