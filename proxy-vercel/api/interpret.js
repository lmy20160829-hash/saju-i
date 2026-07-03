// ============================================================
// proxy-vercel/api/interpret.js — AI 해석 프록시 (Vercel 서버리스)
//
// 왜 Vercel인가?
//   구글이 Gemini '무료 등급'을 일부 지역 서버에서 차단하는데,
//   Cloudflare 워커는 실행 위치가 복불복이라 자주 걸렸다.
//   Vercel 함수는 항상 미국(iad1)에서 실행되어 안정적이다.
//
// 배포: proxy-vercel 폴더에서  npx vercel --prod
// 키:   npx vercel env add GEMINI_API_KEY production
// ============================================================

// 해석 요청을 허용할 사이트 주소
const ALLOWED_ORIGIN = 'https://lmy20160829-hash.github.io';

// ── 간지 검증용 미니 표 (api/interpret.mjs와 동일 데이터) ──
const STEMS = {
  甲:['갑','목',1],乙:['을','목',0],丙:['병','화',1],丁:['정','화',0],戊:['무','토',1],
  己:['기','토',0],庚:['경','금',1],辛:['신','금',0],壬:['임','수',1],癸:['계','수',0],
};
const BRANCHES = {
  子:['자','수','癸'],丑:['축','토','己'],寅:['인','목','甲'],卯:['묘','목','乙'],
  辰:['진','토','戊'],巳:['사','화','丙'],午:['오','화','丁'],未:['미','토','己'],
  申:['신','금','庚'],酉:['유','금','辛'],戌:['술','토','戊'],亥:['해','수','壬'],
};
const GEN = { 목:'화',화:'토',토:'금',금:'수',수:'목' };
const CTRL = { 목:'토',토:'수',수:'화',화:'금',금:'목' };

function tenGod(me, target) {
  const [, meEl, meYang] = STEMS[me];
  const [, tEl, tYang] = STEMS[target];
  const same = meYang === tYang;
  if (meEl === tEl) return same ? '비견' : '겁재';
  if (GEN[meEl] === tEl) return same ? '식신' : '상관';
  if (CTRL[meEl] === tEl) return same ? '편재' : '정재';
  if (CTRL[tEl] === meEl) return same ? '편관' : '정관';
  return same ? '편인' : '정인';
}

const PERSONA_RULES = `당신은 사주명리 웹앱 '사주아이'의 해석가입니다.
페르소나: 복을 부르는 하얀 고양이 마네키네코. 따뜻하고 다정한 존댓말로 정성껏 말하지만, 내용은 진지한 정통 명리학 해석입니다.

반드시 지킬 규칙:
- 제공된 명식 데이터(간지, 일간, 오행 분포, 십성 — '올해의 세운'이 함께 주어지면 그것까지)에 있는 사실만 근거로 해석합니다. 그 밖의 대운·신살·지장간·12운성은 데이터에 없으므로 언급하지 않습니다.
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
- 출력은 첫 절 제목("### ")으로 바로 시작합니다. 절 제목 앞에 인사말·서문을 쓰지 않습니다.`;

// ── 테마별 풀이 주제표 (api/interpret.mjs와 동일 데이터) ──
// 브라우저는 topic 이름만 보내고, 주제별 지시문은 전부 서버가 갖는다.
const SUMMARY_RULE =
  '첫 절의 본문 첫 줄은 반드시 "**키워드**: #키워드 #키워드 #키워드" 형태로 이 주제의 핵심 키워드 3개를 적고, 그다음 줄부터 요약을 씁니다.';

