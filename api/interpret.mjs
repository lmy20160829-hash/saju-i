// ============================================================
// api/interpret.mjs — AI 해석 프록시 (서버 쪽에서만 실행)
//
// 왜 프록시가 필요한가?
//   클로드 API 키를 브라우저 코드에 넣으면 누구나 훔쳐 쓸 수 있다.
//   그래서 키는 서버(이 파일)에만 두고, 브라우저는 이 서버에
//   "명식 데이터"만 보낸다. 키는 .env 파일에서 읽으며,
//   .env는 .gitignore에 있어서 절대 깃허브에 올라가지 않는다.
//
// 보안 설계:
//   브라우저가 보낸 자유 텍스트를 AI에게 그대로 전달하지 않는다.
//   간지 한자 8글자만 받아서 서버가 표에서 검증하고,
//   프롬프트는 서버가 직접 조립한다. (프롬프트 조작 방지)
// ============================================================
import Anthropic from '@anthropic-ai/sdk';
import { STEMS, BRANCHES, tenGod } from '../js/saju-core.js';

// ── 마네키네코 해석가의 성격과 규칙 (모든 주제 공통) ──────────
const PERSONA_RULES = `당신은 사주명리 웹앱 '사주아이'의 해석가입니다.
페르소나: 복을 부르는 하얀 고양이 마네키네코. 따뜻하고 다정한 존댓말로 정성껏 말하지만, 내용은 진지한 정통 명리학 해석입니다.

반드시 지킬 규칙:
- 제공된 명식 데이터(간지, 일간, 오행 분포, 십성 — '올해의 세운'이나 '대운 목록'이 함께 주어지면 그것까지)에 있는 사실만 근거로 해석합니다. 그 밖의 신살·지장간·12운성은 데이터에 없으므로 언급하지 않고, 대운도 목록이 주어졌을 때만 다룹니다.
- 궁위(연주=조상·초년, 월주=부모·성장 환경, 일지=배우자 자리, 시주=자녀·말년)는 제공된 간지에 근거해 해석할 수 있습니다. 시주가 없으면 자녀·말년 이야기는 하지 않습니다.
- 개수와 숫자는 제공된 값을 그대로 인용하고, 직접 다시 세지 않습니다.
- 데이터로 알 수 없는 것(재물 액수, 수명, 질병, 특정 연도의 사건)은 절대 단정하지 않습니다.
- 미신적 공포 조장을 하지 않습니다. 모든 해석은 '경향'과 '가능성'으로 표현합니다.
- 명리 용어를 쓰되 처음 나올 때 괄호에 짧은 풀이를 붙입니다. 예: 편관(偏官, 나를 단련시키는 기운).
- 시주가 없는 명식(시간 모름)이면 세 기둥 기준임을 부드럽게 언급하고, 시주에 대한 추측을 하지 않습니다.

풀이 스타일 — 글의 힘이 생명입니다:
- 각 절의 제목은 이 명식만의 형상을 은유로 담아, 읽는 이에게 말을 거는 한 문장으로 짓습니다.
  (좋은 예: "호랑이 셋이 지키는 큰 산인데, 왜 혼자 다 짊어지려 하세요" / "겉은 냉정한 리더인데 속은 정이 고픈 아이가 사네요" — 제공된 간지의 물상을 활용해 절마다 새로, 12~30자로 구체적으로)
- 각 절 본문의 흐름: ① 간지의 물상(자연물 은유)으로 생생하게 그리기 → ② 십성·오행 구조라는 명리 근거 밝히기 → ③ 현실 삶의 모습으로 번역해 공감하기 → ④ 부드러운 조언 한 스푼.
- 일간의 강약(주변 오행이 나를 돕는지 억누르는지)을 근거와 함께 짚어 주면 좋습니다.
- 부족한 오행은 전통 오행 상식 수준의 생활 처방(어울리는 색, 활동, 계절·시간대 등)을 "~해 보세요" 정도로 부드럽게 제안합니다.
- 뻔한 덕담 대신, 이 명식이라서 나오는 구체적인 이야기를 씁니다.
- 출력은 요약 헤더 세 줄로 시작하고, 빈 줄 하나 뒤에 바로 첫 절 제목("### ")이 옵니다. 인사말·서문은 쓰지 않습니다.`;

