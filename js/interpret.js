// ============================================================
// interpret.js — 테마별 "고양이의 풀이" (주제 칩 + AI 해석 표시)
//
// 흐름:
//   주제 칩 클릭 → 명식의 간지 8글자 + 주제 이름만 프록시 서버로 보냄
//   → 서버가 주제별 프롬프트를 조립해 AI 해석 생성 (키는 서버에만)
//   → 받은 글을 요약 카드 + 절별 아코디언으로 표시 (interpret-render.js)
//
// 테마별 해설 구성:
//   결과를 하나의 긴 글이 아니라 주제(재물·연애·직업 …)별로 나눠,
//   사용자가 궁금한 주제를 골라 깊이 읽는 방식.
//   한 번 받은 주제는 캐시에 두어 칩을 다시 눌러도 재요청하지 않는다.
// ============================================================
import { INTERPRET_ENDPOINT } from './config.js';
import { renderMarkdownLite } from './interpret-render.js';

// 주제 목록 — id는 서버(api/interpret.mjs)의 TOPICS 화이트리스트와 같아야 한다
const TOPICS = [
  { id: 'overall', emoji: '🐱', label: '전체 풀이' },
  { id: 'wealth',  emoji: '🪙', label: '재물운' },
  { id: 'love',    emoji: '💞', label: '연애·결혼운' },
  { id: 'career',  emoji: '💼', label: '일·직업운' },
  { id: 'health',  emoji: '🌿', label: '건강·생활 리듬' },
  { id: 'people',  emoji: '🤝', label: '인간관계운' },
  { id: 'study',   emoji: '📚', label: '학업·시험운' },
  { id: 'newyear', emoji: '🎍', label: '올해의 운세' },
  { id: 'daeun',   emoji: '🌊', label: '대운 흐름' },
];

const chipsBox = document.getElementById('topic-chips');
const loading = document.getElementById('interpret-loading');
const loadingText = document.getElementById('loading-text');
const resultBox = document.getElementById('interpret-result');
const errorBox = document.getElementById('interpret-error');

// ── 기다림을 지루하지 않게: 로딩 문구 로테이션 ──────────────
// AI 생성은 십몇 초쯤 걸린다. 캐릭터 드립 문구를 돌려 가며
// 대기 시간을 재미로 채운다. (문구는 우리 마네키네코에 맞춰 썼다)
const LOADING_LINES = [
  '고양이가 만세력을 한 장씩 넘기고 있어요…',
  '여덟 글자의 기운을 저울에 달아 보는 중…',
  '오행 구슬을 앞발로 조심조심 굴리는 중…',
  '십성 카드를 차례로 뒤집어 보는 중…',
  '복방울을 딸랑딸랑 흔들어 기운을 모으는 중…',
  '금화에 복(福)을 꾹꾹 눌러 담는 중…',
  '수염 끝으로 기운의 방향을 읽는 중…',
  '가장 다정한 문장을 고르고 있어요…',
];
let loadingTimer = null;

function startLoading() {
  let i = 0;
  loadingText.textContent = LOADING_LINES[0];
  loadingTimer = setInterval(() => {
    i = (i + 1) % LOADING_LINES.length;
    loadingText.textContent = LOADING_LINES[i];
  }, 2600);
  loading.hidden = false;
}

function stopLoading() {
  clearInterval(loadingTimer);
  loadingTimer = null;
  loading.hidden = true;
}

// 최근 계산 결과 (app.js가 계산할 때마다 갱신해 준다)
let currentSaju = null;
let currentGender = 'female';
// 주제별로 받아 둔 풀이 (같은 명식 안에서만 유효)
let readingCache = new Map();
// 지금 요청 중인지 (동시에 두 주제를 요청하지 않게)
let isLoading = false;

// ── 주제 칩 만들기 (처음 한 번) ─────────────────────────────
const chipButtons = new Map();
for (const topic of TOPICS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  // 전체 풀이는 대표 메뉴, 올해의 운세·대운 흐름은 시즌·인생 메뉴 — 한 줄 전체 폭
  btn.className =
    'topic-chip' +
    (topic.id === 'overall' ? ' topic-chip-overall' : '') +
    (topic.id === 'newyear' ? ' topic-chip-newyear' : '') +
    (topic.id === 'daeun' ? ' topic-chip-daeun' : '');
  btn.innerHTML = `<span class="chip-emoji" aria-hidden="true">${topic.emoji}</span>${topic.label}`;
  btn.addEventListener('click', () => showTopic(topic));
  chipsBox.appendChild(btn);
  chipButtons.set(topic.id, btn);
}

export function setInterpretTarget(saju, gender) {
  currentSaju = saju;
  currentGender = gender;
  // 새로 계산했으면 이전 명식의 풀이는 모두 지운다
  readingCache = new Map();
  resultBox.hidden = true;
  resultBox.innerHTML = '';
  errorBox.hidden = true;
  for (const btn of chipButtons.values()) {
    btn.classList.remove('is-active', 'is-done');
    btn.disabled = false;
  }
}

