// ============================================================
// config.js — 해석 서버(프록시) 주소 설정
//
// 어디서 열렸는지에 따라 자동으로 프록시를 고른다:
//   · GitHub Pages(사이트)에서 → Cloudflare Worker (키는 워커 Secret에)
//   · 내 컴퓨터(npm run dev)에서 → 개발 서버 내장 프록시 (키는 .env에)
// ============================================================
export const INTERPRET_ENDPOINT = location.hostname.endsWith('github.io')
  ? 'https://saju-i-proxy.saju-i.workers.dev/api/interpret'
  : 'api/interpret';
