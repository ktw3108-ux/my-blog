# Build 지침: 작은 숲 키우기

너는 Build 서브에이전트다. 승인된 계획서대로 미니 웹앱을 구현한다. 답변과 코드 주석은 한국어로 쓴다.

## 기준 문서

`C:\Users\ktw31\Desktop\my-blog\apps\small-forest\spec.md`를 처음부터 끝까지 읽고 그대로 구현한다. 규칙, 수치, 파일 이름, 함수 형태는 spec.md가 기준이다. spec.md와 다르게 구현해야 할 이유가 생기면 임의로 바꾸지 말고 완료 보고에 적는다.

## 수정 범위

다음 파일만 새로 만든다.

- `apps/small-forest/index.html`
- `apps/small-forest/style.css`
- `apps/small-forest/game.js`
- `apps/small-forest/ui.js`
- `apps/small-forest/preview.svg`

그 외 파일은 만들거나 고치지 않는다.

- 특히 블로그의 `index.html`, `js/app.js`, `css/style.css`, `CLAUDE.md`, `spec.md`, `briefs/` 안의 파일을 건드리지 않는다.
- Embed(블로그 메인 카드 추가)는 이 단계의 일이 아니다.
- `review.md`는 만들지 않는다.
- git으로 저장소 상태를 바꾸지 않는다(커밋, 스테이지 금지).
- npm 패키지를 설치하지 않는다. 외부 라이브러리와 CDN을 쓰지 않는다.
- `.claude/` 안의 권한 설정을 고치지 않는다. 명령이 거부되면 다른 방법으로 우회하지 말고 보고한다.

## 재현 금지 제약

spec.md의 제약을 지킨다. 이름, 화면 문구, 파일명, 코드 식별자에 기존 게임 이름을 쓰지 않고, 두 배로 커지는 숫자 타일, 4×4 보드, 베이지 계열 색, 기존 게임과 비슷한 배치를 쓰지 않는다.

## 구현 시 확인

- `game.js`는 DOM에 의존하지 않는 순수 모듈로 만들고, `move`는 입력 `state`를 변경하지 않는다.
- spec.md 2.1의 예시 표 6행을 `node`로 직접 실행해 확인한다. 임시 시험 스크립트는 프로젝트 폴더 안에 남기지 않는다.
- 로컬 서버(`node server.js`, 포트 8000)가 이미 켜져 있을 수 있다. 서버를 켰다면 작업이 끝날 때 네가 켠 서버만 끈다.
- 사용자 데이터가 화면에 들어가는 곳이 있으면 `textContent`를 쓴다.

## 완료 보고

- 만든 파일 목록
- spec.md 2.1 예시 표 시험 결과(실제로 실행한 것만)
- 브라우저에서 직접 확인한 것과 확인하지 못한 것
- spec.md와 달라진 점, 또는 "없음"
