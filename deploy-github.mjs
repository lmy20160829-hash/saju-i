// ============================================================
// deploy-github.mjs — GitHub Pages 배포 스크립트
//
// 이 컴퓨터에는 git이 설치되어 있지 않아서,
// GitHub CLI(gh)의 API 기능으로 직접 배포한다.
//
// 사전 준비: gh auth login (GitHub 로그인, 한 번만)
// 실행:      node deploy-github.mjs
//
// 하는 일:
//   1. saju-i 저장소가 없으면 만든다 (공개 저장소)
//   2. 아래 목록의 파일을 커밋 하나로 업로드한다
//   3. GitHub Pages를 켠다 → https://<아이디>.github.io/saju-i/
// ============================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const REPO = 'saju-i';
// gh 실행 파일 위치 (PATH에 없으면 ~/bin/gh 사용)
const GH = existsSync(`${homedir()}/bin/gh`) ? `${homedir()}/bin/gh` : 'gh';

// 저장소에 올릴 파일 목록 (node_modules 등 제외)
const FILES = [
  '.gitignore',
  '.env.example',
  'README.md',
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'package.json',
  'package-lock.json',
  'serve.mjs',
  'test-core.mjs',
  'verify.mjs',
  'deploy-github.mjs',
  'api/interpret.mjs',
  'api/tts.mjs',
  'proxy/cloudflare-worker.js',
  'proxy/wrangler.toml',
  'proxy-vercel/package.json',
  'proxy-vercel/vercel.json',
  'proxy-vercel/api/interpret.js',
  'proxy-vercel/api/tts.js',
  'css/style.css',
  'js/app.js',
  'js/saju-core.js',
  'js/cities.js',
  'js/config.js',
  'js/interpret.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'vendor/manseryeok.mjs',
  'vendor/lunar.js',
  'vendor/LICENSE-manseryeok',
  'vendor/LICENSE-lunar-javascript',
];

// gh 명령을 실행하고 결과(JSON)를 돌려주는 도우미
function gh(args, inputObj = null) {
  const res = spawnSync(GH, args, {
    input: inputObj ? JSON.stringify(inputObj) : undefined,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  return { ok: res.status === 0, out: res.stdout, err: res.stderr };
}
function ghJson(args, inputObj = null) {
  const { ok, out, err } = gh(args, inputObj);
  if (!ok) throw new Error(err || out);
  return JSON.parse(out);
}

// ── 0. 로그인 확인 ──────────────────────────────────────────
const who = gh(['api', 'user']);
if (!who.ok) {
  console.error('❌ GitHub 로그인이 필요해요. 먼저 실행하세요:  gh auth login');
  process.exit(1);
}
const OWNER = JSON.parse(who.out).login;
console.log(`✅ 로그인 확인: ${OWNER}`);

// ── 1. 저장소 만들기 (이미 있으면 그대로 사용) ──────────────
const repoCheck = gh(['api', `repos/${OWNER}/${REPO}`]);
if (repoCheck.ok) {
  console.log(`✅ 저장소가 이미 있어요: ${OWNER}/${REPO}`);
} else {
  const created = gh([
    'repo', 'create', REPO, '--public',
    '--description', '복고양이가 만세력으로 봐주는 사주명리 웹앱 🐱',
  ]);
  if (!created.ok) throw new Error('저장소 생성 실패: ' + created.err);
  console.log(`✅ 저장소 생성: ${OWNER}/${REPO}`);
}

// ── 1.5 빈 저장소 초기화 ────────────────────────────────────
// 완전히 빈 저장소에는 blob API를 쓸 수 없어서(409 에러),
// 파일 하나(README)를 먼저 올려 첫 커밋을 만들어 둔다.
const emptyCheck = gh(['api', `repos/${OWNER}/${REPO}/git/ref/heads/main`]);
if (!emptyCheck.ok) {
  const readmeB64 = readFileSync('README.md').toString('base64');
  const boot = gh(
    ['api', '-X', 'PUT', `repos/${OWNER}/${REPO}/contents/README.md`, '--input', '-'],
    { message: '저장소 초기화', content: readmeB64 }
  );
  if (!boot.ok) throw new Error('저장소 초기화 실패: ' + boot.err);
  console.log('✅ 빈 저장소 초기화 (README 업로드)');
}

// ── 2. 파일 업로드 (커밋 하나로) ────────────────────────────
// GitHub의 저장 방식 그대로:
//   blob(파일 내용) → tree(폴더 구조) → commit(기록) → ref(브랜치)
console.log('⏳ 파일 업로드 중...');
const treeEntries = [];
for (const path of FILES) {
  const content = readFileSync(path).toString('base64');
  const blob = ghJson(
    ['api', '-X', 'POST', `repos/${OWNER}/${REPO}/git/blobs`, '--input', '-'],
    { content, encoding: 'base64' }
  );
  treeEntries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  console.log(`   · ${path}`);
}

const tree = ghJson(
  ['api', '-X', 'POST', `repos/${OWNER}/${REPO}/git/trees`, '--input', '-'],
  { tree: treeEntries }
);

// 이미 커밋이 있으면 이어서(parent), 빈 저장소면 첫 커밋으로
const mainRef = gh(['api', `repos/${OWNER}/${REPO}/git/ref/heads/main`]);
const parents = mainRef.ok ? [JSON.parse(mainRef.out).object.sha] : [];

const commit = ghJson(
  ['api', '-X', 'POST', `repos/${OWNER}/${REPO}/git/commits`, '--input', '-'],
  { message: '사주아이 업데이트', tree: tree.sha, parents }
);

if (mainRef.ok) {
  ghJson(
    ['api', '-X', 'PATCH', `repos/${OWNER}/${REPO}/git/refs/heads/main`, '--input', '-'],
    { sha: commit.sha, force: false }
  );
} else {
  ghJson(
    ['api', '-X', 'POST', `repos/${OWNER}/${REPO}/git/refs`, '--input', '-'],
    { ref: 'refs/heads/main', sha: commit.sha }
  );
}
console.log(`✅ 업로드 완료 (커밋 ${commit.sha.slice(0, 7)})`);

// ── 3. GitHub Pages 켜기 ────────────────────────────────────
const pages = gh(
  ['api', '-X', 'POST', `repos/${OWNER}/${REPO}/pages`, '--input', '-'],
  { source: { branch: 'main', path: '/' } }
);
if (pages.ok) {
  console.log('✅ GitHub Pages 활성화');
} else if (pages.err.includes('409') || pages.err.includes('already')) {
  console.log('✅ GitHub Pages 이미 켜져 있음');
} else {
  console.log('⚠️ Pages 설정 응답:', pages.err.slice(0, 200));
}

console.log(`\n🎉 잠시 후(1~2분) 접속 가능:  https://${OWNER}.github.io/${REPO}/`);