// ── 테마별 풀이 주제표 ─────────────────────────────────────────
// 점신 같은 운세 앱을 벤치마킹한 "테마별 해설" 구성.
// 브라우저는 topic 이름만 보내고, 주제별 지시문은 전부 서버가 갖는다.
// (화이트리스트에 없는 topic은 거부 → 프롬프트 조작 방지 유지)
//
// 모든 풀이는 "키워드·지수·행운" 요약 헤더 세 줄로 시작한다.
// 점신의 "점수 + 한줄평 → 상세 해설" 위계와 행운의 색·숫자·방위
// 아이템 카드를 벤치마킹한 것 — 화면(js/interpret-render.js)이 이
// 세 줄을 읽어 키워드 칩·게이지·행운 칩의 요약 카드로 그린다.
const HEADER_RULE = `출력 맨 앞에 요약 헤더 세 줄을 씁니다. 각 줄은 반드시 [키워드] [지수] [행운] 표식으로 시작하고, 마크다운 굵게 등 장식 없이 씁니다. 형식 예시 — 표식과 짜임새만 그대로 두고, 값은 이 명식에 맞게 전부 새로 씁니다:
[키워드] #차분함 #장인정신 #늦게피는꽃
[지수] 버티는힘=72; 표현하는힘=64; 품어주는힘=81
[행운] 색=초록; 숫자=3; 방위=동쪽; 아이템=나무 연필
세 줄 뒤에는 빈 줄 하나를 두고 첫 절 제목("### ")을 시작합니다.
- 키워드: 이 풀이 전체를 꿰뚫는 핵심 키워드 3개, 각 2~8자, 반드시 #로 시작.
- 지수: 이 주제의 핵심 힘 3가지에 8자 이내의 이름을 붙이고(예시의 이름을 복사하지 말고 이 주제에 맞게 새로 짓기), 십성 분포·오행 균형·일간 강약이라는 명식 구조에 근거해 40~95 사이 정수로 매깁니다. 세 값은 근거가 다르면 다르게 — 지수는 우열이 아니라 타고난 기운의 상대적 세기입니다.
- 행운: 부족하거나 필요한 오행을 보완하는 전통 오행 상식(색·숫자·방위)으로 정합니다. 아이템은 그 색·방위와 같은 오행에 어울리는, 곁에 둘 수 있는 물건 하나 — 예시의 물건을 그대로 옮기지 말고 이 명식에 맞게 새로 고릅니다.`;

