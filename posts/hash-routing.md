---
title: 해시 라우팅으로 한 페이지에서 여러 화면 보여주기
date: 2026-11-08
tags: [JavaScript, 라우팅, 블로그]
description: index.html 하나로 글 목록과 글 상세를 오가는 해시 라우팅의 원리를 정리했습니다.
---

이 블로그에는 HTML 파일이 `index.html` 하나뿐입니다. 그런데도 글 목록, 글 상세, 태그별 목록 화면을 자유롭게 오갈 수 있어요. 비밀은 주소 끝의 `#` 뒷부분, **해시(hash)** 에 있습니다.

> 주소의 `#` 뒷부분을 보고 JavaScript가 알맞은 화면을 그려 주는 것, 그게 해시 라우팅이다.

## 해시란 무엇인가

주소창의 `#` 뒤에 붙는 부분을 해시(또는 프래그먼트)라고 부릅니다. 원래는 `#소개`처럼 페이지 안의 특정 위치로 이동할 때 쓰던 기능이에요.

해시에는 라우팅에 딱 맞는 성질이 두 가지 있습니다.

- 해시만 바뀌면 브라우저가 **페이지를 새로 불러오지 않습니다.**
- 해시는 **서버로 전송되지 않습니다.** 그래서 서버는 항상 같은 `index.html`만 돌려주면 되고, 특별한 설정이 필요 없습니다.

이 블로그에서 쓰는 주소는 이렇습니다.

| 주소 | 보여주는 화면 |
| --- | --- |
| `#/` | 글 목록 |
| `#/post/hello-world` | `hello-world.md` 글 상세 |
| `#/tag/CSS` | CSS 태그가 붙은 글 목록 |

## 주소를 읽어 화면 고르기

`js/app.js`의 `parseRoute` 함수가 해시를 읽어 "지금 어떤 화면인지"를 알려 줍니다.

```javascript
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
```

순서대로 보면 단순합니다.

1. `location.hash`로 `#/post/hello-world` 같은 값을 얻고, 맨 앞의 `#`을 뗍니다.
2. `/`로 잘라 `['post', 'hello-world']` 같은 배열을 만듭니다.
3. `decodeURIComponent`로 `%EC...`처럼 인코딩된 한글 태그를 원래 글자로 되돌립니다.
4. 첫 칸이 `post`인지 `tag`인지 보고 화면 이름을 정합니다. 어디에도 맞지 않으면 `notfound`가 됩니다.

반대로 링크를 만들 때는 `encodeURIComponent`로 감싸서, 한글이나 특수문자가 들어가도 주소가 깨지지 않게 합니다.

```javascript
const postHref = (slug) => `#/post/${encodeURIComponent(slug)}`;
```

## 해시가 바뀔 때마다 다시 그리기

해시가 바뀌면 브라우저는 `hashchange` 이벤트를 보냅니다. 이 이벤트에 라우터 함수를 연결해 두면, 링크를 누를 때마다 화면이 바뀝니다.

```javascript
window.addEventListener('hashchange', router);
router();
```

여기서 마지막 줄 `router()`가 중요합니다. 페이지를 **처음 열 때는 `hashchange`가 일어나지 않기** 때문에, 첫 화면은 직접 한 번 그려 줘야 합니다. 이 줄이 없으면 `#/post/...` 주소로 바로 들어왔을 때 빈 화면만 보이게 됩니다.

`router` 함수 안에서는 `parseRoute`의 결과에 따라 `renderList`, `renderPost` 같은 함수를 골라 부르고, 그린 뒤에는 화면을 맨 위로 올립니다.

## 해시 라우팅의 장단점

좋은 점:

- 서버 설정 없이 정적 파일만으로 여러 화면을 만들 수 있습니다.
- 해시가 바뀔 때마다 방문 기록이 남아서 **뒤로 가기 버튼**이 자연스럽게 동작합니다.
- 주소를 복사해 공유하면 같은 글 화면이 바로 열립니다.

아쉬운 점:

- 주소에 `#`이 들어가 조금 덜 깔끔해 보입니다.
- 원래 용도인 "페이지 안 위치 이동"과 겹칩니다. 그래서 이 블로그는 `#/`로 시작하는 링크만 라우팅에 쓰고, `#표`처럼 본문 안 제목으로 가는 링크는 따로 처리해 해당 위치로 스크롤합니다.

`#` 뒤의 짧은 문자열 하나로 한 페이지가 여러 화면처럼 움직인다는 게 신기했습니다. 다음에는 `#` 없는 주소를 만드는 History API도 비교해 보고 싶습니다.
