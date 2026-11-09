// 글 상단의 --- 로 감싼 메타데이터를 파싱한다.
// 지원 형식: key: value / key: "따옴표 값" / key: [a, b, c] / true, false

function unquote(value) {
  return /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value;
}

function parseValue(raw) {
  const value = raw.trim();
  if (/^\[.*\]$/.test(value)) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  return unquote(value);
}

export function parseFrontmatter(text) {
  const source = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = source.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!match) return { data: {}, body: source };

  const data = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
    if (kv) data[kv[1]] = parseValue(kv[2]);
  }
  return { data, body: source.slice(match[0].length) };
}