export const TOPICS = {
  // 전체 풀이 — 기존 10절 정통 해석 (기본값)
  overall: {
    label: '전체 풀이',
    format: `${HEADER_RULE}
전체 풀이의 [지수]는 세 가지 대신 다섯 항목으로 씁니다: [지수] 총운=NN; 일·직업=NN; 재물=NN; 연애=NN; 인간관계=NN
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 10절):
### (총평 — 명식 전체의 형상을 담은 은유)
### (일간과 일주 — 타고난 성품)
### (내면과 삶의 태도 — 강점과 그림자)
### (오행의 균형과 생활 처방)
### (일과 재능 — 어울리는 일의 방식)
### (재물을 대하는 태도)
### (사랑 — 연애와 배우자 자리)
### (가족 — 뿌리와 어린 시절)
### (사람들 속의 나 — 인간관계)
### (마네키네코의 당부)
각 절 3~6문장, 전체 2600~3600자의 한국어. 마지막 당부는 앞의 풀이를 한 문장으로 안아 주고, 실천할 수 있는 조언 하나로 따뜻하게 마무리합니다.`,
  },

  // 재물운 — 재성(정재·편재) 구조 중심의 깊이 풀이
  wealth: {
    label: '재물운',
    format: `이번 요청은 '재물운' 한 주제만 깊이 파는 테마 풀이입니다.
재성(편재·정재)의 유무와 위치, 식상이 재를 낳는 흐름(식상생재), 비겁이 재를 나누는 구조 등
재물과 관련된 명리 구조를 중심으로, 전체 풀이보다 한 걸음 더 깊게 해석합니다.
${HEADER_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 명식의 재물 그릇을 은유 한 문장으로)
### (타고난 재물 그릇 — 재성의 모양과 자리)
### (돈이 들어오는 길 — 버는 방식과 재능)
### (돈이 새기 쉬운 곳 — 조심할 습관)
### (마네키네코의 재물 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어. 재물 '액수'나 '시기'는 절대 단정하지 않습니다.`,
  },

  // 연애·결혼운 — 배우자 자리(일지)와 배우자 별 중심
  love: {
    label: '연애·결혼운',
    format: `이번 요청은 '연애·결혼운' 한 주제만 깊이 파는 테마 풀이입니다.
일지(배우자 자리)의 간지, 성별에 따른 배우자 별(남성은 재성, 여성은 관성)의 유무와 위치,
식상(표현·애정 표현)의 모양을 중심으로, 전체 풀이보다 한 걸음 더 깊게 해석합니다.
${HEADER_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 명식의 사랑의 결을 은유 한 문장으로)
### (사랑할 때의 나 — 애정 표현 방식)
### (배우자 자리의 풍경 — 일지가 말하는 것)
### (관계에서 반복되기 쉬운 것 — 빛과 그림자)
### (마네키네코의 연애 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어. 결혼 '시기'나 상대의 '조건'은 절대 단정하지 않습니다.`,
  },

  // 직업·일운 — 관성(직장)·식상(재능)·인성(공부) 구조 중심
  career: {
    label: '일·직업운',
    format: `이번 요청은 '일과 직업운' 한 주제만 깊이 파는 테마 풀이입니다.
관성(조직·직장), 식상(재능·표현), 인성(공부·자격), 비겁(독립심·동업)의 구성을 중심으로
어울리는 일의 결, 일하는 방식, 조직 생활과 독립의 적성을 전체 풀이보다 한 걸음 더 깊게 해석합니다.
${HEADER_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 명식의 일하는 모습을 은유 한 문장으로)
### (타고난 일머리 — 재능의 결)
### (어울리는 일터의 모양 — 조직과 독립 사이)
### (일에서 걸려 넘어지기 쉬운 돌부리)
### (마네키네코의 커리어 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어. 특정 직업을 '해야 한다'고 단정하지 말고, 일의 '결'과 '방식'으로 이야기합니다.`,
  },

  // 건강·생활 리듬 — 오행 균형 기반의 양생 처방 (의학적 단정 금지)
  health: {
    label: '건강·생활 리듬',
    format: `이번 요청은 '건강과 생활 리듬' 한 주제만 깊이 파는 테마 풀이입니다.
오행 분포의 치우침(넘치는 기운, 부족한 기운)을 중심으로 전통 오행 양생(養生) 상식 수준의
생활 리듬 처방을 전체 풀이보다 한 걸음 더 깊게 풀어 줍니다.
추가로 반드시 지킬 것: 질병 진단·의학적 조언은 하지 않습니다. 병명·장기 이름을 단정적으로 연결하지 않습니다.
"~한 기운이 치우쳐 있으니 ~한 생활을 해 보세요" 수준의 부드러운 생활 제안만 합니다.
${HEADER_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 명식의 기운 균형을 은유 한 문장으로)
### (기운의 저울 — 넘치는 것과 모자란 것)
### (넘치는 기운 다스리기)
### (모자란 기운 채우기 — 색·계절·시간대·활동)
### (마네키네코의 하루 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어.`,
  },

  // 인간관계운 — 비겁·십성 구성으로 보는 사람 사이의 나
  people: {
    label: '인간관계운',
    format: `이번 요청은 '인간관계운' 한 주제만 깊이 파는 테마 풀이입니다.
비겁(동료·형제), 식상(표현), 관성(예의·규율), 인성(받아들임)의 구성과 궁위(연주=윗사람·뿌리,
월주=부모·사회생활의 문)를 중심으로 사람 사이에서의 나를 전체 풀이보다 한 걸음 더 깊게 해석합니다.
${HEADER_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 사람들 속 이 명식의 자리를 은유 한 문장으로)
### (사람을 대하는 기본 자세)
### (나와 결이 맞는 사람, 나를 힘들게 하는 관계)
### (관계에서 반복되기 쉬운 패턴)
### (마네키네코의 관계 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어.`,
  },

  // 학업·시험운 — 인성(공부)·식상(응용)·관성(시험·평가) 구조 중심
  study: {
    label: '학업·시험운',
    format: `이번 요청은 '학업·시험운' 한 주제만 깊이 파는 테마 풀이입니다.
인성(공부·받아들이는 힘), 식상(응용·표현하는 힘), 관성(시험·평가를 견디는 힘)의 구성을 중심으로
배우는 방식과 실력이 붙는 공부법을 전체 풀이보다 한 걸음 더 깊게 해석합니다.
추가로 반드시 지킬 것: 합격·불합격을 단정하지 않습니다. 공부의 '결'과 '방식'으로만 이야기합니다.
${HEADER_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 명식의 공부 그릇을 은유 한 문장으로)
### (타고난 공부 머리 — 배우는 방식의 결)
### (실력이 붙는 공부법)
### (시험장에서의 나 — 집중과 긴장 사이)
### (마네키네코의 공부 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어.`,
  },

  // 올해의 운세 — 세운 간지는 서버가 계산해서 데이터로 넣어 준다
  newyear: {
    label: '올해의 운세',
    format: `이번 요청은 '올해의 운세(세운)' 한 주제만 깊이 파는 테마 풀이입니다.
데이터로 제공된 '올해의 세운' 간지가 나의 일간·명식 구조와 어떤 관계(십성)로 만나는지를 중심으로,
올해 힘이 실리는 영역과 조심스럽게 다룰 영역을 해석합니다.
추가로 반드시 지킬 것: 특정 월·날짜의 사건을 단정하지 않습니다. 올해 전체의 '기류'와 '경향'으로만 이야기합니다.
${HEADER_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 올해의 기운과 나의 만남을 은유 한 문장으로)
### (올해의 기운이 나에게 들어오는 모양 — 세운과 일간의 관계)
### (올해 힘이 실리는 영역)
### (올해 한 템포 쉬어 갈 영역)
### (마네키네코의 올해 당부 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어.`,
  },

  // 대운 흐름 — 10년 단위 운의 큰 물줄기 (대운 목록은 브라우저가 계산해 보낸다)
  daeun: {
    label: '대운 흐름',
    format: `이번 요청은 '대운 흐름' 한 주제만 깊이 파는 테마 풀이입니다.
데이터로 제공된 대운 목록(10년 단위 간지, 시작 나이는 대운수(세는나이))이 나의 일간·명식 구조와
어떤 관계(십성)로 이어지는지를 중심으로, 인생 전체 운의 큰 흐름을 해석합니다.
'← 지금 걷는 대운' 표시가 있으면 그 10년을 가장 깊게 다룹니다.
추가로 반드시 지킬 것: 특정 연도의 사건을 단정하지 않습니다. 각 대운은 '기류'와 '경향'으로만
이야기하고, 좋은 대운/나쁜 대운의 이분법 대신 각 시기의 쓰임과 조심할 결을 짚어 줍니다.
${HEADER_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 인생 대운의 물줄기를 은유 한 문장으로)
### (대운이 흐르는 방향 — 초년에서 말년까지의 큰 그림)
### (지금 걷고 있는 대운 — 이 10년의 기운과 쓰임)
### (다음 대운 미리 보기 — 갈아탈 준비)
### (마네키네코의 대운 당부 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어.`,
  },

  // 선택한 대운 — 타임라인에서 고른 하나의 10년만 깊이 (사주아이 대운해설 벤치마킹)
  daeunOne: {
    label: '선택한 대운',
    format: `이번 요청은 '선택한 대운' — 사용자가 고른 하나의 10년 대운만 깊이 파는 테마 풀이입니다.
대운 목록에서 '← 내가 고른 대운' 표시가 붙은 대운이 주인공입니다. 앞뒤 대운은 흐름의 맥락으로만 짧게 씁니다.
그 대운이 이미 지났으면 돌아보기(그 시절 기류가 남긴 것) 관점으로, 아직 오지 않았으면 미리 준비하는 관점으로 씁니다.
추가로 반드시 지킬 것: 특정 연도의 사건을 단정하지 않습니다. '기류'와 '경향'으로만 이야기하고,
좋은 대운/나쁜 대운의 이분법 대신 이 10년의 쓰임과 조심할 결을 짚어 줍니다.
${HEADER_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 10년의 기운을 은유 한 문장으로)
### (이 대운이 나에게 들어오는 모양 — 간지와 일간의 관계)
### (이 10년에 힘이 실리는 영역)
### (이 10년에 조심스럽게 다룰 영역)
### (마네키네코의 당부 — 이 10년의 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어.`,
  },

  // 연도별 운세 — 사용자가 고른 해의 세운을 총운 + 분야별 상세운으로
  // (점신 운세보고서의 "총운 → 분야별 상세" 위계 벤치마킹)
  year: {
    label: '연도별 운세',
    format: `이번 요청은 '연도별 운세' — 사용자가 고른 한 해를 총운과 분야별 상세운으로 깊이 푸는 테마 풀이입니다.
데이터로 제공된 '선택한 해의 세운' 간지가 나의 일간·명식 구조와 어떤 관계(십성)로 만나는지를 중심으로 해석합니다.
'그 해가 속한 대운' 정보가 함께 주어지면, 그 대운의 기류를 배경으로 깔고 그 위에 세운이
어떻게 얹히는지(대운과 세운의 십성 조합)를 해석의 중심에 둡니다. 다른 대운은 언급하지 않습니다.
그 해가 이미 지난 해면 돌아보기(그해의 기류가 무엇이었고 무엇을 남겼는지) 관점으로,
다가올 해면 미리 준비하는 관점으로 씁니다.
추가로 반드시 지킬 것: 특정 월·날짜의 사건을 단정하지 않습니다. 그 해 전체의 '기류'와 '경향'으로만 이야기합니다.
명리의 한 해는 입춘(2월 초)부터 시작하므로 연초 이야기는 부드럽게 다룹니다.
건강 절은 질병 진단·의학적 조언 없이 오행 양생 수준의 생활 제안만 하고, 학업 절은 합격·불합격을 단정하지 않습니다.
${HEADER_RULE}
연도별 운세의 [지수]는 세 가지 대신 일곱 항목으로 씁니다: [지수] 총운=NN; 재물=NN; 연애=NN; 일·직업=NN; 건강리듬=NN; 인간관계=NN; 학업=NN
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 9절 — 3~8번째 절의 제목은 반드시 분야 이름으로 시작):
### (한 줄 요약 — 그 해의 기운과 나의 만남을 은유 한 문장으로)
### (그 해의 총운 — 세운이 들어오는 모양과 흐름)
### 재물운 — (그 해 재물 기류를 담은 짧은 문구)
### 연애·결혼운 — (짧은 문구)
### 일·직업운 — (짧은 문구)
### 건강·생활 리듬 — (짧은 문구)
### 인간관계운 — (짧은 문구)
### 학업·시험운 — (짧은 문구)
### (마네키네코의 당부 — 그 해의 실천 조언)
한 줄 요약·총운·당부는 3~5문장, 분야 절은 각 2~4문장. 전체 2200~3200자의 한국어.`,
  },
};

