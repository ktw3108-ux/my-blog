// 마크다운 → HTML 변환기 (외부 의존성 없음)
//
// 지원: 제목, 문단, 굵게/기울임/취소선, 인라인 코드, 코드 블록, 링크, 이미지,
//       순서/비순서 목록(중첩, 체크박스), 인용문, 수평선, 표, 백슬래시 이스케이프
//
// 보안: 원문은 전부 HTML 이스케이프한 뒤 허용된 태그만 생성한다.
//       링크/이미지 주소는 safeUrl()로 검사해 javascript: 등 위험한 스킴을 막는다.

const FENCE_RE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s*>/;
const LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 이미 이스케이프된 주소를 받아 허용된 형태만 돌려준다.
function safeUrl(url) {
  const compact = url.replace(/[\u0000- ]/g, '');
  if (/^(https?:|mailto:)/i.test(compact)) return url;
  // 그 밖의 스킴(javascript:, data:, vbscript: 등)은 모두 차단
  if (/^[a-z][a-z0-9+.-]*:/i.test(compact)) return '#';
  return url;
}

function emphasis(s) {
  return s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?!\w)/g, '$1<em>$2</em>');
}

// 인라인 요소 변환. 처리된 조각은 자리표시자에 보관해 이후 규칙이 건드리지 않게 한다.
export function inline(src) {
  const store = [];
  const keep = (html) => `\u0000${store.push(html) - 1}\u0000`;

  let s = String(src).replace(/\u0000/g, '');

  // 1) 인라인 코드: 내부는 문법을 해석하지 않는다
  s = s.replace(/`([^`\n]+)`/g, (_, code) => keep(`<code>${escapeHtml(code)}</code>`));

  // 2) 백슬래시 이스케이프
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, (_, ch) => keep(escapeHtml(ch)));

  // 3) 나머지 전체 이스케이프
  s = escapeHtml(s);

  // 4) 이미지 ![alt](url "title")
  s = s.replace(
    /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g,
    (_, alt, url, title) =>
      keep(
        `<img src="${safeUrl(url)}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy">`
      )
  );

  // 5) 링크 [text](url "title")
  s = s.replace(
    /\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g,
    (_, label, url, title) => {
      const href = safeUrl(url);
      const external = /^https?:/i.test(href);
      return keep(
        `<a href="${href}"${title ? ` title="${title}"` : ''}` +
          `${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${emphasis(label)}</a>`
      );
    }
  );

  // 6) 자동 링크 <https://...>
  s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, url) =>
    keep(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
  );

  // 7) 강조
  s = emphasis(s);

  // 8) 자리표시자 복원 (중첩될 수 있어 반복)
  const PLACEHOLDER = /\u0000(\d+)\u0000/g;
  while (PLACEHOLDER.test(s)) {
    s = s.replace(PLACEHOLDER, (_, i) => store[Number(i)]);
  }
  return s;
}

function indentWidth(ws) {
  return ws.replace(/\t/g, '    ').length;
}

function slugify(text, ids) {
  const base =
    text
      .toLowerCase()
      .replace(/[`*_~[\]()]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  const count = ids.get(base) || 0;
  ids.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

function isTableStart(lines, i) {
  return (
    lines[i].includes('|') &&
    i + 1 < lines.length &&
    lines[i + 1].includes('|') &&
    TABLE_SEP_RE.test(lines[i + 1])
  );
}

function startsBlock(lines, i) {
  const line = lines[i];
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    QUOTE_RE.test(line) ||
    LIST_RE.test(line) ||
    isTableStart(lines, i)
  );
}

