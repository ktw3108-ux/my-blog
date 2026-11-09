---
title: CSS 변수로 다크 모드 만들기
date: 2026-11-08
tags: [CSS, 다크모드]
description: 시스템 설정을 따르면서 사용자가 직접 바꿀 수도 있는 다크 모드를 만드는 방법.
---

이 블로그의 다크 모드는 **CSS 변수**와 몇 줄의 JavaScript로 만들었습니다.

## 1. 색상을 변수로 정의하기

모든 색상을 `:root`에 변수로 모아 두면, 테마를 바꿀 때 변수 값만 바꾸면 됩니다.

```css
:root {
  --bg: #ffffff;
  --text: #1d2127;
}

:root[data-theme="dark"] {
  --bg: #15171c;
  --text: #e4e6ea;
}

body {
  background: var(--bg);
  color: var(--text);
}
```

## 2. 시스템 설정 따르기

사용자가 직접 고르지 않았다면 운영체제 설정을 따릅니다.

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #15171c;
    --text: #e4e6ea;
  }
}
```

`:not([data-theme="light"])` 덕분에 사용자가 라이트 모드를 직접 골랐을 때는 시스템 설정을 무시합니다.

## 3. 깜빡임 막기

페이지를 열 때 잠깐 밝은 화면이 보였다가 어두워지는 현상이 있습니다. `<head>` 안에서 저장된 테마를 **CSS보다 먼저** 적용하면 해결됩니다.

```html
<script>
  try {
    const saved = localStorage.getItem('theme');
    if (saved) document.documentElement.dataset.theme = saved;
  } catch (e) {}
</script>
```

## 정리

| 방법 | 역할 |
| --- | --- |
| CSS 변수 | 색상을 한곳에서 관리 |
| `prefers-color-scheme` | 시스템 설정 따르기 |
| `data-theme` 속성 | 사용자 선택 반영 |
| `<head>` 인라인 스크립트 | 깜빡임 방지 |

오른쪽 위 버튼을 눌러 직접 바꿔 보세요.
