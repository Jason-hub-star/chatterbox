# GOAL-voice-recording — 음성 전용 방 녹음 (ROOM-28)

## 골 한 줄

방에서 무대 합성 없이 대화만 녹음해 다시듣기·다운로드까지 되게 한다 — verified by 프로드 라이브 녹음 1건이 `kind='voice'`·오디오 트랙 실존·비디오 트랙 부재로 디코드 실측되고 `check:all` 그린, while preserving 기존 무대 녹화(`kind='stage'`) 무회귀와 동의 게이트(§11.1.1). details in docs/goals/GOAL-voice-recording.md

## 1. Outcome

완료 시 아래가 전부 참이다.

- `recordings.kind` 컬럼이 프로드에 존재하고 기존 행은 전부 `'stage'` 로 백필돼 있다.
- 방에서 **음성 모드**로 녹음 시작 → 동의 → 정지 → R2 업로드 → `status='ready'` · `kind='voice'` · `file_size_bytes > 0`.
- 산출물 webm 을 디코드했을 때 **오디오 트랙이 존재하고 비디오 트랙이 없다**. ("음성 전용"의 유일한 ground truth — 파일명·MIME 문자열은 증거로 인정하지 않는다.)
- 다시듣기에서 재생되고 **다운로드 버튼으로 내려받은 바이트가 원본과 일치**한다.
- 용량 실측: 5분 녹음이 **3MB 이하**(64kbps 기준 2.4MB + 여유).
- 무대 녹화(`kind='stage'`)가 기존 그대로 동작한다 — 회귀 0.

## 2. Verification surface

| 단계 | 명령 | 기대 |
|---|---|---|
| 정적 | `npm run check:all` | exit 0 (tsc·lint·test·build·docs:check·docs:drift·docs:links) |
| Edge | `deno check --node-modules-dir=auto supabase/functions/start-room-recording/index.ts` | clean |
| 스키마 | 마이그 적용 후 psql 로 `recordings.kind` 컬럼·CHECK 제약·기존 행 백필 조회 | 컬럼 존재 · `kind in ('stage','voice')` · 기존 행 100% `'stage'` |
| 통합 | `tests/integration/voice-recording.mjs`(신규, 로컬 supabase serve) | kind='voice' 행 생성 · 동의 없이 업로드 요청 시 **412** · complete 후 ready · `get-recording-url` 멤버 200 / 비멤버 403 |
| **실동작** | 2탭 실렌더 E2E(로컬 livekit-server) — 녹음 산출 webm 을 `<video>` 로 디코드해 트랙 실측 | **오디오 트랙 1 · 비디오 트랙 0** · duration > 0 |
| UX | `npm run lint`(JSX 하드코딩 한글 차단) + `npm test -- i18nCoverage` | 신규 4키 ko/en/ja 완역 · `missingKeys === []` |
| UX | **HostConsole 360px 실렌더 스크린샷**(룸 라우트라 `check:responsive` 감시 밖) | 버튼 2개 가로 오버플로 0 · 터치 타깃 44px |
| 프로드 | 배포 후 라이브 녹음 1건 | R2 PUT 200 · presign GET 바이트 일치 · 5분 ≤ 3MB |

정적 게이트만으로 phase 를 닫지 않는다 — 각 phase 는 위 "실동작" 열의 실측을 통과해야 완료다.

## 3. Constraints (후퇴 금지)

- **기존 무대 녹화 무회귀** — `kind` 미지정 호출은 `'stage'` 로 동작해야 한다. `stageRecorder.ts` 는 **수정 금지**.
- **동의 게이트 유지** — `all_consented` 없이 캡처 시작 불가(412). 늦입장자 재요청(SEC-3)·거절 통지(UX-CONSENT-DECLINE)도 음성 모드에서 동일 동작.
- **신규 store · 신규 라우트 · 신규 상태기계 0** — `RecordingPhase` 5종 그대로.
- **서버 믹싱 / LiveKit Egress 금지** — 클라 합성만(V-3 §0 승계).
- **LiveKit 무료분 보호** — 개발·E2E 는 로컬 `livekit-server`(`tests/e2e/helpers/livekit-local.mjs`). 클라우드 접속은 프로드 최종 확인 때만 짧게.
- `check:all` 그린 유지 · i18n ko/en/ja 완역(게이트가 막는다).

