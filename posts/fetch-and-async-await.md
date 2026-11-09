---
title: fetch와 async/await로 글 불러오기
date: 2026-11-09
tags: [JavaScript, fetch, 비동기, 블로그]
description: 이 블로그가 마크다운 파일을 가져오는 코드를 따라가며 fetch와 async/await를 정리했습니다.
---

이 블로그의 글은 HTML 안에 들어 있지 않습니다. 페이지가 열린 뒤에 JavaScript가 `posts/` 폴더의 마크다운 파일을 **따로 가져옵니다**. 그 일을 맡은 것이 `fetch`이고, 코드를 읽기 쉽게 해 주는 것이 `async/await`입니다.

파일을 가져오는 데는 시간이 걸립니다. 그동안 페이지가 멈춰 있으면 곤란하니, 이렇게 일을 나눕니다.

> 일단 요청해 두고, **결과가 오면** 이어서 처리한다.

## fetch와 Promise

`fetch`를 부르면 파일 내용이 바로 나오지 않습니다. 대신 **Promise**를 돌려줍니다. Promise는 "지금은 없지만 나중에 결과를 알려 줄게"라는 약속 같은 값이에요.

```javascript
const result = fetch('posts/index.json');
console.log(result); // 파일 내용이 아니라 Promise가 찍힌다
```

약속은 셋 중 하나의 상태에 있습니다.

| 상태 | 뜻 |
| --- | --- |
| pending | 아직 기다리는 중 |
| fulfilled | 성공해서 결과가 있음 |
| rejected | 실패해서 오류가 있음 |

## async/await로 순서대로 읽기

`await`를 붙이면 "이 약속이 끝날 때까지 기다렸다가 결과를 꺼내라"는 뜻이 됩니다. 아래는 이 블로그의 `js/app.js`에 있는 실제 코드입니다.

```javascript
async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  return res.text();
}
```

- `await`는 기본적으로 `async`가 붙은 함수 안에서 씁니다. (ES 모듈의 최상위에서도 쓸 수 있습니다.)
- `await`로 기다리는 것은 **그 함수뿐**입니다. 브라우저는 그동안 스크롤이나 클릭을 계속 처리합니다.
- `async` 함수는 항상 Promise를 돌려줍니다. 그래서 `fetchText`를 쓰는 쪽에서도 `await fetchText(...)`처럼 기다립니다.
- `res.text()`도 본문을 끝까지 읽어야 하므로 Promise를 돌려줍니다. 즉 **헤더를 받는 단계와 본문을 읽는 단계**가 나뉘어 있습니다.

## 404는 실패가 아니다

처음에 가장 헷갈렸던 부분입니다. 없는 파일을 요청해 서버가 404를 돌려줘도 `fetch`의 Promise는 rejected가 되지 않습니다. 서버가 **응답은 했기** 때문입니다. rejected는 네트워크 문제처럼 응답 자체를 받지 못했을 때 일어납니다.

그래서 위 코드에 `if (!res.ok)` 검사가 있습니다. `res.ok`는 상태 코드가 200~299일 때만 `true`입니다. 이 줄이 없으면 오류 안내 페이지의 내용을 글 본문처럼 처리하게 될 수 있습니다.

던져진 오류는 `try/catch`로 받습니다. `router` 함수는 글을 못 불러오면 빈 화면 대신 안내 문구를 보여 줍니다.

```javascript
try {
  const posts = await loadPosts();
  // 화면 그리기
} catch (error) {
  renderError(error);
}
```

## 글 여러 편을 한꺼번에

글 목록을 만들려면 파일을 전부 가져와야 합니다. `for` 문 안에서 하나씩 `await`하면 앞 파일이 끝나야 다음 요청이 시작됩니다. 이 블로그는 요청을 **동시에** 시작하고 모두 끝나기를 기다립니다.

```javascript
const results = await Promise.allSettled(files.map(fetchPost));
```

| 함수 | 하나가 실패하면 |
| --- | --- |
| `Promise.all` | 전체가 바로 실패로 끝남 |
| `Promise.allSettled` | 나머지를 끝까지 기다리고, 각각의 성공·실패를 알려 줌 |

`allSettled`를 쓴 덕분에 글 한 편이 깨져도 그 글만 빠지고 목록은 정상으로 보입니다. 실패한 글은 콘솔에 경고로만 남습니다.

코드를 위에서 아래로 읽을 수 있다는 점이 `async/await`의 가장 큰 장점 같습니다. 다만 `await`가 있어도 실패는 알아서 처리되지 않으니, `res.ok`와 `try/catch`는 함께 챙겨야 한다는 것을 기억해 두려고 합니다.
