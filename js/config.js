// ============================================================
// config.js — 해석 서버(프록시) 주소 설정
//
// 기본값 'api/interpret' 은 "지금 열려 있는 사이트와 같은 서버"라는 뜻.
//   · 내 컴퓨터(npm run dev)에서는 → 개발 서버의 프록시가 응답 ✅
//   · GitHub Pages에서는 → 파일 서버라 프록시가 없어 안내문이 뜸
//
// 나중에 Cloudflare Worker(proxy/ 폴더 참고)를 배포하면
// 아래 주소를 워커 주소로 바꾸면 된다.
//   예: 'https://saju-i-proxy.내계정.workers.dev/api/interpret'
// ============================================================
export const INTERPRET_ENDPOINT = 'api/interpret';