const TOPICS = {
  overall: {
    label: '전체 풀이',
    format: `출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 10절):
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
  wealth: {
    label: '재물운',
    format: `이번 요청은 '재물운' 한 주제만 깊이 파는 테마 풀이입니다.
재성(편재·정재)의 유무와 위치, 식상이 재를 낳는 흐름(식상생재), 비겁이 재를 나누는 구조 등
재물과 관련된 명리 구조를 중심으로, 전체 풀이보다 한 걸음 더 깊게 해석합니다.
${SUMMARY_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 명식의 재물 그릇을 은유 한 문장으로)
### (타고난 재물 그릇 — 재성의 모양과 자리)
### (돈이 들어오는 길 — 버는 방식과 재능)
### (돈이 새기 쉬운 곳 — 조심할 습관)
### (마네키네코의 재물 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어. 재물 '액수'나 '시기'는 절대 단정하지 않습니다.`,
  },
  love: {
    label: '연애·결혼운',
    format: `이번 요청은 '연애·결혼운' 한 주제만 깊이 파는 테마 풀이입니다.
일지(배우자 자리)의 간지, 성별에 따른 배우자 별(남성은 재성, 여성은 관성)의 유무와 위치,
식상(표현·애정 표현)의 모양을 중심으로, 전체 풀이보다 한 걸음 더 깊게 해석합니다.
${SUMMARY_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 명식의 사랑의 결을 은유 한 문장으로)
### (사랑할 때의 나 — 애정 표현 방식)
### (배우자 자리의 풍경 — 일지가 말하는 것)
### (관계에서 반복되기 쉬운 것 — 빛과 그림자)
### (마네키네코의 연애 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어. 결혼 '시기'나 상대의 '조건'은 절대 단정하지 않습니다.`,
  },
  career: {
    label: '일·직업운',
    format: `이번 요청은 '일과 직업운' 한 주제만 깊이 파는 테마 풀이입니다.
관성(조직·직장), 식상(재능·표현), 인성(공부·자격), 비겁(독립심·동업)의 구성을 중심으로
어울리는 일의 결, 일하는 방식, 조직 생활과 독립의 적성을 전체 풀이보다 한 걸음 더 깊게 해석합니다.
${SUMMARY_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 명식의 일하는 모습을 은유 한 문장으로)
### (타고난 일머리 — 재능의 결)
### (어울리는 일터의 모양 — 조직과 독립 사이)
### (일에서 걸려 넘어지기 쉬운 돌부리)
### (마네키네코의 커리어 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어. 특정 직업을 '해야 한다'고 단정하지 말고, 일의 '결'과 '방식'으로 이야기합니다.`,
  },
  health: {
    label: '건강·생활 리듬',
    format: `이번 요청은 '건강과 생활 리듬' 한 주제만 깊이 파는 테마 풀이입니다.
오행 분포의 치우침(넘치는 기운, 부족한 기운)을 중심으로 전통 오행 양생(養生) 상식 수준의
생활 리듬 처방을 전체 풀이보다 한 걸음 더 깊게 풀어 줍니다.
추가로 반드시 지킬 것: 질병 진단·의학적 조언은 하지 않습니다. 병명·장기 이름을 단정적으로 연결하지 않습니다.
"~한 기운이 치우쳐 있으니 ~한 생활을 해 보세요" 수준의 부드러운 생활 제안만 합니다.
${SUMMARY_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 명식의 기운 균형을 은유 한 문장으로)
### (기운의 저울 — 넘치는 것과 모자란 것)
### (넘치는 기운 다스리기)
### (모자란 기운 채우기 — 색·계절·시간대·활동)
### (마네키네코의 하루 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어.`,
  },
  people: {
    label: '인간관계운',
    format: `이번 요청은 '인간관계운' 한 주제만 깊이 파는 테마 풀이입니다.
비겁(동료·형제), 식상(표현), 관성(예의·규율), 인성(받아들임)의 구성과 궁위(연주=윗사람·뿌리,
월주=부모·사회생활의 문)를 중심으로 사람 사이에서의 나를 전체 풀이보다 한 걸음 더 깊게 해석합니다.
${SUMMARY_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 사람들 속 이 명식의 자리를 은유 한 문장으로)
### (사람을 대하는 기본 자세)
### (나와 결이 맞는 사람, 나를 힘들게 하는 관계)
### (관계에서 반복되기 쉬운 패턴)
### (마네키네코의 관계 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어.`,
  },
  study: {
    label: '학업·시험운',
    format: `이번 요청은 '학업·시험운' 한 주제만 깊이 파는 테마 풀이입니다.
인성(공부·받아들이는 힘), 식상(응용·표현하는 힘), 관성(시험·평가를 견디는 힘)의 구성을 중심으로
배우는 방식과 실력이 붙는 공부법을 전체 풀이보다 한 걸음 더 깊게 해석합니다.
추가로 반드시 지킬 것: 합격·불합격을 단정하지 않습니다. 공부의 '결'과 '방식'으로만 이야기합니다.
${SUMMARY_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 이 명식의 공부 그릇을 은유 한 문장으로)
### (타고난 공부 머리 — 배우는 방식의 결)
### (실력이 붙는 공부법)
### (시험장에서의 나 — 집중과 긴장 사이)
### (마네키네코의 공부 처방 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어.`,
  },
  newyear: {
    label: '올해의 운세',
    format: `이번 요청은 '올해의 운세(세운)' 한 주제만 깊이 파는 테마 풀이입니다.
데이터로 제공된 '올해의 세운' 간지가 나의 일간·명식 구조와 어떤 관계(십성)로 만나는지를 중심으로,
올해 힘이 실리는 영역과 조심스럽게 다룰 영역을 해석합니다.
추가로 반드시 지킬 것: 특정 월·날짜의 사건을 단정하지 않습니다. 올해 전체의 '기류'와 '경향'으로만 이야기합니다.
${SUMMARY_RULE}
출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작, 총 5절):
### (한 줄 요약 — 올해의 기운과 나의 만남을 은유 한 문장으로)
### (올해의 기운이 나에게 들어오는 모양 — 세운과 일간의 관계)
### (올해 힘이 실리는 영역)
### (올해 한 템포 쉬어 갈 영역)
### (마네키네코의 올해 당부 — 실천 조언)
각 절 3~6문장, 전체 1400~2000자의 한국어.`,
  },
};

// ── 올해의 세운 간지 계산 (입춘 전이면 지난해 간지, 날짜 단위 근사) ──
const STEM_LIST = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const BRANCH_LIST = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

