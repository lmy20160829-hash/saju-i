// ============================================================
// interpret-render.js — 받은 풀이 글을 HTML로 바꾸는 순수 함수들
//
// AI가 보낸 마크다운은 이렇게 생겼다:
//   [키워드] #차분함 #장인정신 #늦게피는꽃     ← 요약 헤더 세 줄
//   [지수] 총운=78; 재물=65; 연애=72
//   [행운] 색=초록; 숫자=3; 방위=동쪽; 아이템=작은 화분
//   ### 첫 절 제목
//   본문 …
//
// 헤더 세 줄은 "키워드 칩 + 기운 지수 게이지 + 행운 아이템 칩"의
// 요약 카드로, 나머지는 접었다 펴는 아코디언으로 그린다.
//
// 이 파일은 DOM을 만지지 않는 순수 함수만 담아서,
// 브라우저(js/interpret.js)와 Node 테스트(test-render.mjs)가 같이 쓴다.
// ============================================================

// 보안을 위해 HTML 특수문자는 무해하게 바꾼다(escape).
export function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// ── 요약 헤더 세 줄을 본문에서 분리해 읽는다 ─────────────────
// AI가 형식을 조금 어겨도(굵게 감싸기, 줄 순서 바꾸기, 일부 누락)
// 화면이 깨지지 않도록 너그럽게 읽고, 못 읽은 항목은 그냥 비운다.
export function splitHeader(markdown) {
  const header = { keywords: [], scores: [], lucky: [] };
  const bodyLines = [];
  let seenSection = false; // 첫 절(###)이 시작되면 헤더 찾기를 멈춘다

  for (const rawLine of String(markdown).split('\n')) {
    // "**[지수] …**" 처럼 굵게 감싸도 표식을 알아본다
    const line = rawLine.trim().replace(/^\*+\s*/, '').replace(/\s*\*+$/, '');
    if (line.startsWith('###')) seenSection = true;

    if (!seenSection && line.startsWith('[키워드]')) {
      header.keywords = [...line.matchAll(/#([^\s#()]+)/g)]
        .map((m) => m[1])
        .slice(0, 5);
    } else if (
      // AI가 표식을 빠뜨리고 "#가 #나 #다"나 "[가] [나] [다]"만 쓸 때의 대비책
      !seenSection &&
      header.keywords.length === 0 &&
      (/^(#[^\s#]+\s*){2,5}$/.test(line) || /^(\[[^\[\]]{1,12}\]\s*){2,5}$/.test(line))
    ) {
      header.keywords = [...line.matchAll(/[#\[]([^\s#\[\]]+)\]?/g)]
        .map((m) => m[1])
        .slice(0, 5);
    } else if (!seenSection && line.startsWith('[지수]')) {
      header.scores = parsePairs(line.slice('[지수]'.length))
        .map(({ label, value }) => {
          const n = Math.round(Number(value));
          if (!Number.isFinite(n)) return null;
          return { name: label, value: Math.min(100, Math.max(0, n)) };
        })
        .filter(Boolean)
        .slice(0, 8); // 연도별 운세는 총운+분야 6개까지 지수가 온다
    } else if (!seenSection && line.startsWith('[행운]')) {
      header.lucky = parsePairs(line.slice('[행운]'.length)).slice(0, 6);
    } else {
      bodyLines.push(rawLine);
    }
  }
  return { header, body: bodyLines.join('\n') };
}

// "색=초록; 숫자=3" 같은 "이름=값" 나열을 [{label, value}]로
// (구분자는 ;와 ,만 — '·'는 "일·직업" 같은 이름 안에 쓰이므로 제외)
function parsePairs(text) {
  return text
    .split(/[;,]/)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq < 0) return null;
      const label = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!label || !value) return null;
      return { label, value };
    })
    .filter(Boolean);
}

// ── 요약 카드 HTML (헤더를 하나도 못 읽었으면 빈 문자열) ──────
export function renderSummaryCard(header) {
  const parts = [];

  if (header.keywords.length > 0) {
    parts.push(
      '<ul class="kw-chips">' +
        header.keywords.map((kw) => `<li>#${escapeHtml(kw)}</li>`).join('') +
        '</ul>'
    );
  }

  if (header.scores.length > 0) {
    parts.push(
      '<div class="scores">' +
        header.scores
          .map(
            ({ name, value }) =>
              `<div class="score-row">` +
              `<span class="score-name">${escapeHtml(name)}</span>` +
              `<span class="score-track"><span class="score-bar" style="width:${value}%"></span></span>` +
              `<span class="score-value">${value}</span>` +
              `</div>`
          )
          .join('') +
        '</div>' +
        '<p class="score-note">지수는 명식 구조의 상대적 경향을 나타내는 참고값이에요.</p>'
    );
  }

  if (header.lucky.length > 0) {
    parts.push(
      '<ul class="lucky-chips">' +
        header.lucky
          .map(
            ({ label, value }) =>
              `<li><span class="lucky-label">${escapeHtml(label)}</span>${escapeHtml(value)}</li>`
          )
          .join('') +
        '</ul>'
    );
  }

  return parts.length > 0 ? `<div class="summary-card">${parts.join('')}</div>` : '';
}

// ── 풀이 전체를 HTML로: 요약 카드 + 절별 아코디언 ─────────────
// "### 제목" 마다 접었다 펼 수 있는 칸(details)으로 만든다.
// 첫 번째 절만 펼쳐 두고, 나머지는 제목을 누르면 펼쳐진다.
export function renderMarkdownLite(markdown) {
  const { header, body } = splitHeader(markdown);

  const lines = escapeHtml(body)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let html = '';
  let openSection = false;
  let isFirst = true;

  for (const line of lines) {
    if (line.startsWith('###')) {
      if (openSection) html += '</div></details>';
      const title = line.replace(/^#+\s*/, '');
      html += `<details${isFirst ? ' open' : ''}><summary>${title}</summary><div class="section-body">`;
      openSection = true;
      isFirst = false;
    } else {
      const withBold = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html += `<p>${withBold}</p>`;
    }
  }
  if (openSection) html += '</div></details>';

  return (
    renderSummaryCard(header) +
    `<p class="accordion-hint">제목을 누르면 풀이가 펼쳐져요 🐾</p>` +
    html
  );
}
