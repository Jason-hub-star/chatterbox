---
tags: [goals]
---

# GOAL-teleprompter-dock — 텔레프롬프터 좌 dock 재편(A안) + C 승급 확장성

## 골 한 줄
룸 좌 dock 을 **모드 타이틀 → 대본 제목 → 역할 → 텔레프롬프터 포커스(긴 대사 박스 내부 스크롤·다음 미리보기) → 전체 대본(접이식)** 위계로 재편하고 세션정보 카드를 제거한다 — verified by `check:all` 그린 + 360/1440 실렌더(가로 오버플로 0·긴 대사 박스 내부 스크롤) while preserving cue 동기·역할·모드 로직 무변경.

## 1. Outcome
- `SessionInfoCard` 삭제 — 장르·러닝타임=상단바(`RoomTopBar` #태그·elapsed) 중복·언어=본인 UI 설정 → 정보 손실 0.
- **무대용 위계**(좁은 216~256px dock, 주인님 UIUX 지적 반영): 상시 노출 = **헤더 1줄(모드 태그 + 대본 제목) → 역할 칩 → 현재 대사 포커스(지배 요소 ≈70%)**. 셋업(개인 글자 크기·호스트 배정·전체 대본)은 **⚙ 설정** 뒤로 접음(default 접힘, `localStorage('cb.scriptSettingsOpen')`).
- 모드=태그(호스트 토글·비호스트 라벨), 역할=**칩**(내 역할 앰버 채움·탭=내려놓기 / 빈=파선·탭=맡기 / 관전자 정적).
- 텔레프롬프터 포커스: 현재 대사 크게·`leading-relaxed`, 긴 대사 `max-h-[40vh] overflow-y-auto` 박스 내부 스크롤(cue 변경 시 `scrollTop=0`), 다음 대사 faint 미리보기.
- 포커스 뷰 = 배치 무관 컴포넌트 `TeleprompterFocus` — C(무대 하단 전폭 오버레이) 승급 지점(ponytail ceiling·업그레이드 경로 주석).

## 2. Verification surface
- 명령: `npm run check:all` → 기대: tsc·lint(0/0)·test·build·docs:check·drift(0/0)·links(0 broken) 그린.
- 실렌더(DEV 임시 라우트 + playwright-core, 검증 후 철거): 360/1440 `documentElement` 가로 오버플로 0 · lg 폰트 초장문 = 포커스 박스 `scrollHeight>clientHeight(=40vh)`·`overflowY:auto`·페이지 오버플로 0 · 스택 순서·세션정보 부재.
- 단위: `tests/unit/teleprompterFocus.test.tsx`(스크롤 컨테이너·myTurn 배지·다음 미리보기·end) + `scriptPanelFontScale.test.tsx`(재편 후 무회귀).

## 3. Constraints (후퇴 금지)
- cue 동기(`advance-script-cue` Edge·`script-cue` 서버릴레이·SEC-5)·역할 클레임(`useScriptSync`·`roleMap.ts` 리듀서)·모드 전환 로직 **무변경**. 프레젠테이션·레이아웃만.
- i18n 3언어 완역·JSX 하드코딩 한글 금지. 반응형 360px 게이트.
- G1~G8 검증 표면 green 유지.

## 4. Boundaries
- 허용: `features/script/{ScriptPanel,TeleprompterFocus,fontScale,cues}` · `pages/RoomPage`(배선 제거) · `room/SessionInfoCard`(삭제) · `i18n/locales/{ko,en,ja}` · `tests/unit/*` · `docs/design/DESIGN-DIRECTION.md §6.2` · `docs/contracts/ScriptPanel.md`.
- 금지: cue/역할/모드 서버 로직 · Edge · 마이그 · 타 dock 컴포넌트.

## 5. Iteration policy
- 매 패스: check:all + 실렌더 전체 실행 → 실패 항목 최소 변경 재시도. 무진전 3패스면 blocked.

## 6. Blocked stop condition
- 실렌더에서 오버플로/박스 스크롤 미작동 근본원인 불명 3패스 → 멈추고 4분류(재현/근사/막힘/불확실) 보고.

## 7. 실행 기록
- **2026-07-13 Opus 4.8 — 패스 1(구현+검증 완결, 판정=재현):** 문서 먼저(§6.2 좌패널 순서 재편·미구현 언어토글 정리) → `TeleprompterFocus.tsx` 신설(스케일 어휘를 `fontScale.ts` leaf 로 분리 = react-refresh 경고 회피·중복 클래스맵 제거) → `ScriptPanel.tsx` 헤더 수직 재편(모드 타이틀 행 + 제목/폰트 행)·현재 대사→포커스 위임·전체 대본 접이식 → `RoomPage` SessionInfoCard 배선 제거 → `SessionInfoCard.tsx` 삭제 → i18n `room.info*` 5키×3언어 제거 + `script.nextUp`/`script.fullScript` 신설 → 시드 초장문 1줄(스크롤 검증용) → 단위 4 신설. **검증**: `check:all` 그린(test **142/142**·lint **0/0**·build·docs 3게이트) · **실렌더 실측**: hOverflow **0** @360·@1440 / lg 초장문 boxScrollH **390 > clientH 312(=40vh)**·`overflowY:auto`·hOverflow **0**(박스 내부 스크롤이 페이지로 안 샘) / 스택 순서(리허설→제목→역할→포커스)·세션정보 부재 육안 몽타주 — DEV 라우트+playwright-core 검증 후 철거. **잔여 게이트**: 커밋·배포(주인님 승인 대기).
- **2026-07-13 Opus 4.8 — 패스 2(UIUX 위계 재편 A안 "무대용", 주인님 지적 반영):** 좁은 dock(216~256px)에서 셋업 chrome 와 대사가 동급이라 초점이 없던 문제 → `AskUserQuestion` A(무대용 위계) 채택. 헤더 1줄(모드 태그+제목·`script.header` 접두 제거)·역할 리스트→**칩**·셋업(글자·호스트 배정·전체 대본)을 **⚙ 설정 드로어**로 접음(`cb.scriptSettingsOpen` default 접힘)·`script.me`/`script.settings` 신설·font 테스트는 ⚙ 경유로 갱신. **검증**: check:all 그린(lint 0/0) · **실렌더 240px 실폭 실측**: 현재 대사 = **패널 70%**(cueH 376/panelH 534)·접힘 시 fontGroup·전체대본 부재·⚙ 펼치면 등장·가로 오버플로 0 @240/360 — DEV 라우트+playwright-core 검증 후 철거. **판정=재현**.

## 참조 문서
- `docs/contracts/ScriptPanel.md`(A안 as-built) · `docs/design/DESIGN-DIRECTION.md §6.2` · `docs/FEATURE-SPEC.md` ROOM-06/14.
- **C 승급 경로**(이번 스코프 밖): `TeleprompterFocus` 를 무대 하단 전폭 오버레이 컨테이너로 mount + 좌 dock 은 모드·제목·역할(관리)만 — 로직·프로토콜 재작성 0. 무대 몰입 실사용 판정 후 착수.
