// ============================================================
// verify.mjs — 만세력 라이브러리 검증 스크립트 (1단계)
//
// 목적: 웹앱을 만들기 전에, 이 라이브러리가 사주 4기둥을
//       정확하게 계산하는지 사람이 직접 눈으로 확인하기 위한 스크립트.
//
// 실행 방법: 터미널에서  node verify.mjs
// ============================================================

// 라이브러리에서 필요한 함수를 가져온다(import).
// - calculateSaju     : 생년월일시 → 사주 4기둥 계산
// - getSolarTermsByYear: 특정 연도의 24절기 정확한 시각 조회
import {
  calculateSaju,
  getSolarTermsByYear,
} from '@fullstackfamily/manseryeok';

// ------------------------------------------------------------
// 결과를 보기 좋게 출력하는 도우미 함수
// ------------------------------------------------------------
function printSaju(title, saju) {
  console.log(`\n▶ ${title}`);
  console.log(`  년주: ${saju.yearPillar} (${saju.yearPillarHanja})`);
  console.log(`  월주: ${saju.monthPillar} (${saju.monthPillarHanja})`);
  console.log(`  일주: ${saju.dayPillar} (${saju.dayPillarHanja})`);
  if (saju.hourPillar) {
    console.log(`  시주: ${saju.hourPillar} (${saju.hourPillarHanja})`);
  } else {
    console.log(`  시주: (시간 미입력 — 3기둥)`);
  }
  // 진태양시 보정이 적용됐으면, 실제 계산에 쓰인 보정 시각을 보여준다.
  if (saju.isTimeCorrected && saju.correctedTime) {
    console.log(
      `  ※ 진태양시 보정 적용됨 → 계산에 쓰인 시각: ${saju.correctedTime.hour}시 ${saju.correctedTime.minute}분`
    );
  }
}

// ============================================================
// 테스트 1: 샘플 사주 (README 예제 날짜)
//   1990년 5월 15일 14시 30분, 서울(경도 127) 출생 가정
// ============================================================
console.log('==============================================');
console.log(' 테스트 1. 샘플 사주 — 1990-05-15 14:30 서울');
console.log('==============================================');
printSaju(
  '진태양시 보정 켬 (서울 경도 127 → 약 -32분)',
  calculateSaju(1990, 5, 15, 14, 30, { longitude: 127 })
);
printSaju(
  '진태양시 보정 끔 (시계 시각 그대로)',
  calculateSaju(1990, 5, 15, 14, 30, { applyTimeCorrection: false })
);

// ============================================================
// 테스트 2: 절기 경계 — 입춘(立春) 전후
//
// 명리학에서 "새해"는 1월 1일이 아니라 입춘부터 시작한다.
// 그래서 입춘 '직전'에 태어나면 전년도 간지,
// 입춘 '직후'에 태어나면 새해 간지가 되어야 한다.
// 년주와 월주가 동시에 바뀌는 가장 중요한 경계다.
//
// 라이브러리에 내장된 입춘의 '정확한 시각'을 먼저 조회한 뒤,
// 그 앞뒤 10분으로 계산해서 경계가 정확한지 확인한다.
// (경계 자체를 시험하는 것이므로 진태양시 보정은 끈다)
// ============================================================
for (const year of [2024, 2025]) {
  const terms = getSolarTermsByYear(year);
  const ipchun = terms.find((t) => t.name === '입춘');
  const dt = ipchun.datetime; // 입춘의 정확한 일시 (한국 시각)

  console.log('\n==============================================');
  console.log(` 테스트 2. ${year}년 입춘 경계`);
  console.log(
    `  라이브러리 내장 입춘 시각: ${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
  );
  console.log('==============================================');

  // 입춘 10분 전 / 10분 후 시각 만들기
  const before = new Date(dt.getTime() - 10 * 60 * 1000);
  const after = new Date(dt.getTime() + 10 * 60 * 1000);

  printSaju(
    `입춘 10분 전 (${before.getHours()}:${String(before.getMinutes()).padStart(2, '0')}) → 전년도 간지가 나와야 함`,
    calculateSaju(
      before.getFullYear(), before.getMonth() + 1, before.getDate(),
      before.getHours(), before.getMinutes(),
      { applyTimeCorrection: false }
    )
  );
  printSaju(
    `입춘 10분 후 (${after.getHours()}:${String(after.getMinutes()).padStart(2, '0')}) → 새해 간지가 나와야 함`,
    calculateSaju(
      after.getFullYear(), after.getMonth() + 1, after.getDate(),
      after.getHours(), after.getMinutes(),
      { applyTimeCorrection: false }
    )
  );
}

// ============================================================
// 테스트 3: "시간 모름" — 시간을 아예 안 넣으면 3기둥만 나오는지
// ============================================================
console.log('\n==============================================');
console.log(' 테스트 3. 시간 모름 (3기둥) — 1990-05-15');
console.log('==============================================');
printSaju('시간 미입력', calculateSaju(1990, 5, 15));
