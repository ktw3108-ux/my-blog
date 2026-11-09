// 진입점: 글 불러오기, 해시 라우팅, 화면 렌더링
//
// 라우트
//   #/              글 목록
//   #/post/<slug>   글 상세
//   #/tag/<tag>     태그별 목록

import { parseFrontmatter } from './frontmatter.js';
import { markdownToHtml } from './markdown.js';
import { initThemeToggle } from './theme.js';

const SITE_TITLE = '나의 블로그';
const SITE_DESCRIPTION = '배운 것과 생각한 것을 마크다운으로 기록합니다.';
const CHARS_PER_MINUTE = 500; // 한국어 기준 대략적인 읽기 속도

const main = document.querySelector('.site-main');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let postsPromise = null;

// ---------------------------------------------------------------------------
// DOM 헬퍼: 사용자 데이터는 textContent로만 들어간다
// ---------------------------------------------------------------------------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value; // 이스케이프된 마크다운 결과 전용
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false || child === '') continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

const postHref = (slug) => `#/post/${encodeURIComponent(slug)}`;
const tagHref = (tag) => `#/tag/${encodeURIComponent(tag)}`;

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function readingMinutes(body) {
  const chars = body.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, '').length;
  return Math.max(1, Math.round(chars / CHARS_PER_MINUTE));
}

