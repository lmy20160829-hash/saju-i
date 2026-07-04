// ============================================================
// saju-core.js — 사주 계산의 "심장" (하이브리드 방식)
//
// 왜 하이브리드인가?
//   검증(1단계) 결과, 라이브러리마다 정확한 부분이 달랐다.
//   - 일주(日柱)·시주(時柱)·진태양시 보정 → manseryeok-js 가 정확
//   - 년주(年柱)·월주(月柱)             → 절기 '시각(분 단위)'이
//     기준이어야 하는데 manseryeok-js는 자정 단위로만 바뀌는 버그가
//     있어서, 천문 계산으로 절기 시각을 구하는 lunar-javascript 를 사용
//
// 이 파일은 브라우저와 Node(테스트) 양쪽에서 쓸 수 있도록,
// 라이브러리를 직접 import 하지 않고 "주입(injection)" 받는다.
//   사용법: const engine = createSajuEngine({ manseryeok, Solar });
//           const result = engine.calculate({ ... });
// ============================================================

// ------------------------------------------------------------
// 기초 데이터: 천간(하늘의 기운 10개) · 지지(땅의 기운 12개)
// 각 글자마다 [한글, 오행, 음양] 을 붙여 둔다.
// ------------------------------------------------------------
const STEMS = {
  甲: { ko: '갑', element: '목', yang: true },
  乙: { ko: '을', element: '목', yang: false },
  丙: { ko: '병', element: '화', yang: true },
  丁: { ko: '정', element: '화', yang: false },
  戊: { ko: '무', element: '토', yang: true },
  己: { ko: '기', element: '토', yang: false },
  庚: { ko: '경', element: '금', yang: true },
  辛: { ko: '신', element: '금', yang: false },
  壬: { ko: '임', element: '수', yang: true },
  癸: { ko: '계', element: '수', yang: false },
};

const BRANCHES = {
  子: { ko: '자', element: '수', mainStem: '癸', animal: '쥐' },
  丑: { ko: '축', element: '토', mainStem: '己', animal: '소' },
  寅: { ko: '인', element: '목', mainStem: '甲', animal: '호랑이' },
  卯: { ko: '묘', element: '목', mainStem: '乙', animal: '토끼' },
  辰: { ko: '진', element: '토', mainStem: '戊', animal: '용' },
  巳: { ko: '사', element: '화', mainStem: '丙', animal: '뱀' },
  午: { ko: '오', element: '화', mainStem: '丁', animal: '말' },
  未: { ko: '미', element: '토', mainStem: '己', animal: '양' },
  申: { ko: '신', element: '금', mainStem: '庚', animal: '원숭이' },
  酉: { ko: '유', element: '금', mainStem: '辛', animal: '닭' },
  戌: { ko: '술', element: '토', mainStem: '戊', animal: '개' },
  亥: { ko: '해', element: '수', mainStem: '壬', animal: '돼지' },
};

// 한글 → 한자 역방향 찾기 (manseryeok-js는 한글로 주기 때문에 필요)
const KO_TO_STEM = Object.fromEntries(
  Object.entries(STEMS).map(([hanja, v]) => [v.ko, hanja])
);
const KO_TO_BRANCH = Object.fromEntries(
  Object.entries(BRANCHES).map(([hanja, v]) => [v.ko, hanja])
);

// ------------------------------------------------------------
// 오행의 관계: 생(生, 낳아 줌)과 극(剋, 억누름)
//   목생화 → 화생토 → 토생금 → 금생수 → 수생목 (순환)
//   목극토, 토극수, 수극화, 화극금, 금극목
// ------------------------------------------------------------
const GENERATES = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
const CONTROLS = { 목: '토', 토: '수', 수: '화', 화: '금', 금: '목' };