## 4. Boundaries

**허용**
- `supabase/migrations/` — 신규 1개(`recordings.kind`)
- `supabase/functions/start-room-recording/index.ts` — `kind` 파라미터 수용
- `src/features/room/voiceRecorder.ts` — **신규**
- `src/features/room/useRoomRecording.ts` — `kind` 분기
- `src/lib/rooms.ts` — `startRoomRecording(kind)` 전달 + `RoomRecordingItem`/`fetchRoomRecordings` 에 `kind`·`file_size_bytes` 추가(U4 목록 표기). **다른 함수는 손대지 않는다**
- `src/features/room/HostConsole.tsx` — 시작 버튼 2개(U1) · 다시보기 `<audio>`+다운로드(U4)
- `src/features/room/RoomBottomBar.tsx` — 진행 배지 종류 분기(U3)
- `src/features/room/recordingLabels.ts` — `kind` 별 아이콘·라벨 키 선택(단일 조립 지점 유지)
- `src/i18n/locales/{ko,en,ja}.ts` — **신규 4키만**(U2)
- `docs/schema/02-content-and-economy.md` §1.11 + legacy 스냅샷 재동결 + `manifest.json` sha256 (마이그와 **같은 커밋**에서 1회)

**금지**
- `src/features/stage/stageRecorder.ts`(무대 회귀 위험) · `supabase/functions/_shared/`(전 함수 재배포 유발) · DUB 계열 전부
- `create-room-recording-upload` · `complete-room-recording` · `get-recording-url` — 계약상 **변경 불필요**. 손대야 한다면 계약이 틀린 것이므로 멈추고 보고한다.

## 5. Iteration policy

Phase 사다리 5칸. 각 phase 는 §2 의 해당 행을 통과해야 닫힌다.

| # | Phase | 완료 판정 |
|---|---|---|
| P0 | 스키마 — 마이그 + 문서 모듈 + 재동결 | psql 실측(컬럼·CHECK·백필) · `docs:check` PASS |
| P1 | Edge — `start-room-recording` kind | `deno check` clean · 통합 테스트 kind/412 |
| P2 | 클라 레코더 — `voiceRecorder.ts` | **webm 디코드: 오디오 1 · 비디오 0** |
| P3 | UX — 계약 U1~U5 구현 | 아래 U 게이트 5칸 전부 |
| P4 | 배포 + 프로드 라이브 | `functions list` 갱신시각 오늘 · 라이브 1건 바이트 일치 |

**P3 의 U 게이트** (계약 `VoiceRecording.md` §UX 계약 대응 — 하나라도 빠지면 P3 미완):

| | 판정 |
|---|---|
| U1 진입 | `HostConsole` 에 시작 버튼 2개 · 녹음 중엔 하나로 접힘 · **신규 패널/모달 0** |
| U2 문구 | 신규 4키만 · ko/en/ja 완역 · **동의 고지에 "화면은 저장되지 않는다"** 포함 |
| U3 배지 | 비호스트 하단바에 `🎙 녹음 중` · `recording_started` 페이로드에 `kind` 실존(2탭 실측) |
| U4 다시보기 | `kind='voice'` → `<audio>` 렌더(검은 박스 0) · 다운로드 바이트 일치 · 목록 행에 종류/길이/용량 |
| U5 반응형 | **360px 실렌더 스크린샷** 오버플로 0 · `.touch-target` 44px · `aria-label` 종류 명시 |

각 패스: 게이트 전체 실행 → 실패 항목만 최소 변경으로 재시도. **무진전 3패스면 blocked 판정.**

## 6. Blocked stop condition

