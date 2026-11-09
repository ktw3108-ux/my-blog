# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude Code에게 프로젝트 맥락과 규칙을 알려준다.

## 프로젝트 개요

`posts/` 폴더의 마크다운(.md) 파일을 읽어 블로그 웹사이트로 보여주는 정적 사이트.

- **프레임워크·빌드 도구 없음**: 순수 HTML, CSS, JavaScript(ES 모듈)만 사용한다.
- React/Vue/Svelte, Tailwind, Bootstrap, jQuery, 번들러(webpack/Vite 등), npm 의존성을 추가하지 않는다.
- 마크다운 파서도 외부 라이브러리 없이 `js/markdown.js`에 직접 구현한다.
- 모든 답변과 커밋 메시지, 코드 주석은 한국어로 작성한다.

## 디렉터리 구조

```
my-blog/
├── index.html          # 단일 진입점 (글 목록 + 글 상세를 모두 렌더링)
├── css/
│   └── style.css       # 전체 스타일 (CSS 변수 기반 테마)
├── js/
│   ├── app.js          # 진입점: 라우팅, 화면 렌더링
│   ├── markdown.js     # 마크다운 → HTML 변환기
│   ├── frontmatter.js  # 글 상단 메타데이터 파싱
│   └── theme.js        # 다크/라이트 모드 전환
├── posts/
│   ├── index.json      # 글 목록 매니페스트 (파일명 배열)
│   └── *.md            # 블로그 글
├── assets/             # 이미지 등 정적 파일
├── server.js           # 로컬 확인용 정적 서버 (Node 내장 모듈만 사용)
└── publish.js          # Obsidian 보관함 글을 posts/로 올리는 스크립트
```

## 동작 방식

1. `app.js`가 `posts/index.json`을 `fetch`로 읽어 글 파일 목록을 얻는다.
2. 각 `.md` 파일을 `fetch`로 가져와 프런트매터와 본문을 분리한다.
3. 해시 라우팅을 사용한다.
   - `#/` → 글 목록 (업로드 순서, 최신 업로드가 위 = `posts/index.json` 순서 그대로)
   - `#/post/<slug>` → 글 상세 (slug = 파일명에서 `.md` 제외)
   - `#/tag/<tag>` → 태그별 목록
4. 본문은 `markdown.js`로 HTML로 변환해 `<article>`에 넣는다.

### 글 작성 형식

```markdown
---
title: 글 제목
date: 2026-11-08
tags: [javascript, css]
description: 목록에 보일 짧은 요약
---

본문 마크다운...
```

새 글을 추가하면 **반드시 `posts/index.json` 배열의 맨 앞에 파일명을 추가**한다. 목록은 날짜가 아니라 이 배열 순서(= 업로드 순서)로 보이므로, 기존 항목의 순서를 바꾸지 않는다.

### 마크다운 파서 지원 범위

