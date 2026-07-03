// ============================================================
// serve.mjs — 개발용 미니 웹서버 (Node 내장 기능만 사용)
//
// 실행:  npm run dev   (또는  node serve.mjs)
// 접속:  http://localhost:8890
//
// 왜 필요한가?
//   index.html을 파일로 바로 열면(file://) 브라우저 보안 규칙 때문에
//   자바스크립트 모듈을 불러올 수 없다. 그래서 작은 서버를 띄워
//   실제 웹사이트처럼(http://) 열어 본다.
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { handleInterpret } from './api/interpret.mjs';

const PORT = 8890;
const ROOT = new URL('.', import.meta.url).pathname;

// 파일 확장자 → 브라우저에게 알려줄 파일 종류
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  try {
    // 주소에서 물음표(?) 뒷부분은 떼고 파일 경로만 사용
    let path = new URL(req.url, 'http://x').pathname;

    // AI 해석 요청은 파일이 아니라 프록시(api/interpret.mjs)가 처리
    if (path === '/api/interpret' && req.method === 'POST') {
      return await handleInterpret(req, res);
    }

    if (path === '/') path = '/index.html';
    // 프로젝트 폴더 밖의 파일은 못 읽게 막는다
    const filePath = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — 파일을 찾을 수 없어요');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`사주아이 개발 서버: http://localhost:${PORT}`);
});
