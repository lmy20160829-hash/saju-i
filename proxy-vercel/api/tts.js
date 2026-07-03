// ============================================================
// proxy-vercel/api/tts.js — 풀이 읽어주기(음성 합성) 프록시
// Gemini TTS 모델로 글을 자연스러운 목소리(WAV)로 바꿔준다.
// ============================================================

const ALLOWED_ORIGIN = 'https://lmy20160829-hash.github.io';

// PCM(날 것의 소리)에 44바이트 WAV 머리표를 붙인다
function pcmToWav(pcm, sampleRate) {
  const byteRate = (sampleRate * 16) / 8; // 모노 16비트
  const buf = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, byteRate, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return Buffer.from(buf);
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(404).json({ error: 'TTS 프록시입니다.' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'API 키 미설정' });

  const text = String(req.body?.text ?? '').trim().slice(0, 3500);
  if (!text) return res.status(400).json({ error: '읽을 글이 없어요.' });

  const model = process.env.GEMINI_TTS_MODEL ?? 'gemini-2.5-flash-preview-tts';
  const apiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: '다정하고 차분한 목소리로, 사주 풀이를 들려주듯 또박또박 읽어주세요:\n\n' + text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      }),
    }
  );
  if (!apiRes.ok) {
    console.error('TTS 오류', apiRes.status, (await apiRes.text()).slice(0, 250));
    return res
      .status(apiRes.status === 429 ? 429 : 502)
      .json({ error: 'TTS 실패 — 기기 음성으로 대체' });
  }
  const data = await apiRes.json();
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) return res.status(502).json({ error: 'TTS 실패 — 기기 음성으로 대체' });

  const rate = Number(part.inlineData.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
  const pcm = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
  res.setHeader('Content-Type', 'audio/wav');
  return res.status(200).send(pcmToWav(pcm, rate));
}
