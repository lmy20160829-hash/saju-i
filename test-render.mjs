// ============================================================
// test-render.mjs — 풀이 렌더러(js/interpret-render.js) 자동 검증
// 실행: node test-render.mjs
//
// AI를 부르지 않고, 받은 마크다운을 화면 HTML로 바꾸는 단계만 검증한다:
//   · 요약 헤더 세 줄([키워드]/[지수]/[행운])을 제대로 읽는지
//   · 형식이 조금 어긋나도(굵게 감싸기, 항목 누락) 깨지지 않는지
//   · HTML 특수문자가 무해하게 바뀌는지 (XSS 방지)
//   · 절이 아코디언(details)으로 바뀌고 첫 절만 펼쳐지는지
// ============================================================
import { splitHeader, renderMarkdownLite } from './js/interpret-render.js';

let pass = 0, fail = 0;
function check(name, ok) {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}`);
}

// ── 1. 정상 형식의 헤더를 읽는다 ──
const SAMPLE = `[키워드] #차분함 #장인정신 #늦게피는꽃
[지수] 총운=78; 일·직업=81; 재물=65
[행운] 색=초록; 숫자=3; 방위=동쪽; 아이템=작은 화분

### 첫 절 제목
본문 한 줄입니다. **굵은 글씨**도 있어요.
### 둘째 절 제목
둘째 본문.`;

const { header, body } = splitHeader(SAMPLE);
check('키워드 3개 추출', header.keywords.length === 3 && header.keywords[0] === '차분함');
check('지수 3개 추출', header.scores.length === 3);
check('지수 이름·값 파싱', header.scores[1].name === '일·직업' && header.scores[1].value === 81);
check('행운 4개 추출', header.lucky.length === 4);
check('행운 이름·값 파싱', header.lucky[3].label === '아이템' && header.lucky[3].value === '작은 화분');
check('헤더 줄은 본문에서 제거', !body.includes('[키워드]') && !body.includes('[지수]'));

const html = renderMarkdownLite(SAMPLE);
check('요약 카드 생성', html.includes('summary-card'));
check('키워드 칩 렌더링', html.includes('#차분함'));
check('지수 게이지 폭 반영', html.includes('width:78%'));
check('행운 칩 렌더링', html.includes('동쪽'));
check('절이 아코디언으로', html.includes('<details open><summary>첫 절 제목</summary>'));
check('둘째 절은 접힘', html.includes('<details><summary>둘째 절 제목</summary>'));
check('굵은 글씨 변환', html.includes('<strong>굵은 글씨</strong>'));

// ── 2. 형식이 조금 어긋나도 너그럽게 읽는다 ──
const MESSY = `**[지수] 재물=120; 절제=-5; 감각=abc**
### 절
본문`;
const messy = splitHeader(MESSY);
check('굵게 감싼 헤더도 인식', messy.header.scores.length === 2);
check('지수 0~100으로 자름 (위)', messy.header.scores[0].value === 100);
check('지수 0~100으로 자름 (아래)', messy.header.scores[1].value === 0);
check('숫자가 아닌 지수는 버림', !messy.header.scores.some((s) => s.name === '감각'));

// ── 2-1. 표식을 빠뜨린 키워드 줄의 대비책 ──
const VARIANT1 = splitHeader('[돈복] [성실함] [노력]\n[지수] 힘=70\n### 절\n본문');
check('"[가] [나] [다]" 키워드 변형 인식', VARIANT1.header.keywords.join(',') === '돈복,성실함,노력');
const VARIANT2 = splitHeader('#차분 #꾸준 #온화\n### 절\n본문');
check('"#가 #나 #다" 키워드 변형 인식', VARIANT2.header.keywords.length === 3);
const AFTER_SECTION = splitHeader('### 절\n[지수] 힘=70\n본문 [돈복] [성실]');
check('본문 시작 후에는 헤더로 안 읽음', AFTER_SECTION.header.scores.length === 0 && AFTER_SECTION.body.includes('[지수]'));

// ── 2-2. 연도별 운세의 지수 7항목도 전부 게이지로 ──
const SEVEN = splitHeader('[지수] 총운=70; 재물=60; 연애=65; 일·직업=75; 건강리듬=80; 인간관계=68; 학업=55\n### 절\n본문');
check('지수 7항목 파싱', SEVEN.header.scores.length === 7);

// ── 3. 헤더가 아예 없으면 요약 카드 없이 아코디언만 ──
const NO_HEADER = `### 제목만 있는 풀이
본문입니다.`;
const plain = renderMarkdownLite(NO_HEADER);
check('헤더 없으면 요약 카드 생략', !plain.includes('summary-card'));
check('아코디언은 그대로 동작', plain.includes('<details open>'));

// ── 4. HTML 특수문자는 무해하게 (XSS 방지) ──
const EVIL = `[키워드] #<script>알림 #보통 #무난
[행운] 색=<b>빨강</b>; 숫자=7

### <img src=x onerror=alert(1)> 제목
본문 <script>alert(1)</script>`;
const evil = renderMarkdownLite(EVIL);
check('본문 태그 무해화', !evil.includes('<script>') && evil.includes('&lt;script&gt;'));
check('제목 태그 무해화', !evil.includes('<img'));
check('행운 값 태그 무해화', !evil.includes('<b>빨강</b>'));

console.log(`\n결과: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
