// Obsidian 보관함의 글을 블로그(posts/)로 올리는 스크립트 (Node 내장 모듈만 사용)
//
// 사용법
//   node publish.js                 published 가 체크되지 않은 글을 모두 올린다
//   node publish.js "글 제목"        지정한 노트만 올린다 (파일명, .md 생략 가능)
//   node publish.js --dry-run       실제로 바꾸지 않고 무엇을 할지 보여준다
//   옵션: --vault <폴더>  --blog <폴더>
//
// 올리는 대상: 프런트매터에 published 속성이 있고 체크되지 않은 노트 (draft: true 는 제외)
// 올린 뒤에는 노트의 published 를 true(체크)로 바꾼다.
// 다시 올리고 싶으면 Obsidian에서 체크를 해제하고 다시 실행하면 같은 글이 갱신된다.

import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_VAULT = 'C:\\Users\\ktw31\\Documents\\Obsidian Vault\\블로그';
const DEFAULT_BLOG = resolve(fileURLToPath(new URL('.', import.meta.url)));

// ---------------------------------------------------------------------------
// 인자
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { dryRun: false, vault: process.env.OBSIDIAN_BLOG_DIR || DEFAULT_VAULT, blog: DEFAULT_BLOG, only: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--vault') opts.vault = argv[++i];
    else if (arg === '--blog') opts.blog = argv[++i];
    else opts.only.push(arg.replace(/\.md$/i, ''));
  }
  return opts;
}

// ---------------------------------------------------------------------------
// 프런트매터 (Obsidian이 쓰는 YAML 중 필요한 부분만)
// ---------------------------------------------------------------------------

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquote(value) {
  return /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value;
}

function parseValue(raw) {
  const value = raw.trim();
  if (/^\[.*\]$/.test(value)) {
    return value.slice(1, -1).split(',').map((v) => unquote(v.trim())).filter(Boolean);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  return unquote(value);
}

function parseNote(text) {
  const source = text.replace(/^\uFEFF/, '');
  const match = source.match(FM_RE);
  if (!match) return null;

  const data = {};
  let lastKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/); // 목록형 값 (tags:\n  - a)
    if (item && lastKey) {
      if (!Array.isArray(data[lastKey])) data[lastKey] = [];
      data[lastKey].push(unquote(item[1].trim()));
      continue;
    }
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (kv) {
      lastKey = kv[1];
      data[lastKey] = parseValue(kv[2]);
    }
  }
  return { data, body: source.slice(match[0].length) };
}

// 노트 원문의 published 값만 true로 바꾼다 (나머지 내용은 그대로)
function markPublished(text) {
  return text.replace(FM_RE, (block) => {
    if (/^published\s*:.*$/m.test(block)) {
      return block.replace(/^published\s*:.*$/m, 'published: true');
    }
    return block.replace(/(\r?\n)---([ \t]*(?:\r?\n|$))$/, '$1published: true$1---$2');
  });
}

// ---------------------------------------------------------------------------
// 변환
// ---------------------------------------------------------------------------

function toSlug(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'post'
  );
}

const toList = (v) => (Array.isArray(v) ? v : v ? [String(v)] : []);

// [[노트]] / [[노트|별칭]] / [[노트#제목]] → 블로그 링크 또는 일반 글자
// 코드 블록과 인라인 코드 안은 건드리지 않는다
function convertWikiLinks(body, slugByNote, warnings) {
  return body
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(/(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, embed, target, _heading, alias) => {
        const name = target.trim();
        const label = (alias || name).trim();
        if (embed) {
          warnings.push(`첨부/임베드 ![[${name}]] 는 블로그에서 지원하지 않아 글자로 바꿨습니다.`);
          return label;
        }
        const slug = slugByNote.get(name);
        if (slug) return `[${label}](#/post/${encodeURIComponent(slug)})`;
        warnings.push(`[[${name}]] 는 블로그에 없는 글이라 링크 없이 글자로 바꿨습니다.`);
        return label;
      });
    })
    .join('');
}