- 대상 브라우저에서 audio-only `MediaRecorder` mimeType 이 전부 미지원(`isTypeSupported` 전건 false)
- 산출 webm 이 `<audio>` 에서 재생되지 않음 → 컨테이너 결정이 틀린 것. 계약(§데이터 델타)부터 다시 수렴한다
- `create-room-recording-upload` 등 "변경 불필요" 선언 함수를 고쳐야만 진행되는 상황 → 계약 오류
- 보고 형식: **재현됨 / 근사됨 / 막힘 / 불확실** 4분류

## 7. 실행 기록 (실행 에이전트가 기록)

- 2026-08-11 Claude(Opus 5) — 계약 수립. `docs/contracts/VoiceRecording.md` 신규 + 등재 4곳(`contracts/_INDEX`·`STORE-DEPENDENCY-MATRIX`·`FEATURE-SPEC` ROOM-28·`FEATURE-CONTRACT-MAP`). 게이트 실측: `contract-docs check PASS` · `schema split OK` · `doc links OK (0 broken)`.
- 2026-08-11 Claude(Opus 5) — 계약에 **UX 절(U1~U5) 추가**(주인님 지적: 수직 슬라이스인데 UX 미계획). P3 을 "UI 배선"→U 게이트 5칸으로 교체. 판정: 버튼 2개(토글 아님)·녹화≠녹음 문구 4키 한정·REC 배지 kind 필수·`<audio>`+무제한 다운로드·360px 수동 실렌더(HostConsole 은 `check:responsive` 감시 밖).
- 2026-08-11 Claude(Opus 5) — **P0 PASS(패스 1)**. 마이그 `20260811120000_recordings_kind.sql`(idempotent: `add column if not exists` + `drop/add constraint`) · 스키마 모듈 §1.11 + legacy 스냅샷 재동결 + `manifest.sourceSha256` d2f43f→812dac9b 갱신. **psql 실측 5종**: 컬럼 존재(text·default `'stage'`·NOT NULL) · CHECK `kind in ('stage','voice')` · **kind 미지정 INSERT → `stage`**(기존 호출부 무회귀) · `voice` 수용 · `bogus` CHECK 거부. 게이트: `check:all` exit 0(52 파일·**229 테스트**) · `docs:drift` probe 142·STALE 0·REGRESSION 0 · `schema split OK`. 자기리뷰 5종 PASS — **생성 DB 타입 파일 없음**(수기 `RoomRecordingItem`)이라 stale 타입 위험 0. **브리프 결함 1건 자체수정**: Boundaries 에 `src/lib/rooms.ts` 누락(→ `startRoomRecording(kind)`·`fetchRoomRecordings` 가 거기 있음) 보강.

- 2026-08-12 Claude(Opus 5) — **P1 PASS(패스 1)**. `start-room-recording` 이 `kind` 수용(화이트리스트 검증 → DB CHECK 500 이 아니라 **400 Invalid kind**), insert·응답·`recording_consent` broadcast 에 전파. **통합 15/15**(`tests/integration/voice-recording.mjs` 신규): 비호스트 403 · bogus 400 · **kind 미지정 → stage 무회귀** · voice 왕복 · **동의 전 업로드 412** · 동의 후 200 · `storage_key` `.webm` · complete 후 kind 보존 · 재생 URL 멤버 200/비멤버 403. `deno check` clean · `check:all` exit 0(229). **계약 정정 1건**: U3 이 `recording_started` 페이로드에 `kind` 를 요구했으나 그 발신처가 무변경 대상 `create-room-recording-upload` 였다 → **`recording_consent`(빠른 길) + `recordings` 행 조회(복구 길) 2단**으로 교체. datachannel 첫 메시지 유실 시 브로드캐스트 단독 경로는 배지가 비므로 durable 쪽이 DB 여야 한다.

