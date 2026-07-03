// ============================================================
// interpret.js — 테마별 "고양이의 풀이" (주제 칩 + AI 해석 표시)
//
// 흐름:
//   주제 칩 클릭 → 명식의 간지 8글자 + 주제 이름만 프록시 서버로 보냄
//   → 서버가 주제별 프롬프트를 조립해 AI 해석 생성 (키는 서버에만)
//   → 받은 글을 절별로 접었다 펴는 아코디언으로 표시
//
// 테마별 해설 구성은 점신 같은 운세 앱을 벤치마킹했다:
//   결과를 하나의 긴 글이 아니라 주제(재물·연애·직업 …)별로 나눠,
//   사용자가 궁금한 주제를 골라 깊이 읽는 방식.
//   한 번 받은 주제는 캐시에 두어 칩을 다시 눌러도 재요청하지 않는다.
// ============================================================
import { INTERPRET_ENDPOINT } from './config.js';

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
];

const chipsBox = document.getElementById('topic-chips');
const loading = document.getElementById('interpret-loading');
const resultBox = document.getElementById('interpret-result');
const errorBox = document.getElementById('interpret-error');

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
  // 전체 풀이는 대표 메뉴, 올해의 운세는 시즌 메뉴 — 둘 다 한 줄 전체 폭
  btn.className =
    'topic-chip' +
    (topic.id === 'overall' ? ' topic-chip-overall' : '') +
    (topic.id === 'newyear' ? ' topic-chip-newyear' : '');
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

// ── 주제 하나 보여주기: 캐시에 있으면 바로, 없으면 서버에 요청 ──
async function showTopic(topic) {
  if (!currentSaju || isLoading) return;
  errorBox.hidden = true;

  // 이미 받아 둔 주제면 다시 요청하지 않고 바로 보여준다
  if (readingCache.has(topic.id)) {
    display(topic, readingCache.get(topic.id));
    return;
  }

  isLoading = true;
  loading.hidden = false;
  for (const btn of chipButtons.values()) btn.disabled = true;

  try {
    // 서버에는 간지 한자 + 주제 이름만 보낸다 (개인정보·자유 텍스트 없음)
    const payload = {
      pillars: {
        year: currentSaju.pillars.year.hanja,
        month: currentSaju.pillars.month.hanja,
        day: currentSaju.pillars.day.hanja,
        hour: currentSaju.pillars.hour ? currentSaju.pillars.hour.hanja : null,
      },
      gender: currentGender,
      topic: topic.id,
    };

    const res = await fetch(INTERPRET_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

    readingCache.set(topic.id, data.interpretation);
    display(topic, data.interpretation);
  } catch (err) {
    errorBox.textContent =
      err instanceof TypeError
        ? '해석 서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.'
        : err.message;
    errorBox.hidden = false;
  } finally {
    isLoading = false;
    loading.hidden = true;
    for (const btn of chipButtons.values()) btn.disabled = false;
  }
}

// ── 받은 풀이를 화면에 그리기 ───────────────────────────────
function display(topic, text) {
  for (const [id, btn] of chipButtons) {
    btn.classList.toggle('is-active', id === topic.id);
    btn.classList.toggle('is-done', readingCache.has(id));
  }
  resultBox.innerHTML =
    `<p class="reading-topic">${topic.emoji} ${topic.label}</p>` +
    renderMarkdownLite(text);
  resultBox.hidden = false;
  resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── 아주 작은 마크다운 변환기 ─────────────────────────────────
// 보안을 위해 HTML 특수문자는 먼저 무해하게 바꾼다(escape).
function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderMarkdownLite(markdown) {
  // "### 제목" 마다 접었다 펼 수 있는 칸(details)으로 만든다.
  // 첫 번째 절만 펼쳐 두고, 나머지는 제목을 누르면 펼쳐진다.
  const lines = escapeHtml(markdown)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let html = '';
  let openSection = false;
  let isFirst = true;

  for (const line of lines) {
    if (line.startsWith('###')) {
      if (openSection) html += '</div></details>';
      const title = line.replace(/^#+\s*/, '');
      html += `<details${isFirst ? ' open' : ''}><summary>${title}</summary><div class="section-body">`;
      openSection = true;
      isFirst = false;
    } else {
      const withBold = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html += `<p>${withBold}</p>`;
    }
  }
  if (openSection) html += '</div></details>';
  return `<p class="accordion-hint">제목을 누르면 풀이가 펼쳐져요 🐾</p>` + html;
}
