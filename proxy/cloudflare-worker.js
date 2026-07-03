// ============================================================
// cloudflare-worker.js — 배포용 AI 해석 프록시 (선택 사항)
//
// GitHub Pages는 "파일만 보여주는 서버"라서 API 키를 숨길 곳이 없다.
// 그래서 해석 요청만 받아주는 작은 무료 서버(Cloudflare Worker)를
// 하나 두고, 키는 그 서버의 비밀 설정에만 저장한다.
//
// 배포 방법 (약 10분, 무료):
//   1. cloudflare.com 가입 → Workers & Pages → Create Worker
//   2. 이 파일 내용을 통째로 붙여넣고 Deploy
//   3. Worker 설정 → Variables → Secrets 에 둘 중 하나 추가:
//        GEMINI_API_KEY = (무료 Gemini 키 — aistudio.google.com/apikey)
//        ANTHROPIC_API_KEY = (클로드 키 — 품질 우선 옵션)
//   4. 아래 ALLOWED_ORIGIN 을 내 사이트 주소로 수정
//   5. js/config.js 의 INTERPRET_ENDPOINT 를
//        'https://<워커이름>.<계정>.workers.dev/api/interpret' 로 수정
//
// ※ 무료 요금제는 하루 10만 요청까지. 개인 프로젝트엔 충분하다.
// ============================================================

// 해석 요청을 허용할 사이트 주소 (내 GitHub Pages 주소)
const ALLOWED_ORIGIN = 'https://lmy20160829-hash.github.io';

// 간지 검증용 미니 표 — api/interpret.mjs 와 같은 데이터의 요약본
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

const SYSTEM_PROMPT = `당신은 사주명리 웹앱 '사주아이'의 해석가입니다.
페르소나: 복을 부르는 하얀 고양이 마네키네코. 따뜻하고 다정한 존댓말로 정성껏 말하지만, 내용은 진지한 정통 명리학 해석입니다.

반드시 지킬 규칙:
- 제공된 명식 데이터(간지, 일간, 오행 분포, 십성)에 있는 사실만 근거로 해석합니다. 대운·세운·신살·지장간·12운성은 데이터에 없으므로 언급하지 않습니다.
- 개수와 숫자는 제공된 값을 그대로 인용하고, 직접 다시 세지 않습니다.
- 데이터로 알 수 없는 것(재물 액수, 수명, 질병, 특정 연도의 사건)은 절대 단정하지 않습니다.
- 미신적 공포 조장을 하지 않습니다. 모든 해석은 '경향'과 '가능성'으로 표현합니다.
- 명리 용어를 쓰되 처음 나올 때 괄호에 짧은 풀이를 붙입니다. 예: 편관(偏官, 나를 단련시키는 기운).
- 시주가 없는 명식(시간 모름)이면 세 기둥 기준임을 부드럽게 언급하고, 시주에 대한 추측을 하지 않습니다.

풀이 스타일 — 글의 힘이 생명입니다:
- 각 절의 제목은 이 명식만의 형상을 은유로 담아, 읽는 이에게 말을 거는 한 문장으로 짓습니다.
  (좋은 예: "호랑이 셋이 지키는 큰 산인데, 왜 혼자 다 짊어지려 하세요" — 제공된 간지의 물상을 활용해 매번 새로 짓기)
- 각 절 본문의 흐름: ① 간지의 물상(자연물 은유)으로 생생하게 그리기 → ② 십성·오행 구조라는 명리 근거 밝히기 → ③ 현실 삶의 모습으로 번역해 공감하기 → ④ 부드러운 조언 한 스푼.
- 일간의 강약(주변 오행이 나를 돕는지 억누르는지)을 근거와 함께 짚어 주면 좋습니다.
- 부족한 오행은 전통 오행 상식 수준의 생활 처방(어울리는 색, 활동, 계절·시간대 등)을 "~해 보세요" 정도로 부드럽게 제안합니다.
- 뻔한 덕담 대신, 이 명식이라서 나오는 구체적인 이야기를 씁니다.

출력 형식 (마크다운, 절 제목은 반드시 "### "로 시작):
### (총평 — 명식 전체의 형상을 담은 은유 제목)
### (일간과 타고난 성품)
### (오행의 균형과 생활 처방)
### (십성으로 본 일과 재능)
### (재물을 대하는 태도)
### (사람과 마음 — 관계의 경향)
### (마네키네코의 당부)
각 절 3~5문장, 전체 1800~2600자의 한국어. 마지막 당부는 앞의 풀이를 한 문장으로 안아 주고, 실천할 수 있는 조언 하나로 따뜻하게 마무리합니다.`;

function buildPrompt(payload) {
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
  const [meKo, meEl, meYang] = STEMS[dayStem];
  return [
    '다음 명식을 해석해 주세요.',
    ...lines,
    `- 일간(나): ${dayStem} ${meKo}${meEl} (${meYang ? '양' : '음'})`,
    `- 오행 분포 (총 ${chars}자): 목 ${counts.목} · 화 ${counts.화} · 토 ${counts.토} · 금 ${counts.금} · 수 ${counts.수}`,
    `- 성별: ${payload.gender === 'male' ? '남성' : '여성'}`,
    !pillars.hour ? '- 태어난 시간을 몰라 시주 없이 세 기둥으로 본 명식입니다.' : '',
  ].filter(Boolean).join('\n');
}

// CORS: 우리 사이트에서 온 요청만 허용
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/interpret') {
      return new Response('사주아이 해석 프록시입니다.', { status: 404, headers: corsHeaders() });
    }

    const json = (status, obj) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
      });

    let prompt = null;
    try {
      prompt = buildPrompt(await request.json());
    } catch {}
    if (!prompt) return json(400, { error: '명식 데이터가 올바르지 않아요.' });

    // AI 호출 — 키는 Worker의 Secret(env)에만 존재한다
    // GEMINI_API_KEY가 있으면 Gemini(무료), 없으면 ANTHROPIC_API_KEY로 클로드
    let text = '';
    if (env.GEMINI_API_KEY) {
      // 무료 한도는 모델별 하루치가 따로 있어서,
      // 주 모델이 한도(429)에 닿으면 예비 모델로 한 번 더 시도한다
      const primary = env.GEMINI_MODEL ?? 'gemini-2.5-flash';
      const models = [...new Set([primary, 'gemini-2.0-flash', 'gemini-2.5-flash-lite'])];
      let apiRes;
      for (const model of models) {
        // 구글 서버가 잠깐 바쁠 때(503)가 있어 모델당 최대 3번 시도한다
        for (let attempt = 1; attempt <= 3; attempt++) {
          apiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-goog-api-key': env.GEMINI_API_KEY,
              },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
        // 원인 파악을 위해 구글의 에러 메시지를 로그에 남긴다 (wrangler tail로 확인)
        const errBody = await apiRes.text();
        console.log('Gemini 오류', apiRes.status, errBody.slice(0, 300));
        const friendly = apiRes.status === 429
          ? '오늘의 무료 풀이 한도를 모두 썼어요. 내일 다시 만나요 🐾'
          : '해석 서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요. (' + apiRes.status + ')';
        return json(apiRes.status === 429 ? 429 : 502, { error: friendly });
      }
      const data = await apiRes.json();
      text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? '')
        .join('')
        .trim();
    } else {
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 3000,
          thinking: { type: 'adaptive' },
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!apiRes.ok) {
        return json(502, { error: '해석 서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
      }
      const data = await apiRes.json();
      text = (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    }
    return json(200, { interpretation: text });
  },
};
