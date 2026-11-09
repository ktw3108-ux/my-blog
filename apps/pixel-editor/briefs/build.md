# Build 지침: 픽셀 아트 에디터

너는 Build 서브에이전트다. 승인된 계획서대로 미니 웹앱을 구현한다. 답변과 코드 주석은 한국어로 쓴다.

## 기준 문서

`C:\Users\ktw31\Desktop\my-blog\apps\pixel-editor\spec.md`를 처음부터 끝까지 읽고 그대로 구현한다. 규칙, 수치, 파일 이름, 내보내는 함수 형태는 spec.md가 기준이다. spec.md와 다르게 구현해야 할 이유가 생기면 임의로 바꾸지 말고 완료 보고에 적는다.

## 수정 범위

다음 파일만 새로 만든다.

- `apps/pixel-editor/index.html`
- `apps/pixel-editor/style.css`
- `apps/pixel-editor/editor.js`
- `apps/pixel-editor/png.js`
- `apps/pixel-editor/ui.js`
- `apps/pixel-editor/preview.svg`

그 외 파일은 만들거나 고치지 않는다.

- 특히 블로그의 `index.html`, `js/app.js`, `css/style.css`, `CLAUDE.md`, `apps/small-forest/`, `spec.md`, `briefs/` 안의 파일을 건드리지 않는다.
- Embed(블로그 메인 카드 추가)는 이 단계의 일이 아니다.
- `review.md`는 만들지 않는다.
- git으로 저장소 상태를 바꾸지 않는다(커밋, 스테이지 금지).
- npm 패키지를 설치하지 않는다. 외부 라이브러리와 CDN을 쓰지 않는다.
- `.claude/` 안의 권한 설정을 고치지 않는다. 명령이 거부되면 다른 방법으로 우회하지 말고 보고한다.

## 범위 제약

spec.md 12장의 추가 기능 제안(사용자 지정 색, 스포이트, 좌우 대칭, 채우기, 기록 유지)과 레이어, 애니메이션, 격자 크기 변경, 파일 불러오기를 넣지 않는다. 범위 밖의 작은 개선도 임의로 더하지 않는다.

## 구현 시 확인

- `editor.js`, `png.js`는 DOM에 의존하지 않는 순수 모듈로 만든다.
- 규칙(`linePoints`, 획과 기록, 직렬화, `toRgba`)을 `node`로 직접 실행해 확인한다. 임시 시험 스크립트는 프로젝트 폴더 밖에서 만들고 끝나면 지운다.
- 로컬 서버(`node server.js`, 포트 8000)가 이미 켜져 있을 수 있다. 네가 켠 서버만 작업이 끝날 때 끈다.
- 사용자 데이터가 화면에 들어가는 곳은 `textContent`를 쓴다.
- 시험하며 넣은 `localStorage` 값(`pixel-editor:state`, `theme`)은 끝날 때 지운다.
- 콘솔 오류는 수정 후 새 탭에서 다시 연 기록으로 판단한다.

## 완료 보고

- 만든 파일 목록
- 규칙 시험 결과(실제로 실행한 것만)
- 브라우저에서 직접 확인한 것과 확인하지 못한 것
- spec.md와 달라진 점, 또는 "없음"