function currentSeun(now = new Date()) {
  const kst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60 * 1000);
  let year = kst.getFullYear();
  const month = kst.getMonth() + 1;
  if (month === 1 || (month === 2 && kst.getDate() < 4)) year -= 1;
  return {
    year,
    stemHanja: STEM_LIST[(((year - 4) % 10) + 10) % 10],
    branchHanja: BRANCH_LIST[(((year - 4) % 12) + 12) % 12],
  };
}

function buildPrompt(payload) {
  // 주제는 화이트리스트에 있는 것만 허용 (없으면 전체 풀이)
  const topicKey = payload?.topic ?? 'overall';
  const topic = TOPICS[topicKey];
  if (!topic) return null;

  const NAMES = { year: '연주', month: '월주', day: '일주', hour: '시주' };
  const pillars = payload?.pillars ?? {};
  const dayStem = typeof pillars.day === 'string' ? pillars.day[0] : null;
  if (!dayStem || !STEMS[dayStem]) return null;

  const lines = [];
  const counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  let chars = 0;
  for (const key of ['year', 'month', 'day', 'hour']) {
    const pair = pillars[key];
    if (key === 'hour' && !pair) continue;
    if (typeof pair !== 'string' || [...pair].length !== 2) return null;
    const [s, b] = [...pair];
    if (!STEMS[s] || !BRANCHES[b]) return null;
    const [sKo, sEl, sYang] = STEMS[s];
    const [bKo, bEl, bMain] = BRANCHES[b];
    counts[sEl] += 1; counts[bEl] += 1; chars += 2;
    lines.push(
      `- ${NAMES[key]}: ${pair} (${sKo}${bKo}) — 천간 ${sKo}(${sEl}, ${sYang ? '양' : '음'})` +
      `[${key === 'day' ? '일간(나)' : tenGod(dayStem, s)}], 지지 ${bKo}(${bEl})[${tenGod(dayStem, bMain)}]`
    );
  }
  // '올해의 운세' 주제면 세운 간지를 서버가 계산해 데이터에 추가한다
  const seunLines = [];
  if (topicKey === 'newyear') {
    const seun = currentSeun();
    const [sKo, sEl, sYang] = STEMS[seun.stemHanja];
    const [bKo, bEl, bMain] = BRANCHES[seun.branchHanja];
    seunLines.push(
      `- 올해의 세운: ${seun.year}년 ${seun.stemHanja}${seun.branchHanja} (${sKo}${bKo}) — ` +
      `천간 ${sKo}(${sEl}, ${sYang ? '양' : '음'})[나에게 ${tenGod(dayStem, seun.stemHanja)}], ` +
      `지지 ${bKo}(${bEl})[나에게 ${tenGod(dayStem, bMain)}]`
    );
  }

  const [meKo, meEl, meYang] = STEMS[dayStem];
  const prompt = [
    `다음 명식을 '${topic.label}' 주제로 해석해 주세요.`,
    ...lines,
    ...seunLines,
    `- 일간(나): ${dayStem} ${meKo}${meEl} (${meYang ? '양' : '음'})`,
    `- 오행 분포 (총 ${chars}자): 목 ${counts.목} · 화 ${counts.화} · 토 ${counts.토} · 금 ${counts.금} · 수 ${counts.수}`,
    `- 성별: ${payload.gender === 'male' ? '남성' : '여성'}`,
    !pillars.hour ? '- 태어난 시간을 몰라 시주 없이 세 기둥으로 본 명식입니다.' : '',
  ].filter(Boolean).join('\n');

  // 시스템 프롬프트 = 공통 페르소나·규칙 + 이 주제의 출력 형식
  return { system: `${PERSONA_RULES}\n\n${topic.format}`, prompt };
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(404).json({ error: '사주아이 해석 프록시입니다.' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'API 키 미설정' });

  const built = buildPrompt(req.body ?? {});
  if (!built) return res.status(400).json({ error: '명식 데이터가 올바르지 않아요.' });

  // 무료 한도는 모델별 하루치 — 주 모델이 한도(429)면 예비 모델로 넘어간다
  const primary = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const models = [...new Set([primary, 'gemini-2.0-flash', 'gemini-2.5-flash-lite'])];

  let apiRes;
  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      apiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: built.system }] },
            contents: [{ role: 'user', parts: [{ text: built.prompt }] }],
            generationConfig: { maxOutputTokens: 8192, temperature: 0.8 },
          }),
        }
      );
      if (apiRes.status !== 503 && apiRes.status !== 500) break;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    if (apiRes.status !== 429) break;
  }

  if (!apiRes.ok) {
    console.error('Gemini 오류', apiRes.status, (await apiRes.text()).slice(0, 300));
    if (apiRes.status === 429) {
      return res.status(429).json({ error: '오늘의 무료 풀이 한도를 모두 썼어요. 내일 다시 만나요 🐾' });
    }
    return res.status(502).json({ error: '해석 서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
  }
  const data = await apiRes.json();
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!text) return res.status(502).json({ error: '해석 생성에 실패했어요. 잠시 후 다시 시도해 주세요.' });
  return res.status(200).json({ interpretation: text });
}