function buildPost(note, slugByNote, warnings) {
  const { data, body } = note.parsed;
  const tags = toList(data.tags).map((t) => String(t).replace(/^#/, '')).filter(Boolean);
  const lines = [
    '---',
    `title: ${data.title || note.name}`,
    data.date && `date: ${data.date}`,
    tags.length && `tags: [${tags.join(', ')}]`,
    data.description && `description: ${data.description}`,
    `source: obsidian/${note.name}`,
    '---',
  ].filter(Boolean);
  return `${lines.join('\n')}\n${convertWikiLinks(body.replace(/\r\n?/g, '\n'), slugByNote, warnings)}`;
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const postsDir = join(opts.blog, 'posts');
  const indexPath = join(postsDir, 'index.json');

  // 1) 보관함의 노트 읽기
  const files = (await readdir(opts.vault)).filter((f) => f.toLowerCase().endsWith('.md'));
  const notes = [];
  for (const file of files) {
    const path = join(opts.vault, file);
    const text = await readFile(path, 'utf8');
    const parsed = parseNote(text);
    if (!parsed || !('published' in parsed.data)) continue; // published 속성이 없는 노트는 대상 아님
    const name = basename(file, '.md');
    notes.push({ name, path, text, parsed, slug: parsed.data.slug ? toSlug(String(parsed.data.slug)) : toSlug(name) });
  }

  const unknown = opts.only.filter((n) => !notes.some((note) => note.name === n));
  if (unknown.length) {
    console.error(`published 속성이 있는 노트를 찾지 못했습니다: ${unknown.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const targets = notes.filter(
    (n) =>
      n.parsed.data.published !== true &&
      n.parsed.data.draft !== true &&
      (!opts.only.length || opts.only.includes(n.name))
  );

  if (!targets.length) {
    console.log('올릴 글이 없습니다. (published 가 체크되지 않은 노트가 없음)');
    return;
  }

  // 2) 링크 대상: 이미 올라간 글 + 이번에 올릴 글
  const slugByNote = new Map(
    notes.filter((n) => n.parsed.data.published === true || targets.includes(n)).map((n) => [n.name, n.slug])
  );

  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const done = [];

  for (const note of targets) {
    const fileName = `${note.slug}.md`;
    const postPath = join(postsDir, fileName);

    // 다른 글을 덮어쓰지 않도록, 같은 노트에서 올린 파일만 갱신한다
    if (await exists(postPath)) {
      const current = await readFile(postPath, 'utf8');
      if (!current.includes(`\nsource: obsidian/${note.name}\n`)) {
        console.warn(`건너뜀: posts/${fileName} 이 이미 있습니다 (다른 글). 노트에 slug 속성을 넣어 이름을 바꿔 주세요. → ${note.name}`);
        continue;
      }
    }

    const warnings = [];
    const post = buildPost(note, slugByNote, warnings);
    const updated = index.includes(fileName);

    if (!opts.dryRun) {
      await writeFile(postPath, post, 'utf8');
      if (!updated) index.unshift(fileName);
      await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
      await writeFile(note.path, markPublished(note.text), 'utf8');
    }

    done.push(note.name);
    console.log(`${opts.dryRun ? '[미리보기] ' : ''}${updated ? '갱신' : '업로드'}: ${note.name} → posts/${fileName}`);
    warnings.forEach((w) => console.log(`  - ${w}`));
  }

  console.log(
    opts.dryRun
      ? `\n미리보기 끝: ${done.length}개 글을 올릴 수 있습니다. 실제로 올리려면 --dry-run 없이 실행하세요.`
      : `\n완료: ${done.length}개 글을 올리고 Obsidian에서 published 를 체크했습니다.`
  );
}

main().catch((error) => {
  console.error('업로드 실패:', error.message);
  process.exitCode = 1;
});