- 2026-08-12 Claude(Opus 5) — **P2 PASS(패스 1)**. `src/features/room/voiceRecorder.ts` 신규(stageRecorder 의 WebAudio 믹스만 승계, 캔버스·rAF·배경로드 제거 · 입력 0개여도 무음 트랙으로 shape 고정 · 원본 트랙 stop 안 함) + `useRoomRecording` `kind` 분기(**음성 모드는 `stageEl` 부재가 실패 사유 아님**) + `lib/rooms.ts` `RecordingKind`·`startRoomRecording(kind)`·목록에 `kind`/`file_size_bytes`. U3 2단 수신 배선(broadcast `recording_consent.kind` → `kindRef`/`activeKind`, 늦입장 DB 동기 `select(..., kind)`). **디코드 실측 7/7**: `audio/webm;codecs=opus` · **오디오 디코드 11,496B > 0** · **비디오 디코드 0** · `videoWidth/Height 0×0` · 2초 15.4KB(≈67.8kbps → **5분 약 2.5MB로 목표 3MB 충족**). `check:all` exit 0(229). 하네스는 scratchpad(앱 의존 아님) — stageRecorder 선례대로 미커밋.

- 2026-08-12 Claude(Opus 5) — **P3 조건부 PASS(패스 1)**. U1 HostConsole 시작 버튼 2개(idle)→진행 중 1개 접힘 · U2 신규 4키 + `host.recordTitle` 값 정정 · U3 배지/하단바 `kind` 배선 · U4 `<audio>` 분기 + 다운로드 앵커 + 목록 종류/길이/용량 · U5 `.touch-target`·`aria-label`. **실렌더 30/30**(scratchpad `ux-probe.mjs` — vite 변환 TSX 를 실제 index.css 위에 마운트, 360 터치 에뮬 + 1440): 버튼 2개·접힘·문구(`🎙음성 녹음`/`⏺녹화`/`녹음 정지`)·`<audio>`=1 `<video>`=0·다운로드 href·목록 `🎙 5:00 · 2.3MB`/`🎬 1:00 · 114.4MB`·**360 터치 44px·1440 30px(계약상 데스크톱 밀도 유지)**·가로 오버플로 0. `check:all` exit 0(229)·lint clean·i18nCoverage 4/4.
  - **프로브 오판 1건 자체정정**: 첫 실행이 44px FAIL 을 냈으나 `.touch-target` 은 `@media (pointer: coarse)` 전용(index.css:521)이라 데스크톱 30px 가 계약대로다 — 프로브에 터치 에뮬레이션을 넣어 재판정(코드 무결).
  - **360px 스크린샷에서 실결함 1건 발견·수정**: 섹션 제목이 `무대 녹화`인데 그 아래 `음성 녹음` 버튼이 서 있었다 → `방 녹화·녹음`(ko/en/ja 값 정정, 신규 키 아님).
  - **이월(P4 배포 게이트)**: U3 비호스트 배지·U4 다운로드 **바이트 일치**는 살아있는 방과 실 R2 가 필요하다. `tests/e2e/` 에 로컬 livekit 하네스가 없고(과거 하네스는 scratchpad 폐기 관례) 로컬 R2 는 더미라 여기서 못 닫는다 — **P4 프로드 라이브에서 판정**한다. 서버측 `kind` 전파는 P1 통합 15/15 로 이미 증명됨.

