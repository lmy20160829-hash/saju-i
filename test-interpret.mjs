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

// ── 1. 모든 테마가 프롬프트를 만든다 ──
for (const [key, topic] of Object.entries(TOPICS)) {
  const built = buildPrompt({ ...SAMPLE, topic: key });
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