// ------------------------------------------------------------
// 십성(十星) 계산: 일간(나)과 다른 글자의 관계 이름
//   같은 오행이면 → 비견/겁재 (형제·동료)
//   내가 낳는 오행 → 식신/상관 (표현·재능)
//   내가 다스리는 오행 → 편재/정재 (재물)
//   나를 다스리는 오행 → 편관/정관 (직장·규율)
//   나를 낳는 오행 → 편인/정인 (공부·보호)
//   음양이 같으면 앞쪽(비견·식신·편재·편관·편인), 다르면 뒤쪽
// ------------------------------------------------------------
function tenGod(dayStemHanja, targetStemHanja) {
  const me = STEMS[dayStemHanja];
  const other = STEMS[targetStemHanja];
  const samePolarity = me.yang === other.yang;

  if (me.element === other.element) return samePolarity ? '비견' : '겁재';
  if (GENERATES[me.element] === other.element) return samePolarity ? '식신' : '상관';
  if (CONTROLS[me.element] === other.element) return samePolarity ? '편재' : '정재';
  if (CONTROLS[other.element] === me.element) return samePolarity ? '편관' : '정관';
  if (GENERATES[other.element] === me.element) return samePolarity ? '편인' : '정인';
  return null; // 여기 올 일은 없다
}

// ------------------------------------------------------------
// 기둥(pillar) 하나를 상세 정보 객체로 만들기
//   입력: 한자 2글자 (예: '甲辰')
// ------------------------------------------------------------
function buildPillar(hanjaPair, dayStemHanja) {
  if (!hanjaPair) return null;
  const [stemHanja, branchHanja] = [...hanjaPair];
  const stem = STEMS[stemHanja];
  const branch = BRANCHES[branchHanja];
  return {
    hanja: hanjaPair,                        // 甲辰
    ko: stem.ko + branch.ko,                 // 갑진
    stem: {
      hanja: stemHanja,
      ko: stem.ko,
      element: stem.element,
      yang: stem.yang,
      // 일간 자신은 십성 대신 '일간(나)'로 표시
      tenGod: dayStemHanja === null ? null : tenGod(dayStemHanja, stemHanja),
    },
    branch: {
      hanja: branchHanja,
      ko: branch.ko,
      element: branch.element,
      animal: branch.animal,
      // 지지의 십성은 그 지지의 대표 천간(본기) 기준으로 계산
      tenGod: dayStemHanja === null ? null : tenGod(dayStemHanja, branch.mainStem),
    },
  };
}