// ── 서버로 보낼 공통 재료: 간지 한자와 성별뿐 ────────────────
function basePayload() {
  return {
    pillars: {
      year: currentSaju.pillars.year.hanja,
      month: currentSaju.pillars.month.hanja,
      day: currentSaju.pillars.day.hanja,
      hour: currentSaju.pillars.hour ? currentSaju.pillars.hour.hanja : null,
    },
    gender: currentGender,
  };
}

// 계산된 대운 목록 — 표에 있는 간지와 숫자뿐이라 서버가 그대로 검증한다
function daeunList() {
  return currentSaju.daeun.pillars.map((p) => ({
    ganzhi: p.hanja,
    startAge: p.startAge,
    startYear: p.startYear,
  }));
}

// ── 풀이 요청 공통 흐름: 캐시 확인 → 서버 요청 → 표시 ──────────
// job: { cacheKey, chipId(칩 주제일 때만), emoji, label, payload }
async function requestReading(job) {
  if (!currentSaju || isLoading) return;
  errorBox.hidden = true;

  // 이미 받아 둔 풀이면 다시 요청하지 않고 바로 보여준다
  if (readingCache.has(job.cacheKey)) {
    display(job, readingCache.get(job.cacheKey));
    return;
  }

  isLoading = true;
  startLoading();
  for (const btn of chipButtons.values()) btn.disabled = true;
  yearBtn.disabled = true;

  try {
    const res = await fetch(INTERPRET_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job.payload),
    });

    // 프록시가 없는 곳(GitHub Pages 원본 서버 등)에서는 JSON이 아닌 404 페이지가 온다
    const isJson = (res.headers.get('content-type') ?? '').includes('json');
    if (!isJson) {
      throw new Error(
        '이곳에는 아직 해석 서버가 연결되지 않았어요. 명식표는 그대로 보실 수 있어요.'
      );
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '해석을 가져오지 못했어요.');

    readingCache.set(job.cacheKey, data.interpretation);
    display(job, data.interpretation);
  } catch (err) {
    errorBox.textContent =
      err instanceof TypeError
        ? '해석 서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.'
        : err.message;
    errorBox.hidden = false;
  } finally {
    isLoading = false;
    stopLoading();
    for (const btn of chipButtons.values()) btn.disabled = false;
    yearBtn.disabled = false;
  }
}

// ── 주제 칩 하나 보여주기 ───────────────────────────────────
function showTopic(topic) {
  const payload = { ...basePayload(), topic: topic.id };
  if (topic.id === 'daeun') payload.daeun = daeunList();
  requestReading({
    cacheKey: topic.id,
    chipId: topic.id,
    emoji: topic.emoji,
    label: topic.label,
    payload,
  });
}

// ── 대운 카드 클릭 → 그 10년만 깊이 풀이 (app.js가 호출) ─────
// 대운 타임라인에서 원하는 10년을 골라 해설
export function requestDaeunReading(index) {
  if (!currentSaju) return;
  const p = currentSaju.daeun.pillars[index];
  if (!p) return;
  requestReading({
    cacheKey: `daeunOne:${index}`,
    chipId: null,
    emoji: '🌊',
    label: `${p.startAge}세~ ${p.ko} 대운`,
    payload: { ...basePayload(), topic: 'daeunOne', daeun: daeunList(), daeunIndex: index },
  });
}

// ── 연도 선택 → 그 해의 세운 풀이 ──
const yearSelect = document.getElementById('year-select');
const yearBtn = document.getElementById('year-btn');
{
  // 올해를 가운데 두고 앞뒤 10년씩 — 지난 해는 돌아보기, 다가올 해는 준비
  const nowYear = new Date().getFullYear();
  for (let y = nowYear - 10; y <= nowYear + 10; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = `${y}년${y === nowYear ? ' (올해)' : ''}`;
    if (y === nowYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }
}
yearBtn.addEventListener('click', () => {
  if (!currentSaju) return;
  const y = Number(yearSelect.value);
  // 그 해가 속한 대운을 찾아 라벨에 보여주고, 서버에도 대운 목록을
  // 함께 보내 "대운을 배경으로 깐 세운 해석"이 되게 한다
  const host = currentSaju.daeun.pillars.find(
    (p) => y >= p.startYear && y < p.startYear + 10
  );
  requestReading({
    cacheKey: `year:${y}`,
    chipId: null,
    emoji: '📅',
    label: `${y}년 운세${host ? ` · ${host.ko} 대운 중` : ''}`,
    payload: { ...basePayload(), topic: 'year', year: y, daeun: daeunList() },
  });
});

// ── 받은 풀이를 화면에 그리기 ───────────────────────────────
function display(job, text) {
  for (const [id, btn] of chipButtons) {
    btn.classList.toggle('is-active', id === job.chipId);
    btn.classList.toggle('is-done', readingCache.has(id));
  }
  // 풀이 끝의 다음 걸음 안내 — 결과 하단에
  // "다른 운세는 어때요? / 가족 사주도 궁금하다면?"을 붙인다
  resultBox.innerHTML =
    `<p class="reading-topic">${job.emoji} ${job.label}</p>` +
    renderMarkdownLite(text) +
    `<p class="next-hint">다른 주제 칩도 눌러 보세요 — 위에서 생년월일만 바꾸면
     가족·친구의 사주도 봐 드려요 🐾</p>`;
  resultBox.hidden = false;
  resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
