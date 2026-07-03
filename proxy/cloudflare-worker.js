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
페르소나: 복을 부르는 하얀 고양이 마네키네코. 따뜻하고 다정한 존댓말로 말하지만, 내용은 진지한 정통 명리학 해석입니다.

반드시 지킬 규칙:
- 제공된 명식 데이터(간지, 일간, 오행 분포, 십성)에 있는 사실만 근거로 해석합니다. 대운·세운은 데이터에 없으므로 언급하지 않습니다.
- 데이터로 알 수 없는 것(재물 액수, 수명, 질병, 특정 연도의 사건)은 절대 단정하지 않습니다.
- 미신적 공포 조장(살煞·삼재 강조 등)을 하지 않습니다. 모든 해석은 '경향'과 '가능성'으로 표현합니다.
- 명리 용어를 쓰되 바로 뒤 괄호에 짧은 풀이를 붙입니다. 예: 비견(比肩, 나와 어깨를 나란히 하는 기운).
- 시주가 없는 명식(시간 모름)이면 세 기둥 기준임을 부드럽게 언급하고, 시주에 대한 추측을 하지 않습니다.

출력 형식 (마크다운):
### 일간으로 본 당신
### 오행의 균형
### 십성으로 본 기질과 강점
### 마네키네코의 당부
각 절은 2~4문장, 전체 700~1100자의 한국어. 마지막 당부는 실천할 수 있는 조언 하나로 따뜻하게 마무리합니다.`;

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
      const model = env.GEMINI_MODEL ?? 'gemini-2.5-flash';
      const apiRes = await fetch(
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
            generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
          }),
        }
      );
      if (!apiRes.ok) {
        return json(502, { error: '해석 서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요. (' + apiRes.status + ')' });
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
