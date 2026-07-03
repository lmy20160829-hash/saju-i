// ============================================================
// config.js — 해석·음성 서버(프록시) 주소 설정
//
// 어디서 열렸는지에 따라 자동으로 프록시를 고른다:
//   · GitHub Pages(사이트)에서 → Vercel 프록시 (미국 서버 고정 — 키는 Vercel Secret에)
//   · 내 컴퓨터(npm run dev)에서 → 개발 서버 내장 프록시 (키는 .env에)
//
// ※ Vercel을 쓰는 이유: 구글이 Gemini 무료 등급을 일부 지역 서버에서
//   차단하는데, Vercel 함수는 항상 미국(허용 지역)에서 실행되어 안정적이다.
//   (proxy/ 폴더의 Cloudflare Worker 버전은 참고용으로 남겨둠)
// ============================================================
export const INTERPRET_ENDPOINT = location.hostname.endsWith('github.io')
  ? 'https://proxy-vercel-two-tau.vercel.app/api/interpret'
  : 'api/interpret';