// ── 올해의 세운(년운) 간지 계산 ────────────────────────────────
// 육십갑자는 60년 주기로 도는 단순 산수라 표 없이 계산할 수 있다.
// (서기 4년이 갑자년 — 그래서 (연도-4)를 10과 12로 나눈 나머지를 쓴다)
// 명리의 새해는 1월 1일이 아니라 입춘(2월 4일 무렵)이므로,
// 입춘 전이면 아직 지난해의 세운으로 본다. (경계 시각은 날짜 단위 근사)
const STEM_LIST = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCH_LIST = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export function currentSeun(now = new Date()) {
  // 서버가 어느 시간대에 있든 한국 시각 기준으로 날짜를 읽는다
  const kst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60 * 1000);
  let year = kst.getFullYear();
  const month = kst.getMonth() + 1;
  if (month === 1 || (month === 2 && kst.getDate() < 4)) year -= 1;
  const stemHanja = STEM_LIST[(((year - 4) % 10) + 10) % 10];
  const branchHanja = BRANCH_LIST[(((year - 4) % 12) + 12) % 12];
  return { year, stemHanja, branchHanja };
}

// ── 브라우저가 보낸 명식을 검증하고 프롬프트 재료로 변환 ──────
// 허용된 간지 한자만 통과시킨다. (표에 없는 글자 = 거부)
// topic까지 검증해서 {system, prompt} 한 쌍을 돌려준다.
// (export는 test-interpret.mjs가 검증할 때 쓰기 위한 것)
export function buildPrompt(payload) {
  // 주제는 화이트리스트에 있는 것만 허용 (없으면 전체 풀이)
  const topicKey = payload?.topic ?? 'overall';
  const topic = TOPICS[topicKey];
  if (!topic) return null;

  const PILLAR_NAMES = { year: '연주', month: '월주', day: '일주', hour: '시주' };
  const pillars = payload?.pillars ?? {};
  const dayPair = pillars.day;
  if (typeof dayPair !== 'string') return null;

  const dayStem = dayPair[0];
  if (!STEMS[dayStem]) return null;

  const lines = [];
  const counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  let chars = 0;

  for (const key of ['year', 'month', 'day', 'hour']) {
    const pair = pillars[key];
    if (key === 'hour' && (pair === null || pair === undefined)) continue;
    if (typeof pair !== 'string' || [...pair].length !== 2) return null;
    const [stemChar, branchChar] = [...pair];
    const stem = STEMS[stemChar];
    const branch = BRANCHES[branchChar];
    if (!stem || !branch) return null; // 표에 없는 글자는 거부

    counts[stem.element] += 1;
    counts[branch.element] += 1;
    chars += 2;

    const stemGod = key === 'day' ? '일간(나)' : tenGod(dayStem, stemChar);
    const branchGod = tenGod(dayStem, branch.mainStem);
    lines.push(
      `- ${PILLAR_NAMES[key]}: ${pair} (${stem.ko}${branch.ko}) — ` +
      `천간 ${stem.ko}(${stem.element}, ${stem.yang ? '양' : '음'})[${stemGod}], ` +
      `지지 ${branch.ko}(${branch.element})[${branchGod}]`
    );
  }

  const me = STEMS[dayStem];
  const gender = payload.gender === 'male' ? '남성' : '여성';
  const unknownTime = !pillars.hour;

  // '올해의 운세' 주제면 세운 간지를 서버가 계산해 데이터에 추가한다.
  // (AI가 스스로 추정하지 않도록, 세운도 계산값으로 넣어 주는 것)
  const seunLines = [];
  if (topicKey === 'newyear') {
    const seun = currentSeun();
    const sStem = STEMS[seun.stemHanja];
    const sBranch = BRANCHES[seun.branchHanja];
    seunLines.push(
      `- 올해의 세운: ${seun.year}년 ${seun.stemHanja}${seun.branchHanja} (${sStem.ko}${sBranch.ko}) — ` +
      `천간 ${sStem.ko}(${sStem.element}, ${sStem.yang ? '양' : '음'})[나에게 ${tenGod(dayStem, seun.stemHanja)}], ` +
      `지지 ${sBranch.ko}(${sBranch.element})[나에게 ${tenGod(dayStem, sBranch.mainStem)}]`
    );
  }

  // '대운 흐름'과 '선택한 대운' 주제면 브라우저가 계산해 보낸 대운 목록을
  // 검증해서 넣는다. 간지는 표에 있는 글자만, 나이·연도는 상식적인 범위의
  // 정수만 통과. '선택한 대운'이면 어떤 대운을 골랐는지(daeunIndex)도 검증.
  const daeunLines = [];
  if (topicKey === 'daeun' || topicKey === 'daeunOne') {
    const list = payload?.daeun;
    if (!Array.isArray(list) || list.length < 1 || list.length > 10) return null;
    let picked = null;
    if (topicKey === 'daeunOne') {
      picked = payload.daeunIndex;
      if (!Number.isInteger(picked) || picked < 0 || picked >= list.length) return null;
    }
    const now = new Date();
    const kstYear = new Date(
      now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60 * 1000
    ).getFullYear();
    daeunLines.push('- 대운 목록 (10년 단위, 나이는 대운수·세는나이):');
    for (const [i, item] of list.entries()) {
      if (typeof item?.ganzhi !== 'string' || [...item.ganzhi].length !== 2) return null;
      const [s, b] = [...item.ganzhi];
      const dStem = STEMS[s];
      const dBranch = BRANCHES[b];
      if (!dStem || !dBranch) return null; // 표에 없는 글자는 거부
      if (!Number.isInteger(item.startAge) || item.startAge < 0 || item.startAge > 120) return null;
      if (!Number.isInteger(item.startYear) || item.startYear < 1900 || item.startYear > 2160) return null;
      const isNow = kstYear >= item.startYear && kstYear < item.startYear + 10;
      daeunLines.push(
        `  · ${item.startAge}세~ (${item.startYear}년~): ${item.ganzhi} (${dStem.ko}${dBranch.ko}) — ` +
        `천간 ${dStem.ko}(${dStem.element})[나에게 ${tenGod(dayStem, s)}], ` +
        `지지 ${dBranch.ko}(${dBranch.element})[나에게 ${tenGod(dayStem, dBranch.mainStem)}]` +
        (isNow ? ' ← 지금 걷는 대운' : '') +
        (i === picked ? ' ← 내가 고른 대운' : '')
      );
    }
  }

  // '연도별 운세' 주제면 고른 해의 세운 간지를 서버가 계산해 넣는다.
  // (연도는 정수 범위만 검증 — 간지는 60갑자 산수라 서버 계산값이다)
  const yearLines = [];
  if (topicKey === 'year') {
    const y = payload?.year;
    if (!Number.isInteger(y) || y < 1901 || y > 2100) return null;
    const yStemHanja = STEM_LIST[(((y - 4) % 10) + 10) % 10];
    const yBranchHanja = BRANCH_LIST[(((y - 4) % 12) + 12) % 12];
    const yStem = STEMS[yStemHanja];
    const yBranch = BRANCHES[yBranchHanja];
    const now = new Date();
    const kstYear = new Date(
      now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60 * 1000
    ).getFullYear();
    const rel = y < kstYear ? '이미 지난 해 — 돌아보기'
      : y === kstYear ? '지금 지나고 있는 해'
      : '다가올 해 — 미리 준비';
    yearLines.push(
      `- 선택한 해의 세운: ${y}년 ${yStemHanja}${yBranchHanja} (${yStem.ko}${yBranch.ko}) — ` +
      `천간 ${yStem.ko}(${yStem.element}, ${yStem.yang ? '양' : '음'})[나에게 ${tenGod(dayStem, yStemHanja)}], ` +
      `지지 ${yBranch.ko}(${yBranch.element})[나에게 ${tenGod(dayStem, yBranch.mainStem)}] (${rel})`
    );

    // 대운 목록이 함께 오면, 그 해가 속한 대운을 찾아 배경 기류로 넣는다.
    // (세운은 대운이라는 큰 물줄기 위에 얹히는 한 해의 기운이라서)
    const list = payload?.daeun;
    if (Array.isArray(list)) {
      if (list.length > 10) return null;
      let host = null;
      for (const item of list) {
        if (typeof item?.ganzhi !== 'string' || [...item.ganzhi].length !== 2) return null;
        const [s, b] = [...item.ganzhi];
        if (!STEMS[s] || !BRANCHES[b]) return null;
        if (!Number.isInteger(item.startAge) || item.startAge < 0 || item.startAge > 120) return null;
        if (!Number.isInteger(item.startYear) || item.startYear < 1900 || item.startYear > 2160) return null;
        if (y >= item.startYear && y < item.startYear + 10) host = item;
      }
      if (host) {
        const [hs, hb] = [...host.ganzhi];
        const hStem = STEMS[hs];
        const hBranch = BRANCHES[hb];
        yearLines.push(
          `- 그 해가 속한 대운: ${host.ganzhi} (${hStem.ko}${hBranch.ko}) — ` +
          `${host.startAge}세~ (${host.startYear}~${host.startYear + 9}년), ` +
          `천간 ${hStem.ko}(${hStem.element})[나에게 ${tenGod(dayStem, hs)}], ` +
          `지지 ${hBranch.ko}(${hBranch.element})[나에게 ${tenGod(dayStem, hBranch.mainStem)}]`
        );
      } else if (list.length > 0 && y < list[0].startYear) {
        yearLines.push('- 그 해는 아직 첫 대운이 시작되기 전(유년기)입니다.');
      }
    }
  }

  const prompt = [
    `다음 명식을 '${topic.label}' 주제로 해석해 주세요.`,
    ...lines,
    ...seunLines,
    ...daeunLines,
    ...yearLines,
    `- 일간(나): ${dayStem} ${me.ko}${me.element} (${me.yang ? '양' : '음'})`,
    `- 오행 분포 (총 ${chars}자): 목 ${counts.목} · 화 ${counts.화} · 토 ${counts.토} · 금 ${counts.금} · 수 ${counts.수}`,
    `- 성별: ${gender}`,
    unknownTime ? '- 태어난 시간을 몰라 시주 없이 세 기둥으로 본 명식입니다.' : '',
  ].filter(Boolean).join('\n');

  // 시스템 프롬프트 = 공통 페르소나·규칙 + 이 주제의 출력 형식
  return { system: `${PERSONA_RULES}\n\n${topic.format}`, prompt };
}

