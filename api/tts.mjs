// ============================================================
// api/tts.mjs — 풀이 읽어주기용 음성 합성 프록시 (서버 전용)
//
// Gemini의 TTS(글 → 목소리) 모델을 사용한다. 해석과 같은 키를 쓴다.
// 구글이 주는 소리는 "날 것의 파형(PCM)"이라 브라우저가 바로 못 트니,
// WAV 파일 형식으로 포장해서 보내준다.
// ============================================================

// PCM(날 것의 소리 데이터)에 44바이트 WAV 머리표를 붙인다
function pcmToWav(pcm, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const buf = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buf);
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM 형식
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, (numChannels * bitsPerSample) / 8, true);
  view.setUint16(34, bitsPerSample, true);
  writeText(36, 'data');
  view.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

// Gemini TTS 호출 — 성공하면 WAV 바이트, 실패하면 예외
export async function geminiTts(text, apiKey, model = 'gemini-2.5-flash-preview-tts') {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                // 앞부분의 지시문은 목소리 톤을 정해 준다 (읽히지 않음)
                text: '다정하고 차분한 목소리로, 사주 풀이를 들려주듯 또박또박 읽어주세요:\n\n' + text,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      }),
    }
  );
  if (!res.ok) {
    const err = new Error(`TTS ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error('TTS 응답에 소리가 없음');
  // mimeType 예: "audio/L16;codec=pcm;rate=24000" → 샘플레이트를 읽어낸다
  const rate = Number(part.inlineData.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
  const pcm = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
  return pcmToWav(pcm, rate);
}

// ── HTTP 요청 처리 (serve.mjs가 POST /api/tts 에서 호출) ──────
export async function handleTts(req, res) {
  const replyJson = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };

  if (!process.env.GEMINI_API_KEY) {
    return replyJson(503, { error: 'TTS에는 GEMINI_API_KEY가 필요해요.' });
  }

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 40_000) return replyJson(413, { error: '글이 너무 길어요.' });
  }

  let text;
  try {
    text = String(JSON.parse(raw).text ?? '').trim().slice(0, 3500);
  } catch {
    text = '';
  }
  if (!text) return replyJson(400, { error: '읽을 글이 없어요.' });

  try {
    const wav = await geminiTts(text, process.env.GEMINI_API_KEY);
    res.writeHead(200, { 'Content-Type': 'audio/wav' });
    res.end(Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength));
  } catch (err) {
    console.error('TTS 프록시 오류:', err.message);
    // 브라우저가 이걸 받으면 기기 내장 음성으로 조용히 갈아탄다
    return replyJson(err.status === 429 ? 429 : 502, { error: 'TTS 실패 — 기기 음성으로 대체' });
  }
}
