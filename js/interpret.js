// ============================================================
// interpret.js — "사주 풀이 듣기" 버튼과 AI 해석 표시 (텍스트 중심)
//
// 흐름:
//   버튼 클릭 → 명식의 간지 8글자만 프록시 서버로 보냄
//   → 서버가 Gemini API로 해석 생성 (키는 서버에만 있음)
//   → 받은 글을 절별로 접었다 펴는 아코디언으로 표시
// ============================================================
import { INTERPRET_ENDPOINT } from './config.js';

const btn = document.getElementById('interpret-btn');
const loading = document.getElementById('interpret-loading');
const resultBox = document.getElementById('interpret-result');
const errorBox = document.getElementById('interpret-error');

// 최근 계산 결과 (app.js가 계산할 때마다 갱신해 준다)
let currentSaju = null;
let currentGender = 'female';

export function setInterpretTarget(saju, gender) {
  currentSaju = saju;
  currentGender = gender;
  // 새로 계산했으면 이전 해석은 지운다
  resultBox.hidden = true;
  resultBox.innerHTML = '';
  errorBox.hidden = true;
  btn.hidden = false;
  btn.disabled = false;
}

btn.addEventListener('click', async () => {
  if (!currentSaju) return;
  btn.disabled = true;
  errorBox.hidden = true;
  loading.hidden = false;

  try {
    // 서버에는 간지 한자만 보낸다 (개인정보·자유 텍스트 없음)
    const payload = {
      pillars: {
        year: currentSaju.pillars.year.hanja,
        month: currentSaju.pillars.month.hanja,
        day: currentSaju.pillars.day.hanja,
        hour: currentSaju.pillars.hour ? currentSaju.pillars.hour.hanja : null,
      },
      gender: currentGender,
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

    resultBox.innerHTML = renderMarkdownLite(data.interpretation);
    resultBox.hidden = false;
    btn.hidden = true; // 같은 명식을 중복 요청하지 않게
  } catch (err) {
    errorBox.textContent =
      err instanceof TypeError
        ? '해석 서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.'
        : err.message;
    errorBox.hidden = false;
    btn.disabled = false;
  } finally {
    loading.hidden = true;
  }
});

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
