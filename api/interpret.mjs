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

// ── 마네키네코 해석가의 성격과 규칙 (시스템 프롬프트) ──────────
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

// ── 브라우저가 보낸 명식을 검증하고 프롬프트 재료로 변환 ──────
// 허용된 간지 한자만 통과시킨다. (표에 없는 글자 = 거부)
function buildPrompt(payload) {
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

  return [
    '다음 명식을 해석해 주세요.',
    ...lines,
    `- 일간(나): ${dayStem} ${me.ko}${me.element} (${me.yang ? '양' : '음'})`,
    `- 오행 분포 (총 ${chars}자): 목 ${counts.목} · 화 ${counts.화} · 토 ${counts.토} · 금 ${counts.금} · 수 ${counts.수}`,
    `- 성별: ${gender}`,
    unknownTime ? '- 태어난 시간을 몰라 시주 없이 세 기둥으로 본 명식입니다.' : '',
  ].filter(Boolean).join('\n');
}

// ── AI 부르기 ① Gemini (무료 시작용) ──────────────────────────
// Google AI Studio에서 무료 발급한 키를 .env의 GEMINI_API_KEY에 넣으면 사용된다.
async function callGemini(prompt) {
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

  // 구글 서버가 잠깐 바쁠 때(503)가 종종 있어서 최대 3번까지 시도한다
  let res;
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
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
        }),
      }
    );
    if (res.status !== 503 && res.status !== 500) break; // 과부하가 아니면 그대로 진행
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }

  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}`);
    if (res.status === 400 || res.status === 401 || res.status === 403) err.code = 'BAD_KEY';
    if (res.status === 429) err.code = 'RATE_LIMIT'; // 무료 한도 초과
    throw err;
  }
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

// ── AI 부르기 ② 클로드 (품질 우선 옵션) ───────────────────────
async function callClaude(prompt) {
  const client = new Anthropic(); // 키는 환경변수에서 자동으로 읽는다
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 3000,
    thinking: { type: 'adaptive' }, // 해석 전에 스스로 생각할 여유를 준다
    system: SYSTEM_PROMPT,
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

  let prompt;
  try {
    prompt = buildPrompt(JSON.parse(raw));
  } catch {
    prompt = null;
  }
  if (!prompt) return reply(400, { error: '명식 데이터가 올바르지 않아요.' });

  try {
    // Gemini 키가 있으면 Gemini(무료), 아니면 클로드를 쓴다
    const text = process.env.GEMINI_API_KEY
      ? await callGemini(prompt)
      : await callClaude(prompt);
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
    console.error('해석 프록시 오류:', err.message);
    return reply(502, { error: '해석 서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
  }
}