// ── AI 부르기 ① Gemini (무료 시작용) ──────────────────────────
// Google AI Studio에서 무료 발급한 키를 .env의 GEMINI_API_KEY에 넣으면 사용된다.
async function callGemini(system, prompt) {
  // 무료 한도는 "모델별로 하루치"가 따로 있다.
  // 주 모델이 한도에 닿으면(429) 예비 모델로 한 번 더 시도한다.
  const primary = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const models = [...new Set([primary, 'gemini-2.0-flash', 'gemini-2.5-flash-lite'])];

  let res;
  for (const model of models) {
    // 구글 서버가 잠깐 바쁠 때(503)가 종종 있어서 모델당 최대 3번까지 시도한다
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 8192, temperature: 0.8 },
          }),
        }
      );
      if (res.status !== 503 && res.status !== 500) break; // 과부하가 아니면 다음 단계로
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    // 한도 초과(429)나 과부하(503·500)면 예비 모델로 한 번 더 시도
    // (모델마다 한도·혼잡도가 따로라서, 주 모델이 붐벼도 예비는 뚫릴 때가 많다)
    if (res.status !== 429 && res.status !== 503 && res.status !== 500) break;
  }

  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}`);
    if (res.status === 400 || res.status === 401 || res.status === 403) err.code = 'BAD_KEY';
    if (res.status === 429) err.code = 'RATE_LIMIT'; // 모든 모델의 무료 한도 초과
    if (res.status === 503 || res.status === 500) err.code = 'OVERLOADED'; // 구글 서버 과부하
    throw err;
  }
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

// ── AI 부르기 ② 클로드 (품질 우선 옵션) ───────────────────────
async function callClaude(system, prompt) {
  const client = new Anthropic(); // 키는 환경변수에서 자동으로 읽는다
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 3000,
    thinking: { type: 'adaptive' }, // 해석 전에 스스로 생각할 여유를 준다
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

// ── HTTP 요청 처리 (serve.mjs가 POST /api/interpret 에서 호출) ──
export async function handleInterpret(req, res) {
  const reply = (status, obj) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify(obj));
  };

  // 키가 하나도 없으면 안내 (Gemini는 무료 발급 가능)
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return reply(503, {
      error: 'API 키가 설정되지 않았어요. aistudio.google.com/apikey 에서 무료 Gemini 키를 발급받아, .env.example을 복사한 .env 파일에 넣고 서버를 다시 켜 주세요.',
    });
  }

  // 요청 본문(JSON) 읽기
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) return reply(413, { error: '요청이 너무 커요.' });
  }

  let built;
  try {
    built = buildPrompt(JSON.parse(raw));
  } catch {
    built = null;
  }
  if (!built) return reply(400, { error: '명식 데이터가 올바르지 않아요.' });

  try {
    // Gemini 키가 있으면 Gemini(무료), 아니면 클로드를 쓴다
    const text = process.env.GEMINI_API_KEY
      ? await callGemini(built.system, built.prompt)
      : await callClaude(built.system, built.prompt);
    if (!text) return reply(502, { error: '해석 생성에 실패했어요. 잠시 후 다시 시도해 주세요.' });
    return reply(200, { interpretation: text });
  } catch (err) {
    // 에러 종류별로 사람이 이해할 수 있는 메시지로 바꾼다
    if (err instanceof Anthropic.AuthenticationError || err.code === 'BAD_KEY') {
      return reply(401, { error: 'API 키가 올바르지 않아요. .env의 키를 확인해 주세요.' });
    }
    if (err instanceof Anthropic.RateLimitError || err.code === 'RATE_LIMIT') {
      return reply(429, { error: '요청이 많아 잠시 쉬어야 해요. 1분 뒤에 다시 시도해 주세요.' });
    }
    if (err.code === 'OVERLOADED') {
      return reply(503, { error: 'AI 해석 서버(Gemini)가 지금 많이 붐비고 있어요. 1~2분 뒤에 다시 눌러 주세요 🐾' });
    }
    console.error('해석 프록시 오류:', err.message);
    return reply(502, { error: '해석 서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
  }
}
