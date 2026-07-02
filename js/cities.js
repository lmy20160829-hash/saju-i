// ============================================================
// cities.js — 태어난 지역과 경도(經度)
//
// 왜 경도가 필요한가?
//   우리나라 시계는 동경 135도(일본 아카시) 기준이라,
//   실제 태양의 위치보다 시계가 앞서 간다.
//   예: 서울(동경 126.98도)은 시계보다 약 32분 늦게 해가 남중한다.
//   사주의 시주(時柱)는 '진짜 태양 시간'으로 봐야 하므로
//   지역 경도로 보정한다. (진태양시 보정)
// ============================================================
export const CITIES = [
  { name: '서울', longitude: 126.978 },
  { name: '부산', longitude: 129.075 },
  { name: '대구', longitude: 128.601 },
  { name: '인천', longitude: 126.705 },
  { name: '광주', longitude: 126.852 },
  { name: '대전', longitude: 127.385 },
  { name: '울산', longitude: 129.311 },
  { name: '세종', longitude: 127.289 },
  { name: '수원', longitude: 127.029 },
  { name: '청주', longitude: 127.489 },
  { name: '전주', longitude: 127.148 },
  { name: '창원', longitude: 128.681 },
  { name: '제주', longitude: 126.531 },
  { name: '강릉', longitude: 128.876 },
  { name: '춘천', longitude: 127.730 },
  { name: '포항', longitude: 129.343 },
  { name: '여수', longitude: 127.662 },
  { name: '목포', longitude: 126.392 },
  { name: '기타 (서울 기준)', longitude: 126.978 },
];