- 2026-08-12 Claude(Opus 5) — **P4 PASS(패스 1) — 배포 완료**. ①프리플라이트: `check:all` exit 0 · `deno check` clean · `_shared` 무변경 확인(전 함수 스윕 불요). ②백엔드: `migration list` 로 **원격 미적용은 내 것 1건뿐** 확인 후 `db push`(exit 0) → **프로드 psql 실측**(`kind` text·default `'stage'`·NOT NULL · CHECK `('stage','voice')`) · `functions deploy start-room-recording` 단건 → `functions list` **v12 · 2026-08-12 01:12 갱신**, 나머지 녹화 4종은 08-10 그대로(범위 격리 확인). ③프론트: build exit 0 · **번들 비밀키 감사 7종 CLEAN(히트 0)** · CF Pages `chatterbox` main 배포 · curl 3종 200(`/`·asset·`/lobby`) · 배포 번들에 신규 문구 7종 실존(ko/en/ja + `recBadgeVoice` + 제목 정정). ④라이브: **프로드 통합 15/15** + **실 R2 왕복 12/12** — voiceRecorder 산출 23,852B webm 을 프로드 presign PUT 200 → complete ready → presign GET → **sha256 동일(97a9b98c…)**, `file_size_bytes` 기록·보존 90일 세팅·**5분 환산 2.27MB < 3MB**. 테스트 방/행/계정 finally 정리. LiveKit 방 접속 0(무료분 차감 없음).
  - **P3 이월분 1건 해소**: U4 "다운로드 바이트 일치" → 위 실 R2 sha256 동일로 닫힘.
  - **미검증 잔여 1건(정직 표기)**: U3 **비호스트 REC 배지의 라이브 렌더**. 살아있는 방에 2계정이 붙어야 재현되는데 `tests/e2e/` 에 로컬 livekit 하네스가 없다. 근거는 확보돼 있다 — 서버 `kind` 전파(P1·P4 통합 15/15), 배지 분기 코드(tsc·lint clean), 배포 번들에 `recBadgeVoice` 실존. **남은 것은 렌더 1회 눈확인뿐**이며, 다음 룸 2탭 세션에 붙인다.

- 2026-08-12 Claude(Opus 5) — **P3 이월분 전량 해소 · 골 완주**. `/마감` ⓪ 감사 단계에서 **내 이전 판정이 틀렸음을 발견** — "로컬 livekit 하네스 부재"는 `CLAUDE.md:58` 의 경로 오류(`tests/e2e/helpers/`)를 그대로 믿은 것이고, **실경로 `tests/integration/helpers/livekit-local.mjs` 에 하네스가 존재**한다(ISS-16 이 LOAD-DOC-PATH 로 이미 기록해둔 함정 — 이로써 **2회째 오도**). 이월로 남기지 않고 즉시 2탭 라이브로 검증.
  - **U1 라이브 PASS**: 실제 방 호스트 콘솔에 시작 버튼 2개(`["stage","voice"]`).
  - **U2 라이브 PASS**: 비호스트 동의 모달이 "녹음하려 해요"로 고지(녹화 아님) + **"화면은 저장되지 않아요" 실존**.
  - **U3 라이브 PASS**: 비호스트 배지 `data-rec-kind=voice` · 표기 `REC🎙` · `aria-label="녹음 중"`.
  - **계약 정정 1건**: U2 표의 ko/en/ja 문안을 구현된 실제 문구(기존 녹화 문구 "…하려 해요" 어조 승계)로 맞춤 — 표가 이상론이고 코드가 현실이었다.
  - **하네스 한계 기록(재현 필수 지식)**: `routeLiveKitLocal` 은 **브라우저 토큰만** 로컬로 돌린다 — Edge 의 `broadcastData` 는 여전히 클라우드로 나가므로 **서버발 broadcast 를 타는 경로(동의 요청·REC 배지)는 로컬 livekit 으로 검증 불가**다. 이 검증만 `E2E_CLOUD_LK=1`(참가자-분 소수 소모, 최종 확인 용도)로 돌렸다.
  - **잔여 관찰(내 슬라이스 무관)**: 방 입장 직후 짧은 창에서 호스트 게이트 Edge 호출이 403 을 낸다(`list-room-members` "방 참가자만" · `create-room-recording-upload` "호스트만"). DB 는 그 시각에도 `state=connected` 2행 — 즉 서버 데이터가 아니라 **클라 호출 타이밍 레이스**다. 2.5s 대기를 넣으면 사라진다. 무변경 함수들이라 이번 슬라이스 원인 아님 → 백로그로 승급 권고.

## 참조 문서

- `docs/contracts/VoiceRecording.md` — 이 골의 계약 (P1/P2 범위·MUST NOT)
- `docs/schema/02-content-and-economy.md` §1.11 `recordings` / §1.11.1 `user_storage_quota`
- `docs/specs/SecurityPolicies.md` §11.1.1 — 녹화 동의 게이트
- `docs/status/ROOM-BACKLOG.md` V-3 — 무대 합성 녹화 as-built(승계 대상)
