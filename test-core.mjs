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

// ── 6. 대운: 양남 순행 / 양녀 역행, 월주(신사)에서 이어지는 60갑자 ──
// 1990년은 경오년(년간 庚 = 양) → 남성 순행(월주 다음 임오부터),
// 여성 역행(월주 이전 경진부터). 방향 규칙만으로 답이 정해진다.
// 대운수(한국 만세력 표준): 절입까지 일수 ÷ 3 반올림, 대운수는 세는나이
// → 대운 바뀌는 해 = 출생연 + 대운수 - 1.
//   남: 망종(6/6 06:46)까지 21.72일 → 7 → 1996년 / 여: 입하(5/6 02:35)부터 9.45일 → 3 → 1992년
const mDaeun = engine.calculate({ year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'male' }).daeun;
check('대운(남) 순행', String(mDaeun.forward), 'true');
check('대운(남) 첫 대운', mDaeun.pillars[0].ko, '임오');
check('대운(남) 대운수', String(mDaeun.pillars[0].startAge), '7');
check('대운(남) 첫 대운 해(출생연+대운수-1)', String(mDaeun.pillars[0].startYear), '1996');
check('대운(남) 개수', String(mDaeun.pillars.length), '8');
const fDaeun = engine.calculate({ year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'female' }).daeun;
check('대운(여) 역행', String(fDaeun.forward), 'false');
check('대운(여) 첫 대운', fDaeun.pillars[0].ko, '경진');
check('대운(여) 대운수', String(fDaeun.pillars[0].startAge), '3');
check('대운(여) 첫 대운 해', String(fDaeun.pillars[0].startYear), '1992');
check('대운(여) 10년 간격', String(fDaeun.pillars[1].startAge - fDaeun.pillars[0].startAge), '10');
check('대운 십성 계산(일간 경금 vs 임오 천간 임수)', mDaeun.pillars[0].stem.tenGod, '식신');

// ── 6.5 대운 시작 해 회귀 테스트 (버그 제보 실사주 기준) ──
// 1982-02-24 05:25 여성 (임술년 양녀 → 역행):
//   입춘(2/4 12:45 KST)까지 19.69일 → ÷3 = 6.56 → 반올림 대운수 7 (세는나이)
//   역행 대운: 신축(7세·1988) → 경자 → 기해 → 무술 → 정유(47세·2028)
// 사용자 확인값: 정유(丁酉) 대운은 2028년, 세는나이 47세에 시작한다.
const real = engine.calculate({ year: 1982, month: 2, day: 24, hour: 5, minute: 25, gender: 'female' }).daeun;
check('실사주 역행', String(real.forward), 'false');
check('실사주 대운수', String(real.pillars[0].startAge), '7');
check('실사주 첫 대운(신축) 해', String(real.pillars[0].startYear), '1988');
check('실사주 정유 대운 간지', real.pillars[4].ko, '정유');
check('실사주 정유 대운 나이(세는나이)', String(real.pillars[4].startAge), '47');
check('실사주 정유 대운 시작 해', String(real.pillars[4].startYear), '2028');

console.log(`\n결과: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