// ------------------------------------------------------------
// 메인 엔진 생성
//   deps.manseryeok : @fullstackfamily/manseryeok 모듈 (일주·시주 담당)
//   deps.Solar      : lunar-javascript 의 Solar 클래스 (년주·월주 담당)
// ------------------------------------------------------------
export function createSajuEngine({ manseryeok, Solar }) {
  /**
   * 사주 계산
   * @param {object} input
   *   year, month, day  : 양력 생년월일 (숫자)
   *   hour, minute      : 태어난 시각 (숫자, 시간 모름이면 생략)
   *   unknownTime       : true 면 시주 없이 3기둥
   *   longitude         : 태어난 지역 경도 (진태양시 보정용, 기본 서울)
   *   gender            : 'male' | 'female' — 대운 방향(순행/역행) 계산용
   */
  function calculate(input) {
    const {
      year, month, day,
      hour = null, minute = 0,
      unknownTime = false,
      longitude = 126.978, // 서울
      gender = 'female',
    } = input;

    // ── (1) 일주·시주: manseryeok-js (진태양시 보정 포함) ──────────
    const ms = unknownTime || hour === null
      ? manseryeok.calculateSaju(year, month, day)
      : manseryeok.calculateSaju(year, month, day, hour, minute, {
          longitude,
          applyTimeCorrection: true,
        });

    // ── (2) 년주·월주: lunar-javascript (절기 시각 분 단위 정확) ──
    // 절기가 바뀌는 '순간'은 세계 공통의 한 시점이다.
    // lunar-javascript 는 중국 표준시(한국보다 1시간 느림) 기준이므로
    // 한국 시각에서 1시간을 빼서 넣으면 같은 순간이 된다.
    // 시간 모름이면 낮 12시로 계산한다(절기 경계일이면 결과 화면에 안내).
    const h = unknownTime || hour === null ? 12 : hour;
    const mi = unknownTime || hour === null ? 0 : minute;
    const kst = new Date(year, month - 1, day, h, mi);
    const cst = new Date(kst.getTime() - 60 * 60 * 1000); // KST → CST (-1시간)
    const solar = Solar.fromYmdHms(
      cst.getFullYear(), cst.getMonth() + 1, cst.getDate(),
      cst.getHours(), cst.getMinutes(), 0
    );
    const lunarDate = solar.getLunar();
    const eightChar = lunarDate.getEightChar();
    const yearHanja = eightChar.getYear();   // 예: '甲辰'
    const monthHanja = eightChar.getMonth(); // 예: '丙寅'

    // ── (3) 일주·시주를 한자로 변환 (manseryeok는 한글로 준다) ────
    const dayHanja = ms.dayPillar
      ? KO_TO_STEM[ms.dayPillar[0]] + KO_TO_BRANCH[ms.dayPillar[1]]
      : null;
    const hourHanja = ms.hourPillar
      ? KO_TO_STEM[ms.hourPillar[0]] + KO_TO_BRANCH[ms.hourPillar[1]]
      : null;

    // ── (4) 네 기둥 조립 (일간 기준 십성 포함) ─────────────────────
    const dayStemHanja = dayHanja[0];
    const pillars = {
      year: buildPillar(yearHanja, dayStemHanja),
      month: buildPillar(monthHanja, dayStemHanja),
      day: buildPillar(dayHanja, dayStemHanja),
      hour: hourHanja ? buildPillar(hourHanja, dayStemHanja) : null,
    };
    // 일간 자신은 십성이 아니라 '나'
    pillars.day.stem.tenGod = null;

    // ── (5) 오행 개수 세기 (천간 + 지지, 시주 없으면 6글자) ───────
    const elementCount = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    for (const p of Object.values(pillars)) {
      if (!p) continue;
      elementCount[p.stem.element] += 1;
      elementCount[p.branch.element] += 1;
    }

    // ── (5.5) 대운: 10년 단위 운의 흐름 ─────────────────────────
    // 방향(순행/역행)과 간지 순서는 lunar-javascript의 Yun을 쓰되,
    // 시작 나이(대운수)는 한국 만세력 표준으로 직접 계산한다:
    //   · 대운수 = 절입(節)까지의 날수 ÷ 3 → 반올림 (전통 '1은 버리고 2는 올림')
    //   · 대운수는 세는나이 — 대운이 바뀌는 해 = 태어난 해 + 대운수 - 1
    // 검증 기준 사주: 1982-02-24 05:25 여성 → 입춘까지 19.69일, 대운수 7,
    // 정유(丁酉) 대운은 세는나이 47세 = 2028년 시작. (test-core.mjs 회귀 테스트)
    const yun = eightChar.getYun(gender === 'male' ? 1 : 0);
    const jieSolar = (yun.isForward() ? lunarDate.getNextJie() : lunarDate.getPrevJie())
      .getSolar(); // 절입 시각 (분 단위 천문 계산값)
    const diffDays = Math.abs(jieSolar.subtractMinute(solar)) / (24 * 60);
    const daeunSu = Math.max(1, Math.round(diffDays / 3)); // 대운수 (최소 1)
    const daeunPillars = yun.getDaYun()
      .filter((d) => d.getGanZhi()) // 첫 항목은 대운 전 유년기라 간지가 없다
      .slice(0, 8)                  // 8개 대운 = 80년이면 충분
      .map((d, i) => ({
        ...buildPillar(d.getGanZhi(), dayStemHanja),
        startAge: daeunSu + i * 10,             // 대운수 나이 (세는나이)
        endAge: daeunSu + i * 10 + 9,
        startYear: year + daeunSu + i * 10 - 1, // 세는나이 N세 해 = 출생연 + N - 1
      }));

    // ── (6) 결과 꾸러미 ────────────────────────────────────────────
    return {
      pillars,
      dayMaster: {                       // 일간 = 사주의 주인공(나)
        hanja: dayStemHanja,
        ko: STEMS[dayStemHanja].ko,
        element: STEMS[dayStemHanja].element,
        yang: STEMS[dayStemHanja].yang,
      },
      elementCount,
      daeun: {                           // 대운: 10년 단위 운의 흐름
        forward: yun.isForward(),        // true = 순행
        pillars: daeunPillars,
      },
      totalChars: hourHanja ? 8 : 6,     // 오행 분포의 분모
      correctedTime: ms.isTimeCorrected && ms.correctedTime
        ? ms.correctedTime               // {hour, minute} 진태양시
        : null,
      unknownTime: unknownTime || hour === null,
    };
  }

  return { calculate };
}

// 다른 파일에서도 쓸 수 있게 기초 데이터를 내보낸다
export { STEMS, BRANCHES, GENERATES, CONTROLS, tenGod };
