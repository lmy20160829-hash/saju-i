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
const speedBtn = document.getElementById('tts-speed');

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
  speedBtn.hidden = true;
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
    // 텍스트와 함께 "읽어주기"·속도 버튼도 보여준다
    ttsBtn.hidden = false;
    speedBtn.hidden = false;
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

// ── 풀이 읽어주기 ─────────────────────────────────────────────
// 1순위: AI 목소리(Gemini TTS, 프록시 경유 — 자연스러운 발음)
// 2순위: 그게 안 되면 기기(브라우저) 내장 음성으로 자동 전환
// 텍스트는 화면에 그대로 두고, 같은 내용을 소리로 들려준다.
const TTS_ENDPOINT = INTERPRET_ENDPOINT.replace(/interpret$/, 'tts');
const SPEEDS = [1, 1.25, 1.5]; // 읽기 속도 단계
let speedIndex = 0;
let speaking = false;      // 지금 읽는 중인가
let audioPlayer = null;    // AI 목소리 재생기
let browserQueue = [];     // 기기 음성용 문장 대기줄

function stopSpeaking() {
  speaking = false;
  browserQueue = [];
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  ttsBtn.textContent = '🔊 풀이 읽어주기';
}

// 화면의 풀이에서 "읽을 글"만 모은다 (안내 문구 제외, 접힌 절도 포함)
function collectReadableText() {
  const parts = [];
  for (const el of resultBox.children) {
    if (el.classList.contains('accordion-hint')) continue;
    if (el.tagName === 'DETAILS') {
      parts.push(el.querySelector('summary').textContent + '.');
      parts.push(el.querySelector('.section-body').textContent);
    } else {
      parts.push(el.textContent);
    }
  }
  return parts.join('\n').trim();
}

ttsBtn.addEventListener('click', async () => {
  if (speaking) return stopSpeaking(); // 읽는 중에 누르면 멈춤

  const text = collectReadableText().slice(0, 3400);
  if (!text) return;
  speaking = true;
  ttsBtn.textContent = '⏳ 목소리 준비 중…';

  // 1순위: AI 목소리
  try {
    const res = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('audio')) throw new Error('TTS 사용 불가');
    const blob = await res.blob();
    if (!speaking) return; // 준비되는 사이 취소됐으면 재생하지 않는다

    audioPlayer = new Audio(URL.createObjectURL(blob));
    audioPlayer.playbackRate = SPEEDS[speedIndex];
    audioPlayer.onended = stopSpeaking;
    audioPlayer.onerror = stopSpeaking;
    await audioPlayer.play();
    ttsBtn.textContent = '⏹ 그만 듣기';
  } catch {
    // 2순위: 기기 내장 음성 (문장 단위로 끊어 읽어야 긴 글이 안 끊긴다)
    if (!speaking) return;
    speakWithBrowserVoice(text);
  }
});

function speakWithBrowserVoice(text) {
  if (!('speechSynthesis' in window)) return stopSpeaking();
  const sentences = text.match(/[^.!?…\n]+[.!?…]?/g) ?? [text];
  browserQueue = [];
  let chunk = '';
  for (const s of sentences) {
    if ((chunk + s).length > 180 && chunk) {
      browserQueue.push(chunk);
      chunk = s;
    } else {
      chunk += s;
    }
  }
  if (chunk.trim()) browserQueue.push(chunk);
  ttsBtn.textContent = '⏹ 그만 듣기';
  speakNextChunk();
}

function speakNextChunk() {
  if (!speaking || browserQueue.length === 0) return stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(browserQueue.shift());
  utterance.lang = 'ko-KR';
  utterance.rate = 0.95 * SPEEDS[speedIndex];
  const koVoice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('ko'));
  if (koVoice) utterance.voice = koVoice;
  utterance.onend = speakNextChunk;    // 한 덩어리가 끝나면 다음 덩어리
  utterance.onerror = stopSpeaking;
  window.speechSynthesis.speak(utterance);
}

// 속도 버튼: 1× → 1.25× → 1.5× 순환 (재생 중에도 즉시 반영)
speedBtn.addEventListener('click', () => {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  speedBtn.textContent = SPEEDS[speedIndex] + '×';
  if (audioPlayer) audioPlayer.playbackRate = SPEEDS[speedIndex];
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