제목(`#`~`######`), 문단, 굵게/기울임, 인라인 코드, 코드 블록(``` 언어 표기 포함), 링크, 이미지, 순서/비순서 목록(중첩 1단계), 인용문, 수평선, 표.

- 변환 전에 원문의 HTML 특수문자(`<`, `>`, `&`, `"`)를 반드시 이스케이프해 XSS를 막는다.
- 링크 `href`는 `http:`, `https:`, `mailto:`, 상대 경로만 허용하고 `javascript:`는 제거한다.
- 코드 블록 내부는 마크다운 문법을 해석하지 않는다.

## 디자인 원칙

깔끔하고 **읽기 편한** 것이 최우선이다. 장식보다 타이포그래피와 여백으로 완성도를 낸다.

- 본문 폭: `max-width: 68ch` 내외로 한 줄 길이를 제한한다.
- 글꼴: 시스템 폰트 스택 (`-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif`), 코드는 고정폭 폰트.
- 본문 크기 `1.0625rem`~`1.125rem`, 줄간격 `1.75`, 한국어 가독성을 위해 `word-break: keep-all`.
- 색상·간격·글꼴은 `:root`의 CSS 변수로만 정의하고, 하드코딩된 색상 값을 컴포넌트 스타일에 직접 쓰지 않는다.
- 애니메이션은 테마 전환 등 최소한으로, `prefers-reduced-motion`을 존중한다.

### 다크 모드

- 라이트/다크 색상을 CSS 변수 두 벌로 정의한다.
  - 기본: `:root` (라이트)
  - 시스템 설정: `@media (prefers-color-scheme: dark)` 안에서 `:root:not([data-theme="light"])`
  - 사용자 선택: `:root[data-theme="dark"]`, `:root[data-theme="light"]`
- 헤더의 토글 버튼으로 전환하고, 선택값은 `localStorage`에 저장한다 (`try/catch`로 감싸 실패해도 동작하게).
- 첫 페인트 깜빡임(FOUC)을 막기 위해 `<head>`의 작은 인라인 스크립트에서 저장된 테마를 먼저 적용한다.
- 다크 모드 배경은 순검정 대신 짙은 회색, 본문 텍스트는 순백 대신 약간 낮춘 밝기를 사용한다. 대비는 WCAG AA(4.5:1) 이상.

### 반응형 / 모바일

- 모바일 우선(mobile-first)으로 작성하고 넓은 화면에서 `min-width` 미디어 쿼리로 확장한다.
- 좌우 여백 최소 `16px`, 어떤 화면에서도 가로 스크롤이 생기지 않게 한다.
- 코드 블록과 표는 자체 가로 스크롤(`overflow-x: auto`)로 처리한다.
- 이미지는 `max-width: 100%; height: auto`.
- 터치 대상(버튼, 링크)은 최소 44×44px.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` 필수.

## 코딩 규칙

- JavaScript: ES 모듈(`<script type="module">`), `const`/`let`, 화살표 함수, `async/await`. 전역 변수 금지.
- DOM에 사용자 데이터를 넣을 때 `innerHTML`은 이스케이프된 파서 결과에만 쓰고, 그 외에는 `textContent`를 사용한다.
- 시맨틱 HTML(`header`, `main`, `article`, `nav`, `time`, `footer`)과 접근성(`aria-label`, 포커스 표시, 이미지 `alt`)을 지킨다.
- 들여쓰기 2칸, 세미콜론 사용, 작은따옴표.
- 오류 처리: 글을 못 불러오면 빈 화면 대신 "글을 찾을 수 없습니다" 같은 안내를 보여준다.

## 로컬 실행

`fetch`는 `file://`에서 동작하지 않으므로 반드시 로컬 서버로 연다.

```bash
node server.js
```

`server.js`는 Node 내장 모듈만 쓰는 확인용 정적 서버다(설치 불필요, 사이트 동작에는 관여하지 않음). Python이 있다면 `python -m http.server 8000`도 된다.

브라우저에서 `http://localhost:8000` 접속.

## Obsidian에서 글 올리기

초안은 Obsidian 보관함 `C:\Users\ktw31\Documents\Obsidian Vault\블로그`에서 쓴다.

- 노트의 `published` 속성(체크박스)이 블로그 게시 여부다. 올리기 전에는 체크 해제, 올린 뒤에는 `publish.js`가 자동으로 체크한다.
- `published` 속성이 없는 노트는 올리지 않는다. `draft: true`인 노트도 올리지 않는다.

```bash
node publish.js --dry-run
```

```bash
node publish.js
```

- 특정 노트만: `node publish.js "노트 이름"`
- 변환 내용: Obsidian 목록형 태그 → `tags: [a, b]`, `[[노트]]` → 블로그 글 링크(올라간 글일 때만, 아니면 글자), `![[첨부]]` → 글자. 글에 `source: obsidian/<노트 이름>`을 기록한다.
- 파일명은 노트 이름을 하이픈으로 이은 것(`slug` 속성으로 바꿀 수 있음). 같은 노트에서 올린 파일만 덮어쓰고, 다른 글과 이름이 겹치면 건너뛴다.
- 이미 올린 글을 고쳤다면 Obsidian에서 체크를 해제하고 다시 실행하면 갱신된다.

## 변경 후 확인 사항

- 라이트/다크 모드 모두에서 화면 확인
- 모바일 폭(375px)과 데스크톱 폭에서 레이아웃 확인
- 브라우저 콘솔에 오류가 없는지 확인
