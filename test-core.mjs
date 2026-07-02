// ============================================================
// test-core.mjs — saju-core.js (하이브리드 엔진) 검증
// 실행: node test-core.mjs
// ============================================================
import * as manseryeok from '@fullstackfamily/manseryeok';
import lunar from 'lunar-javascript';
import { createSajuEngine } from './js/saju-core.js';

const engine = createSajuEngine({ manseryeok, Solar: lunar.Solar });

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}: ${actual}${ok ? '' : `  (기대값: ${expected})`}`);
}

// ── 1. 샘플 사주: 1990-05-15 14:30 서울 → 경오 신사 경진 계미 ──
const s1 = engine.calculate({ year: 1990, month: 5, day: 15, hour: 14, minute: 30 });
check('샘플 년주', s1.pillars.year.ko, '경오');
check('샘플 월주', s1.pillars.month.ko, '신사');
check('샘플 일주', s1.pillars.day.ko, '경진');
check('샘플 시주', s1.pillars.hour.ko, '계미');
check('샘플 일간', s1.dayMaster.ko + s1.dayMaster.element, '경금');
console.log('   진태양시:', JSON.stringify(s1.correctedTime), '/ 오행:', JSON.stringify(s1.elementCount));

// ── 2. 입춘 경계 2024 (실제 입춘 2/4 17:27 KST) ──
const before24 = engine.calculate({ year: 2024, month: 2, day: 4, hour: 17, minute: 20 });
check('2024 입춘 7분 전 년주(계묘)', before24.pillars.year.ko, '계묘');
check('2024 입춘 7분 전 월주(을축)', before24.pillars.month.ko, '을축');
const after24 = engine.calculate({ year: 2024, month: 2, day: 4, hour: 17, minute: 30 });
check('2024 입춘 3분 후 년주(갑진)', after24.pillars.year.ko, '갑진');
check('2024 입춘 3분 후 월주(병인)', after24.pillars.month.ko, '병인');

// ── 3. 입춘 경계 2025 (실제 입춘 2/3 23:10 KST — 자정 직전!) ──
const before25 = engine.calculate({ year: 2025, month: 2, day: 3, hour: 23, minute: 0 });
check('2025 입춘 10분 전 년주(갑진)', before25.pillars.year.ko, '갑진');
const after25 = engine.calculate({ year: 2025, month: 2, day: 3, hour: 23, minute: 20 });
check('2025 입춘 10분 후 년주(을사)', after25.pillars.year.ko, '을사');
check('2025 입춘 10분 후 월주(무인)', after25.pillars.month.ko, '무인');

// ── 4. 시간 모름 → 3기둥(시주 null), 오행 분모 6 ──
const noTime = engine.calculate({ year: 1990, month: 5, day: 15, unknownTime: true });
check('시간모름 시주', String(noTime.pillars.hour), 'null');
check('시간모름 글자수', String(noTime.totalChars), '6');

// ── 5. 십성 검증 (일간 경금 기준) ──
// 년간 경(庚) = 나와 같은 금·같은 양 → 비견
check('십성: 년간 경금', s1.pillars.year.stem.tenGod, '비견');
// 월간 신(辛) = 같은 금·다른 음양 → 겁재
check('십성: 월간 신금', s1.pillars.month.stem.tenGod, '겁재');
// 시간 계(癸) = 금생수(내가 낳음)·다른 음양 → 상관
check('십성: 시간 계수', s1.pillars.hour.stem.tenGod, '상관');

console.log(`\n결과: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
