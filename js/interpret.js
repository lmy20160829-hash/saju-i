// ============================================================
// interpret.js — "사주 풀이 듣기" 버튼과 AI 해석 표시
//
// 흐름:
//   버튼 클릭 → 명식의 간지 8글자만 프록시 서버로 보냄
//   → 서버가 클로드 API로 해석 생성 (키는 서버에만 있음)
//   → 받은 글을 고양이 말투 카드로 표시
// ============================================================
import { INTERPRET_ENDPOINT } from './config.js';

const btn = document.getElementById('interpret-btn');
const loading = document.getElementById('interpret-loading');
const resultBox = document.getElementById('interpret-result');
const errorBox = document.getElementById('interpret-error');
const ttsBtn = document.getElementById('tts-btn');

// 최근 계산 결과 (app.js가 계산할 때마다 갱신해 준다)
let currentSaju = null;
let currentGender = 'female';

export function setInterpretTarget(saju, gender) {
  currentSaju = saju;
  currentGender = gender;
  // 새로 계산했으면 이전 해석은 지우고, 읽어주던 목소리도 멈춘다
  stopSpeaking();
  resultBox.hidden = true;
  resultBox.innerHTML = '';
  errorBox.hidden = true;
  ttsBtn.hidden = true;
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

    // 프록시가 없는 곳(GitHub Pages 등)에서는 JSON이 아닌 404 페이지가 온다
    const isJson = (res.headers.get('content-type') ?? '').includes('json');
    if (!isJson) {
      throw new Error(
        '이곳에는 아직 해석 서버가 연결되지 않았어요. 명식표는 그대로 보실 수 있고, 해석은 내 컴퓨터(npm run dev)에서 이용할 수 있어요.'
      );
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '해석을 가져오지 못했어요.');

    resultBox.innerHTML = renderMarkdownLite(data.interpretation);
    resultBox.hidden = false;
    btn.hidden = true; // 같은 명식을 중복 요청하지 않게
    // 텍스트와 함께 "읽어주기" 버튼도 보여준다 (지원 브라우저만)
    if ('speechSynthesis' in window) ttsBtn.hidden = false;
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

// ── 풀이 읽어주기 (브라우저 내장 음성 합성 — 무료, 키 불필요) ──
// 텍스트는 화면에 그대로 두고, 같은 내용을 한국어 음성으로 읽는다.
let speaking = false;

function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  speaking = false;
  ttsBtn.textContent = '🔊 풀이 읽어주기';
}

ttsBtn.addEventListener('click', () => {
  if (speaking) return stopSpeaking(); // 읽는 중에 누르면 멈춤

  // 화면의 풀이 글을 그대로 가져와 읽는다 (마크다운 기호 없이)
  const text = resultBox.textContent.trim();
  if (!text) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 0.95; // 살짝 차분한 속도
  // 한국어 목소리가 설치되어 있으면 골라 쓴다
  const koVoice = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.startsWith('ko'));
  if (koVoice) utterance.voice = koVoice;
  utterance.onend = stopSpeaking;
  utterance.onerror = stopSpeaking;

  window.speechSynthesis.cancel(); // 혹시 남아 있던 소리 정리
  window.speechSynthesis.speak(utterance);
  speaking = true;
  ttsBtn.textContent = '⏹ 그만 읽기';
});

// 페이지를 떠나면 소리도 멈춘다
window.addEventListener('pagehide', stopSpeaking);

// ── 아주 작은 마크다운 변환기 ─────────────────────────────────
// AI가 주는 글은 "### 소제목"과 "**강조**"만 쓰므로 그것만 처리한다.
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
