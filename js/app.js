// ============================================================
// app.js — 화면과 계산 엔진을 잇는 다리
//
// 하는 일:
//   1. 지역 드롭다운 채우기
//   2. "시간을 몰라요" 체크 시 시간 입력 잠그기
//   3. 폼 제출 → 입력 검사 → 사주 계산 → 결과 그리기
// ============================================================
import * as manseryeok from '../vendor/manseryeok.mjs';
import { createSajuEngine } from './saju-core.js';
import { CITIES } from './cities.js';
import { setInterpretTarget, requestDaeunReading } from './interpret.js';

// lunar.js(절기 계산)는 index.html에서 먼저 불러와서
// 전역 변수 Solar 로 존재한다.
const engine = createSajuEngine({ manseryeok, Solar: window.Solar });

// ── 화면 요소 찾아두기 ──────────────────────────────────────
const form = document.getElementById('saju-form');
const dateInput = document.getElementById('birth-date');
const timeInput = document.getElementById('birth-time');
const unknownTimeCheck = document.getElementById('unknown-time');
const citySelect = document.getElementById('birth-city');
const errorBox = document.getElementById('form-error');
const resultSection = document.getElementById('result');

// ── 1. 지역 드롭다운 채우기 ─────────────────────────────────
for (const city of CITIES) {
  const opt = document.createElement('option');
  opt.value = String(city.longitude);
  opt.textContent = city.name;
  citySelect.appendChild(opt);
}

// ── 2. "시간을 몰라요" 체크 → 시간 입력 잠금 ────────────────
unknownTimeCheck.addEventListener('change', () => {
  timeInput.disabled = unknownTimeCheck.checked;
  timeInput.required = !unknownTimeCheck.checked;
  if (unknownTimeCheck.checked) timeInput.value = '';
});