// 요약이 없을 때 본문 첫 문단으로 대신한다
function excerpt(body, max = 120) {
  const para = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !/^(#|```|~~~|>|[-*+]\s|\d+\.\s|\||!\[)/.test(block));
  if (!para) return '';
  const text = para
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

// ---------------------------------------------------------------------------
// 데이터
// ---------------------------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  return res.text();
}

async function fetchPost(file) {
  const raw = await fetchText(`posts/${encodeURIComponent(file)}`);
  const { data, body } = parseFrontmatter(raw);
  const slug = file.replace(/\.md$/i, '');
  const tags = Array.isArray(data.tags) ? data.tags : data.tags ? [String(data.tags)] : [];
  return {
    slug,
    title: data.title || slug,
    date: data.date ? String(data.date) : '',
    tags,
    description: data.description || excerpt(body),
    draft: data.draft === true,
    body,
    minutes: readingMinutes(body),
  };
}

function loadPosts() {
  if (!postsPromise) {
    postsPromise = (async () => {
      const files = JSON.parse(await fetchText('posts/index.json'));
      if (!Array.isArray(files)) throw new Error('posts/index.json은 파일명 배열이어야 합니다.');

      const results = await Promise.allSettled(files.map(fetchPost));
      results
        .filter((r) => r.status === 'rejected')
        .forEach((r) => console.warn('글을 불러오지 못했습니다:', r.reason));

      // 업로드 순서(최신 업로드가 위). index.json은 새 글을 맨 앞에 추가하므로 그 순서를 그대로 쓴다.
      return results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((post) => !post.draft);
    })();
    // 실패하면 다음 이동 때 다시 시도한다
    postsPromise.catch(() => {
      postsPromise = null;
    });
  }
  return postsPromise;
}

// ---------------------------------------------------------------------------
// 화면 조각
// ---------------------------------------------------------------------------

function postMeta(post) {
  return h(
    'p',
    { class: 'post-meta' },
    post.date && h('time', { datetime: post.date }, formatDate(post.date)),
    h('span', {}, `${post.minutes}분 분량`)
  );
}

function tagList(tags) {
  if (!tags.length) return null;
  return h(
    'ul',
    { class: 'tag-list', 'aria-label': '태그' },
    tags.map((tag) => h('li', {}, h('a', { class: 'tag', href: tagHref(tag) }, `#${tag}`)))
  );
}

function postItem(post) {
  return h(
    'li',
    { class: 'post-item' },
    h(
      'article',
      {},
      h('h2', { class: 'post-item-title' }, h('a', { href: postHref(post.slug) }, post.title)),
      postMeta(post),
      post.description && h('p', { class: 'post-item-desc' }, post.description),
      tagList(post.tags)
    )
  );
}

// ---------------------------------------------------------------------------
// 페이지
// ---------------------------------------------------------------------------

function renderList(posts, tag) {
  const list = tag ? posts.filter((p) => p.tags.includes(tag)) : posts;

  const header = tag
    ? h(
        'div',
        { class: 'page-header' },
        h('p', { class: 'eyebrow' }, '태그'),
        h('h1', {}, `#${tag}`),
        h('p', { class: 'muted' }, `${list.length}개의 글`),
        h('a', { class: 'back-link', href: '#/' }, '← 전체 글 보기')
      )
    : h(
        'div',
        { class: 'page-header page-header--home' },
        h('h1', {}, SITE_TITLE),
        h('p', { class: 'muted' }, SITE_DESCRIPTION)
      );

  const content = list.length
    ? h('ul', { class: 'post-list' }, list.map(postItem))
    : h('p', { class: 'empty' }, tag ? '이 태그의 글이 없습니다.' : '아직 작성된 글이 없습니다.');

  document.title = tag ? `#${tag} · ${SITE_TITLE}` : SITE_TITLE;
  main.replaceChildren(header, content);
}

function navLink(post, label, className) {
  return h(
    'a',
    { class: className, href: postHref(post.slug) },
    h('span', { class: 'label' }, label),
    h('span', { class: 'title' }, post.title)
  );
}

function renderPost(posts, slug) {
  const index = posts.findIndex((p) => p.slug === slug);
  if (index === -1) {
    renderNotFound('글을 찾을 수 없습니다.');
    return;
  }

  const post = posts[index];
  const newer = posts[index - 1];
  const older = posts[index + 1];

  const article = h(
    'article',
    {},
    h(
      'header',
      { class: 'post-header' },
      h('h1', { class: 'post-title' }, post.title),
      postMeta(post),
      tagList(post.tags)
    ),
    h('div', { class: 'prose', html: markdownToHtml(post.body) })
  );

  const nav =
    newer || older
      ? h(
          'nav',
          { class: 'post-nav', 'aria-label': '이전 글과 다음 글' },
          older && navLink(older, '← 이전 글', 'prev'),
          newer && navLink(newer, '다음 글 →', 'next')
        )
      : null;

  document.title = `${post.title} · ${SITE_TITLE}`;
  main.replaceChildren(article, nav || '', h('a', { class: 'back-link', href: '#/' }, '← 목록으로'));
}

function renderNotFound(message) {
  document.title = `찾을 수 없음 · ${SITE_TITLE}`;
  main.replaceChildren(
    h(
      'div',
      { class: 'page-header' },
      h('h1', {}, message),
      h('p', { class: 'muted' }, '주소가 바뀌었거나 삭제된 글일 수 있습니다.'),
      h('a', { class: 'back-link', href: '#/' }, '← 목록으로')
    )
  );
}

function renderError(error) {
  console.error(error);
  document.title = `오류 · ${SITE_TITLE}`;
  const isFileProtocol = location.protocol === 'file:';
  main.replaceChildren(
    h(
      'div',
      { class: 'page-header' },
      h('h1', {}, '글을 불러오지 못했습니다'),
      h(
        'p',
        { class: 'muted' },
        isFileProtocol
          ? '파일을 직접 열면 글을 불러올 수 없습니다. 로컬 서버(예: python -m http.server)로 열어 주세요.'
          : '잠시 후 다시 시도해 주세요.'
      )
    )
  );
}

// ---------------------------------------------------------------------------
// 라우터
// ---------------------------------------------------------------------------

function parseRoute() {
  const path = location.hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  try {
    const decoded = parts.map(decodeURIComponent);
    if (decoded.length === 0) return { name: 'list' };
    if (decoded[0] === 'post' && decoded[1]) return { name: 'post', slug: decoded[1] };
    if (decoded[0] === 'tag' && decoded[1]) return { name: 'tag', tag: decoded[1] };
  } catch {
    // 잘못 인코딩된 주소
  }
  return { name: 'notfound' };
}

let renderToken = 0;

async function router() {
  const token = ++renderToken;
  const route = parseRoute();

  try {
    const posts = await loadPosts();
    if (token !== renderToken) return; // 그 사이 다른 페이지로 이동함

    if (route.name === 'list') renderList(posts);
    else if (route.name === 'tag') renderList(posts, route.tag);
    else if (route.name === 'post') renderPost(posts, route.slug);
    else renderNotFound('페이지를 찾을 수 없습니다.');
  } catch (error) {
    if (token === renderToken) renderError(error);
    return;
  }

  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

// 본문 안의 #제목 링크는 라우터 대신 해당 위치로 스크롤한다
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href.startsWith('#/') || href === '#') return;

  let target = null;
  try {
    target = document.getElementById(decodeURIComponent(href.slice(1)));
  } catch {
    return;
  }
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  if (target === main) main.focus({ preventScroll: true });
});

// ---------------------------------------------------------------------------
// 시작
// ---------------------------------------------------------------------------

initThemeToggle(document.querySelector('.theme-toggle'));
document.querySelector('.footer-year').textContent = new Date().getFullYear();
window.addEventListener('hashchange', router);
router();
