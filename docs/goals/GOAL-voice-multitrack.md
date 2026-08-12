# GOAL-voice-multitrack — 참가자별 로컬 원본 트랙 (ROOM-28 P2a)

## 골 한 줄

음성 녹음에서 참가자 각자의 **로컬 원본 마이크 트랙**을 따로 남겨 개별 다운로드까지 되게 한다 — verified by 2탭 라이브에서 참가자 2명의 트랙 2행이 `submitted` 로 쌓이고 각 오브젝트가 sha256 왕복 일치, while preserving P1 믹스·동의 게이트·`kind='stage'` 무회귀. details in docs/goals/GOAL-voice-multitrack.md

## 1. Outcome

- `recording_tracks` 테이블이 프로드에 존재하고 `unique(recording_id, participant_id)` 가 강제된다.
- 음성 녹음 중 **동의한 참가자 전원**이 자기 `getUserMedia` 원본을 로컬 녹음해 각자 업로드한다.
- 다시보기에서 음성 녹화 행을 펼치면 **참가자별 트랙 목록**(이름·길이·용량)이 보이고 각각 다운로드된다.
- 트랙 오브젝트를 내려받은 바이트가 원본과 **sha256 일치**한다.
- **P1 믹스가 그대로 남는다** — 듣기용(믹스)과 편집용(트랙)이 동시에 존재.
- 동의하지 않은 참가자의 트랙은 **생성되지 않는다**(행 0 · `getUserMedia` 미호출).

## 2. Verification surface

| 단계 | 명령 | 기대 |
|---|---|---|
| 정적 | `npm run check:all` | exit 0 |
| Edge | `deno check --node-modules-dir=auto supabase/functions/{create-recording-track-upload,submit-recording-track}/index.ts` | clean |
| 스키마 | psql — 테이블·UNIQUE·CHECK·RLS 정책 | 전건 존재 |
| 통합 | `tests/integration/voice-multitrack.mjs`(신규) | 비멤버 403 · **미동의자 업로드 발급 412** · presign 200 · 제출 후 `submitted` · **같은 참가자 2회 제출 = 행 1개**(unique) · 타 참가자 키 프리픽스 위조 403 |
| **실동작** | 2탭 라이브(`E2E_CLOUD_LK=1` — 서버발 broadcast 경로라 로컬 livekit 불가) | **트랙 2행 submitted** · 각 `start_offset_ms` 기록 · 오브젝트 sha256 왕복 일치 |
| UX | 360px 실렌더 | 트랙 목록 펼침·다운로드 앵커·오버플로 0 |

## 3. Constraints (후퇴 금지)

- **P1 무회귀** — 호스트 믹스는 그대로 생성/재생/다운로드된다. `voiceRecorder.ts` 수정 금지.
- **`kind='stage'` 무대 녹화 무회귀** — 트랙 수집은 `kind='voice'` 에서만 동작.
- **동의 게이트** — 동의 전 `getUserMedia` 호출 금지(계약 P2 MUST NOT). 서버도 412 로 막는다.
- **신규 store 0** — 트랙 상태는 `useRoomRecording` 훅이 계속 소유.
- LiveKit 무료분: 개발은 로컬, **broadcast 경로 검증만** `E2E_CLOUD_LK=1` 로 짧게.
- `check:all` 그린 · i18n ko/en/ja 완역.

## 4. Boundaries

**허용**: `supabase/migrations/`(신규 1) · `supabase/functions/{create-recording-track-upload,submit-recording-track,get-recording-track-url}/`(신규 3 — **경계 수정 2026-08-12**: 트랙 다운로드에 presign GET 이 필요한데 `get-recording-url` 은 금지 목록이라 수정 대신 신규로 낸다) · `src/features/room/trackRecorder.ts`(신규) · `useRoomRecording.ts` · `lib/rooms.ts` · `HostConsole.tsx`(목록 펼침) · `src/i18n/locales/{ko,en,ja}.ts` · `docs/schema/02-content-and-economy.md` + 재동결 3종(마이그와 같은 커밋)

**금지**: `voiceRecorder.ts`·`stageRecorder.ts`(P1 회귀) · `supabase/functions/_shared/`(전 함수 재배포) · 기존 녹화 Edge 5종 · DUB 계열

## 5. Iteration policy

| # | Phase | 완료 판정 |
|---|---|---|
| Q0 | 스키마 — `recording_tracks` + 재동결 | psql(테이블·UNIQUE·RLS) · `docs:check` |
| Q1 | Edge 2종 | `deno check` clean · 통합(412·403·unique) |
| Q2 | 클라 트랙 레코더 + 자동 수집/제출 | 2탭 라이브 **트랙 2행 submitted** |
| Q3 | UX — 목록 펼침 + 개별 다운로드 | 360px 실렌더 · sha256 왕복 |
| Q4 | 배포 + 프로드 라이브 | `functions list` 갱신 · 프로드 트랙 왕복 |

무진전 3패스면 blocked.

## 6. Blocked stop condition

- 동의하지 않은 참가자의 트랙이 생성되는 경로가 발견되면 **즉시 정지**(프라이버시 P0)
- `unique(recording_id, participant_id)` 가 리테이크 경로와 충돌해 행이 중복되면 → 스키마 결정이 틀린 것, 계약부터 재수렴
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실