// ── 3. 폼 제출 → 계산 → 결과 그리기 ────────────────────────
form.addEventListener('submit', (event) => {
  event.preventDefault(); // 새로고침 막기

  // 입력 검사
  if (!dateInput.value) {
    return showError('생년월일을 선택해 주세요.');
  }
  if (!unknownTimeCheck.checked && !timeInput.value) {
    return showError('태어난 시간을 입력하거나 "시간을 몰라요"에 체크해 주세요.');
  }
  hideError();

  // 입력값 꺼내기
  const [year, month, day] = dateInput.value.split('-').map(Number);
  const unknownTime = unknownTimeCheck.checked;
  const [hour, minute] = unknownTime
    ? [null, 0]
    : timeInput.value.split(':').map(Number);
  const longitude = Number(citySelect.value);
  const gender =
    form.elements.gender.value === 'female' ? '여성' : '남성';
  const cityName = citySelect.options[citySelect.selectedIndex].textContent;

  // 사주 계산 (라이브러리 계산값만 사용 — AI 추정 없음)
  // 성별은 대운의 방향(순행/역행)을 정하는 데 쓰인다
  let saju;
  try {
    saju = engine.calculate({
      year, month, day, hour, minute, unknownTime, longitude,
      gender: form.elements.gender.value,
    });
  } catch (err) {
    return showError('계산할 수 없는 날짜예요. 1901~2049년 사이인지 확인해 주세요.');
  }

  renderResult(saju, { year, month, day, hour, minute, unknownTime, cityName, gender });
  // AI 해석 버튼에게 "이 명식을 풀이해 줘"라고 대상 등록
  setInterpretTarget(saju, form.elements.gender.value);
  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}
function hideError() {
  errorBox.hidden = true;
}

// ============================================================
// 결과 그리기
// ============================================================

// 명식표는 전통 방식대로 "오른쪽 끝이 연주(태어난 해)"
// → 화면 왼쪽부터 시주 · 일주 · 월주 · 연주 순서로 놓는다.
const PILLAR_ORDER = [
  { key: 'hour', title: '시주', sub: '태어난 시간' },
  { key: 'day', title: '일주', sub: '태어난 날' },
  { key: 'month', title: '월주', sub: '태어난 달' },
  { key: 'year', title: '연주', sub: '태어난 해' },
];

const ELEMENT_META = [
  { key: '목', hanja: '木', varName: '--el-wood' },
  { key: '화', hanja: '火', varName: '--el-fire' },
  { key: '토', hanja: '土', varName: '--el-earth' },
  { key: '금', hanja: '金', varName: '--el-metal' },
  { key: '수', hanja: '水', varName: '--el-water' },
];

function renderResult(saju, info) {
  // ── 태어난 정보 한 줄 요약 ──
  const timeText = info.unknownTime
    ? '시간 모름'
    : `${String(info.hour).padStart(2, '0')}:${String(info.minute).padStart(2, '0')}`;
  let birthLine = `${info.year}년 ${info.month}월 ${info.day}일 ${timeText} · ${info.cityName} · ${info.gender}`;
  if (saju.correctedTime) {
    birthLine += ` · 진태양시 ${String(saju.correctedTime.hour).padStart(2, '0')}:${String(saju.correctedTime.minute).padStart(2, '0')} 기준`;
  }
  document.getElementById('result-birth').textContent = birthLine;

  // ── 명식표 ──
  const heads = document.getElementById('pillar-heads');
  const stemRow = document.getElementById('stem-row');
  const branchRow = document.getElementById('branch-row');
  heads.innerHTML = '';
  stemRow.innerHTML = '';
  branchRow.innerHTML = '';

  for (const { key, title, sub } of PILLAR_ORDER) {
    const pillar = saju.pillars[key];

    // 제목 줄
    const th = document.createElement('th');
    th.scope = 'col';
    th.innerHTML = `${title}<small>${sub}</small>`;
    heads.appendChild(th);

    if (!pillar) {
      // 시간 모름 → 시주 칸은 비워 둔다
      stemRow.appendChild(emptyCell());
      branchRow.appendChild(emptyCell());
      continue;
    }

    // 천간 칸 (일간이면 '나' 도장)
    const isDayMaster = key === 'day';
    stemRow.appendChild(
      charCell(pillar.stem, isDayMaster)
    );
    // 지지 칸
    branchRow.appendChild(charCell(pillar.branch, false));
  }

  document.getElementById('time-note').hidden = !saju.unknownTime;
  if (saju.unknownTime) {
    document.getElementById('time-note').textContent =
      '시간을 몰라서 시주 없이 세 기둥으로 보았어요. 연·월주의 절기 판정은 정오(12시) 기준이에요.';
  }

  // ── 오행 분포 미터 ──
  const elementsBox = document.getElementById('elements');
  elementsBox.innerHTML = '';
  for (const el of ELEMENT_META) {
    const count = saju.elementCount[el.key];
    const row = document.createElement('div');
    row.className = 'el-row' + (count === 0 ? ' el-zero' : '');
    const percent = (count / saju.totalChars) * 100;
    row.innerHTML = `
      <span class="el-name"><span class="char-hanja el-${el.key}">${el.hanja}</span>${el.key}</span>
      <span class="el-track"><span class="el-bar" style="width:${percent}%;background:var(${el.varName})"></span></span>
      <span class="el-count">${count}개</span>
    `;
    elementsBox.appendChild(row);
  }

  // ── 오행 분포 한 줄 설명 (계산된 사실만 말한다) ──
  const entries = ELEMENT_META.map((el) => [el.key, saju.elementCount[el.key]]);
  const most = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const missing = entries.filter(([, n]) => n === 0).map(([k]) => k);
  let noteText = `여덟 글자 중 ${most[0]} 기운이 ${most[1]}개로 가장 많아요.`;
  if (saju.totalChars === 6) noteText = noteText.replace('여덟', '여섯');
  if (missing.length > 0) {
    noteText += ` 반면 ${missing.join('·')} 기운은 명식에 보이지 않네요.`;
  }
  document.getElementById('element-note').textContent = noteText;

  // ── 대운 타임라인 (10년 단위, 지금 걷는 대운 강조) ──
  // 왼쪽부터 나이 순서로 흐르는 가로 스크롤 — 사주아이류 대운 타임라인 방식.
  // 카드를 누르면 그 10년만 깊이 푸는 '선택한 대운' 해석을 요청한다.
  const daeunBox = document.getElementById('daeun');
  daeunBox.innerHTML = '';
  const nowYear = new Date().getFullYear();
  let nowCell = null;
  saju.daeun.pillars.forEach((p, index) => {
    const isNow = nowYear >= p.startYear && nowYear < p.startYear + 10;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'daeun-cell' + (isNow ? ' daeun-now' : '');
    cell.setAttribute('aria-label', `${p.startAge}세부터의 ${p.ko} 대운 풀이 듣기`);
    cell.innerHTML = `
      ${isNow ? '<span class="me-badge">지금</span>' : ''}
      <span class="daeun-age">${p.startAge}세~</span>
      <span class="daeun-hanja">
        <span class="char-hanja el-${p.stem.element}">${p.stem.hanja}</span><span class="char-hanja el-${p.branch.element}">${p.branch.hanja}</span>
      </span>
      <span class="char-ko">${p.ko}</span>
      <span class="char-god">${p.stem.tenGod}·${p.branch.tenGod}</span>
      <span class="daeun-year">${p.startYear}년~</span>
    `;
    cell.addEventListener('click', () => requestDaeunReading(index));
    daeunBox.appendChild(cell);
    if (isNow) nowCell = cell;
  });
  // 지금 걷는 대운이 화면 가운데 오도록 스크롤을 맞춘다.
  // 이 함수가 불릴 때는 결과 영역이 아직 hidden이라 크기가 0이므로,
  // 화면에 나타난 다음 프레임에서 계산한다.
  if (nowCell) {
    requestAnimationFrame(() => {
      daeunBox.scrollLeft = Math.max(
        0, nowCell.offsetLeft - daeunBox.clientWidth / 2 + nowCell.clientWidth / 2
      );
    });
  }
  document.getElementById('daeun-note').textContent =
    `${saju.daeun.forward ? '순행' : '역행'} 대운 · 나이는 대운수(세는나이) 기준이에요.` +
    ' 카드를 누르면 그 10년의 풀이를 들려드려요.' +
    (saju.unknownTime ? ' 시간을 몰라 시작 나이가 1년쯤 어긋날 수 있어요.' : '');
}

// 글자 하나(천간 또는 지지)를 표의 칸으로 만들기
function charCell(char, isDayMaster) {
  const td = document.createElement('td');
  if (isDayMaster) {
    td.className = 'day-master';
    const badge = document.createElement('span');
    badge.className = 'me-badge';
    badge.textContent = '나';
    td.appendChild(badge);
  }
  const hanja = document.createElement('span');
  hanja.className = `char-hanja el-${char.element}`;
  hanja.textContent = char.hanja;
  const ko = document.createElement('span');
  ko.className = 'char-ko';
  ko.textContent = `${char.ko} · ${char.element}`;
  td.appendChild(hanja);
  td.appendChild(ko);

  // 십성 라벨 — 일간(나)과의 관계 이름 (일간 자신은 '일간')
  const godText = isDayMaster ? '일간' : char.tenGod;
  if (godText) {
    const god = document.createElement('span');
    god.className = 'char-god';
    god.textContent = godText;
    td.appendChild(god);
  }
  return td;
}

// 시간 모름일 때의 빈 칸
function emptyCell() {
  const td = document.createElement('td');
  td.className = 'empty-pillar';
  td.innerHTML = `<span class="char-hanja">?</span><span class="char-ko">시간 모름</span>`;
  return td;
}

// ── 테스트용: 주소 끝에 ?demo 를 붙이면 샘플을 자동 입력해 보여준다 ──
//    (개발 중 결과 화면을 빠르게 확인하는 용도. 반드시 파일 맨 끝에 —
//     위의 상수·함수가 모두 준비된 다음에 실행되어야 하기 때문)
if (new URLSearchParams(location.search).has('demo')) {
  dateInput.value = '1990-05-15';
  timeInput.value = '14:30';
  form.requestSubmit();
}

// ── PWA: 서비스워커 등록 (한 번 방문하면 다음부터 더 빨리 열린다) ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // 등록 실패해도 앱 사용에는 지장 없음
  });
}