function renderTable(lines, i) {
  const head = splitRow(lines[i]);
  const aligns = splitRow(lines[i + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  });
  i += 2;

  const rows = [];
  while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
    rows.push(splitRow(lines[i]));
    i++;
  }

  const cell = (tag, text, col) => {
    const align = aligns[col] ? ` style="text-align:${aligns[col]}"` : '';
    return `<${tag}${align}>${inline(text || '')}</${tag}>`;
  };

  const thead = `<thead><tr>${head.map((c, col) => cell('th', c, col)).join('')}</tr></thead>`;
  const tbody = rows.length
    ? `<tbody>${rows
        .map((row) => `<tr>${head.map((_, col) => cell('td', row[col], col)).join('')}</tr>`)
        .join('')}</tbody>`
    : '';

  return [`<div class="table-wrap"><table>${thead}${tbody}</table></div>`, i];
}

function renderList(lines, start) {
  const first = lines[start].match(LIST_RE);
  const indent = indentWidth(first[1]);
  const ordered = /\d/.test(first[2]);
  const startNum = ordered ? parseInt(first[2], 10) : 1;
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      // 빈 줄 다음에 같은 목록이 이어지면 계속
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const next = j < lines.length && lines[j].match(LIST_RE);
      if (next && indentWidth(next[1]) >= indent) {
        i = j;
        continue;
      }
      break;
    }

    const m = line.match(LIST_RE);
    if (m) {
      const w = indentWidth(m[1]);
      if (w === indent) {
        if (/\d/.test(m[2]) !== ordered) break;
        items.push({ text: m[3], children: '' });
        i++;
        continue;
      }
      if (w > indent && items.length) {
        const [html, next] = renderList(lines, i);
        items[items.length - 1].children += html;
        i = next;
        continue;
      }
      break;
    }

    // 들여쓴 줄은 직전 항목의 이어지는 내용
    if (/^\s+\S/.test(line) && items.length && !startsBlock(lines, i)) {
      items[items.length - 1].text += `\n${line.trim()}`;
      i++;
      continue;
    }
    break;
  }

  const body = items
    .map(({ text, children }) => {
      const task = text.match(/^\[([ xX])\]\s+([\s\S]*)$/);
      if (task) {
        const checked = task[1] !== ' ' ? ' checked' : '';
        return `<li class="task-item"><input type="checkbox" disabled${checked}> ${inline(task[2])}${children}</li>`;
      }
      return `<li>${inline(text)}${children}</li>`;
    })
    .join('');

  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && startNum !== 1 ? ` start="${startNum}"` : '';
  return [`<${tag}${startAttr}>${body}</${tag}>`, i];
}

function parseBlocks(lines, ctx) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let m;

    if (!line.trim()) {
      i++;
      continue;
    }

    // 코드 블록
    if ((m = line.match(FENCE_RE))) {
      const fence = m[1];
      const lang = m[2];
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        code.push(lines[i]);
        i++;
      }
      i++; // 닫는 펜스
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      out.push(`<pre${langAttr}><code${cls}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    // 제목
    if ((m = line.match(HEADING_RE))) {
      const level = m[1].length;
      const id = slugify(m[2], ctx.ids);
      out.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
      i++;
      continue;
    }

    // 수평선 (목록보다 먼저 검사: "- - -")
    if (HR_RE.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // 인용문
    if (QUOTE_RE.test(line)) {
      const quoted = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*> ?/, ''));
        i++;
      }
      out.push(`<blockquote>${parseBlocks(quoted, ctx)}</blockquote>`);
      continue;
    }

    // 표
    if (isTableStart(lines, i)) {
      const [html, next] = renderTable(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    // 목록
    if (LIST_RE.test(line)) {
      const [html, next] = renderList(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    // 문단
    const para = [lines[i].trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
      // 줄 끝 공백 두 개는 줄바꿈으로 보존
      para.push(lines[i].replace(/^\s+/, ''));
      i++;
    }
    const html = inline(para.join('\n')).replace(/ {2,}\n/g, '<br>\n');
    out.push(`<p>${html}</p>`);
  }

  return out.join('\n');
}

export function markdownToHtml(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  return parseBlocks(lines, { ids: new Map() });
}
