// ============================================================
// test-interpret.mjs — 해석 프록시의 테마(topic) 검증
// 실행: node test-interpret.mjs
//
// AI를 부르지 않고, 서버가 프롬프트를 조립하는 단계까지만 검증한다:
//   · 모든 테마가 올바른 {system, prompt}를 만드는지
//   · 화이트리스트 밖의 topic·간지를 거부하는지
//   · '올해의 운세' 테마에 세운 간지가 계산돼 들어가는지
// ============================================================
import { buildPrompt, TOPICS, currentSeun } from './api/interpret.mjs';

let pass = 0, fail = 0;
function check(name, actual, expected = true) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : `  (실제값: ${actual}, 기대값: ${expected})`}`);
}

// 샘플 명식: 1990-05-15 14:30 서울 (test-core.mjs와 같은 사주)
const SAMPLE = {
  pillars: { year: '庚午', month: '辛巳', day: '庚辰', hour: '癸未' },
  gender: 'female',
};

// 샘플 대운 (남성 순행 기준) — '지금' 판정이 언제 실행해도 성립하도록
// 세 번째 대운이 항상 올해를 포함하게 현재 연도 기준으로 만든다
const nowY = new Date().getFullYear();
const SAMPLE_DAEUN = [
  { ganzhi: '壬午', startAge: 8, startYear: nowY - 25 },
  { ganzhi: '癸未', startAge: 18, startYear: nowY - 15 },
  { ganzhi: '甲申', startAge: 28, startYear: nowY - 5 },
  { ganzhi: '乙酉', startAge: 38, startYear: nowY + 5 },
];
// 대운 테마는 대운 목록이, 선택한 대운은 고른 번호가, 연도별 운세는
// 연도가 함께 와야 프롬프트가 만들어진다
const forTopic = (key) => ({
  ...SAMPLE,
  topic: key,
  ...(key === 'daeun' || key === 'daeunOne' ? { daeun: SAMPLE_DAEUN } : {}),
  ...(key === 'daeunOne' ? { daeunIndex: 1 } : {}),
  ...(key === 'year' ? { year: nowY + 2 } : {}),
});

// ── 1. 모든 테마가 프롬프트를 만든다 ──
for (const [key, topic] of Object.entries(TOPICS)) {
  const built = buildPrompt(forTopic(key));
  check(`테마 '${topic.label}' 프롬프트 생성`, Boolean(built));
  check(`테마 '${topic.label}' 시스템 프롬프트에 절 형식 포함`, built.system.includes('### '));
  check(`테마 '${topic.label}' 프롬프트에 주제 명시`, built.prompt.includes(`'${topic.label}' 주제로`));
}

// ── 2. topic 생략 → 전체 풀이(10절) ──
const noTopic = buildPrompt(SAMPLE);
check('topic 생략 시 전체 풀이', noTopic.system.includes('총 10절'));

// ── 3. 화이트리스트 밖의 topic·간지는 거부 ──
check('없는 topic 거부', buildPrompt({ ...SAMPLE, topic: 'hack' }), null);
check('표에 없는 간지 거부', buildPrompt({ pillars: { ...SAMPLE.pillars, day: '甲Z' }, gender: 'female' }), null);

// ── 4. 올해의 운세: 세운 간지가 데이터로 들어간다 ──
const newyear = buildPrompt({ ...SAMPLE, topic: 'newyear' });
check('올해의 운세에 세운 줄 포함', newyear.prompt.includes('올해의 세운'));
// 세운 십성은 계산값이어야 한다 (일간 庚 기준) — "나에게 ○○" 표기 확인
check('세운 십성 표기 포함', /나에게 (비견|겁재|식신|상관|편재|정재|편관|정관|편인|정인)/.test(newyear.prompt));
// 다른 테마에는 세운이 들어가지 않는다
check('재물운에는 세운 없음', buildPrompt({ ...SAMPLE, topic: 'wealth' }).prompt.includes('올해의 세운'), false);

// ── 5. 세운 간지 계산: 60갑자 산수 + 입춘(2/4) 경계 ──
// 2026년 → 병오(丙午), 입춘 전인 1월은 아직 2025년 을사(乙巳)
const midYear = currentSeun(new Date(2026, 6, 3)); // 2026-07-03
check('2026 한여름 세운', `${midYear.year} ${midYear.stemHanja}${midYear.branchHanja}`, '2026 丙午');
const beforeIpchun = currentSeun(new Date(2026, 0, 15)); // 2026-01-15
check('2026 입춘 전(1월) 세운', `${beforeIpchun.year} ${beforeIpchun.stemHanja}${beforeIpchun.branchHanja}`, '2025 乙巳');
const onIpchun = currentSeun(new Date(2026, 1, 4)); // 2026-02-04
check('2026 입춘 당일 세운', `${onIpchun.year} ${onIpchun.stemHanja}${onIpchun.branchHanja}`, '2026 丙午');

// ── 5.5 대운 테마: 목록 검증과 '지금 걷는 대운' 표시 ──
const daeunBuilt = buildPrompt({ ...SAMPLE, topic: 'daeun', daeun: SAMPLE_DAEUN });
check('대운 목록 줄 포함', daeunBuilt.prompt.includes('대운 목록'));
check('지금 걷는 대운 표시(甲申)', /甲申[^\n]*지금 걷는 대운/.test(daeunBuilt.prompt));
check('대운 십성 표기 포함', /나에게 (비견|겁재|식신|상관|편재|정재|편관|정관|편인|정인)/.test(daeunBuilt.prompt));
check('대운 없이 daeun 요청 거부', buildPrompt({ ...SAMPLE, topic: 'daeun' }), null);
check('표에 없는 대운 간지 거부',
  buildPrompt({ ...SAMPLE, topic: 'daeun', daeun: [{ ganzhi: '甲Z', startAge: 8, startYear: 2000 }] }), null);
check('이상한 대운 나이 거부',
  buildPrompt({ ...SAMPLE, topic: 'daeun', daeun: [{ ganzhi: '壬午', startAge: 999, startYear: 2000 }] }), null);
check('다른 테마에는 대운 목록 없음', buildPrompt({ ...SAMPLE, topic: 'wealth', daeun: SAMPLE_DAEUN }).prompt.includes('대운 목록'), false);

// ── 5.6 선택한 대운: 고른 번호 표시와 검증 ──
const pickBuilt = buildPrompt({ ...SAMPLE, topic: 'daeunOne', daeun: SAMPLE_DAEUN, daeunIndex: 1 });
check('고른 대운(癸未)에 표시', /癸未[^\n]*내가 고른 대운/.test(pickBuilt.prompt));
check('안 고른 대운엔 표시 없음', /壬午[^\n]*내가 고른 대운/.test(pickBuilt.prompt), false);
check('번호 없이 daeunOne 거부', buildPrompt({ ...SAMPLE, topic: 'daeunOne', daeun: SAMPLE_DAEUN }), null);
check('범위 밖 번호 거부', buildPrompt({ ...SAMPLE, topic: 'daeunOne', daeun: SAMPLE_DAEUN, daeunIndex: 99 }), null);

// ── 5.7 연도별 운세: 세운 간지 계산과 시점 표기 ──
// 2028년 → (2028-4)%10=4 → 戊, (2028-4)%12=8 → 申 (무신년)
const yearBuilt = buildPrompt({ ...SAMPLE, topic: 'year', year: 2028 });
check('선택한 해의 세운 줄 포함', yearBuilt.prompt.includes('선택한 해의 세운'));
check('2028년 간지(戊申)', yearBuilt.prompt.includes('2028년 戊申'));
check('과거 해는 돌아보기 표기', buildPrompt({ ...SAMPLE, topic: 'year', year: nowY - 3 }).prompt.includes('돌아보기'));
check('연도 없이 year 거부', buildPrompt({ ...SAMPLE, topic: 'year' }), null);
check('범위 밖 연도 거부', buildPrompt({ ...SAMPLE, topic: 'year', year: 1800 }), null);

// ── 5.8 연도별 운세 + 대운 연동: 그 해가 속한 대운을 정확히 찾는다 ──
// SAMPLE_DAEUN에서 甲申 대운은 (nowY-5)~(nowY+4)년 — nowY-4는 그 안이다
const yearInDaeun = buildPrompt({ ...SAMPLE, topic: 'year', year: nowY - 4, daeun: SAMPLE_DAEUN });
check('그 해가 속한 대운 줄 포함', yearInDaeun.prompt.includes('그 해가 속한 대운'));
check('속한 대운이 甲申', /그 해가 속한 대운: 甲申/.test(yearInDaeun.prompt));
// 대운 경계: 乙酉는 (nowY+5)부터 — nowY+5년은 乙酉에 속해야 한다 (정유대운 2027/2028 버그 유형)
const yearAtBoundary = buildPrompt({ ...SAMPLE, topic: 'year', year: nowY + 5, daeun: SAMPLE_DAEUN });
check('대운 경계 연도는 다음 대운(乙酉)', /그 해가 속한 대운: 乙酉/.test(yearAtBoundary.prompt));
// 경계 직전 해는 이전 대운(甲申)이어야 한다
const yearBeforeBoundary = buildPrompt({ ...SAMPLE, topic: 'year', year: nowY + 4, daeun: SAMPLE_DAEUN });
check('경계 직전 해는 이전 대운(甲申)', /그 해가 속한 대운: 甲申/.test(yearBeforeBoundary.prompt));
check('첫 대운 전 연도는 유년기 안내', buildPrompt({ ...SAMPLE, topic: 'year', year: nowY - 30, daeun: SAMPLE_DAEUN }).prompt.includes('첫 대운이 시작되기 전'));
check('대운 없이도 year 동작(하위 호환)', buildPrompt({ ...SAMPLE, topic: 'year', year: 2028 }).prompt.includes('선택한 해의 세운'));
check('year의 위조 대운 거부', buildPrompt({ ...SAMPLE, topic: 'year', year: 2028, daeun: [{ ganzhi: '甲Z', startAge: 8, startYear: 2000 }] }), null);

// ── 5.9 연도별 운세의 분야별 상세운 ──
const yearSystem = buildPrompt({ ...SAMPLE, topic: 'year', year: 2028 }).system;
for (const field of ['재물운', '연애·결혼운', '일·직업운', '건강·생활 리듬', '인간관계운', '학업·시험운']) {
  check(`연도별 분야 절 포함: ${field}`, yearSystem.includes(`### ${field}`));
}
check('연도별 지수 7항목 지시', yearSystem.includes('일곱 항목'));
check('연도별 총 9절', yearSystem.includes('총 9절'));

// ── 6. 시간 모름(시주 null) 명식도 모든 테마에서 동작 ──
const noHour = buildPrompt({
  pillars: { year: '庚午', month: '辛巳', day: '庚辰', hour: null },
  gender: 'male',
  topic: 'love',
});
check('시주 없는 명식도 테마 풀이 가능', Boolean(noHour));
check('시주 없음 안내 포함', noHour.prompt.includes('세 기둥'));

console.log(`\n결과: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