## 7. ⚠️ 주인님 승인 게이트 (에이전트가 단독으로 "완료" 선언 못 함)

이 골은 **자동 증거만으로 가치 판정이 안 되는 항목이 둘** 있다. 아래 둘은 실행 에이전트가 통과 처리하지 않고 **반드시 주인님 확인을 받는다.**

| # | 항목 | 왜 자동으로 못 하나 |
|---|---|---|
| A1 | **음질이 실제로 나은가**(P1 믹스 대비) | 헤드리스는 가짜 마이크의 합성음을 녹음한다. 바이트·비트레이트는 재도 "사람 목소리가 더 낫게 들리나"는 못 잰다 |
| A2 | **기기 간 싱크가 쓸 만한가** | 한 대에서 여러 탭을 띄우면 **클럭을 공유해 드리프트가 0으로 나온다**(ISS-16 의 "한 대 6탭=교란" 함정과 동종). 실제 여러 기기가 필요하다 |

에이전트는 §1~§6 을 증거로 닫은 뒤 **"A1·A2 미판정"** 을 명시해 보고한다. 이 둘이 나쁘면 P2 는 채택하지 않고 되돌린다(P1 믹스만으로 충분).

## 8. 실행 기록

- 2026-08-12 Claude(Opus 5) — 계약 P2 절 작성(`contracts/VoiceRecording.md` §P2 설계) + 이 브리프. **P2a 로 범위 확정**(트랙 수집·다운로드까지 / 인앱 리테이크는 P2b): 리테이크 UI 는 `DubRecorder` 급이고 **트랙이 남는 것이 그 전제조건**이라 순서가 이쪽이 먼저다. 근거 실측: `DubRecorder.tsx:188` 이 이미 `getUserMedia` 로컬 원본 패턴 · `dub_tracks` 가 트랙 테이블 선례. 구현 미착수.

- 2026-08-12 Claude(Opus 5) — **Q0 PASS**: 마이그 `20260812120000_recording_tracks.sql` + 스키마 모듈 §1.11.2 + 재동결(`812dac9b`→`d89fa1d3`). psql 실측: 11컬럼 · **UNIQUE(recording_id, participant_id)** · CHECK(status) · FK 2종 CASCADE · RLS 활성 + SELECT 정책 1(방 참가자만).
- 2026-08-12 Claude(Opus 5) — **Q1 PASS**: Edge 2종 신규(`create-recording-track-upload`·`submit-recording-track`). **통합 12/12**: 비참가자 403 · kind=stage 409 · **미동의자 412 + 행 미생성**(프라이버시 게이트) · 키가 서버 규칙 그대로 · 같은 참가자 2회 발급 = 행 1개 · 제출 후 submitted · `start_offset_ms` 기록 · **트랙 없는 사람 제출 404** · 2인 submitted_count=2 · recording 삭제 시 CASCADE 0. `deno check` clean.
  - **설계 개선 1건**: 제출 API 가 **storage key 를 아예 받지 않는다**(대상 행을 `recording_id` + 인증된 `participant_id` 로만 찾음) — 계약이 요구한 "프리픽스 검증"보다 강하다. 위조할 입력 자체가 없다.
- 2026-08-12 Claude(Opus 5) — **Q2 코드 완료(라이브 미검증)**: `trackRecorder.ts` 신규(`getUserMedia` **로컬 원본**·우리가 연 스트림이라 stop 시 트랙 정지=마이크 표시등 잔존 방지) + `useRoomRecording` 배선 — 호스트는 `startCapture` 에서, 비호스트는 `recording_started` 수신에서 시작하고 `recording_done`·정지에서 마감(업로드→제출). **동의 이중 방어**: `iConsentedRef`(동의 클릭 시에만 true → 늦입장자는 false 라 `getUserMedia` 미호출) + 서버 412. 트랙 실패는 전부 삼켜 **믹스 경로와 독립**(마이크 거부 1명이 방 녹음을 못 막게). tsc·lint clean.
- 2026-08-12 Claude(Opus 5) — **Q3 코드 완료(라이브 미검증)**: `get-recording-track-url` 신규(**경계 수정** — `get-recording-url` 이 무변경 대상이라 확장 대신 신규) + `fetchRecordingTracks`/`getRecordingTrackUrl` + HostConsole 음성 행에 `[트랙]` 접이식 목록(이름·길이·용량 + 개별 다운로드) + i18n 2키 ko/en/ja. `check:all` exit 0(229).
  - **⚠️ Q2·Q3 는 정적 게이트만 통과했다.** 앱의 `VITE_SUPABASE_URL` 이 프로덕션이라 **Edge 3종을 배포하기 전에는 2탭 라이브(트랙 2행 submitted·sha256 왕복)를 돌릴 수 없다.** Q4 배포 후 한 번에 판정한다 — 그전까지 Q2·Q3 를 PASS 로 적지 않는다.

## 참조 문서

- `docs/contracts/VoiceRecording.md` §범위 · §P2 설계 — 이 골의 계약
- `docs/goals/GOAL-voice-recording.md` — P1(믹스) 완주 기록
- `src/features/dub/DubRecorder.tsx` — 로컬 원본 캡처·업로드·제출 패턴 원본
