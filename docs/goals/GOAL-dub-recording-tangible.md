# GOAL-dub-recording-tangible — 더빙 녹음을 "체감되게": 마이크 실시간 피드백 + 영상 즉시반영 미리보기

## 골 한 줄
녹음 단계에서 마이크 입력이 실시간 시각화되고(레벨미터/파형) 녹음 직후·누적으로 원본 영상에 얹어 재생되어 사용자가 "녹음이 되는지·결과가 어떤지"를 그 자리에서 체감 verified by 헤드리스 Chrome(가짜 마이크) 실렌더 + check:all, while preserving 기존 더빙 파이프라인·DubRecorder.md 계약 MUST NOT·ffmpeg 최종합성 경로. details in docs/goals/GOAL-dub-recording-tangible.md

## Context (왜)
프로드 도그푸딩(주인님 관측): **녹음 단계에서 마이크가 잡히는지·녹음이 되고 있는지 확인할 길이 없고**, 녹음 결과가 영상에 어떻게 붙는지 그 자리에서 안 보여 녹음이 막막함. 요청: "녹음이 영상에 바로바로 대입되는 걸 경험하면 녹음이 쉬워질 것 같다. 실시간 가능한가? 영상 편집기 같은 툴이 메인창에 있어야 하나?"

**SSOT 대조(`docs/contracts/DubRecorder.md`):** 계약은 이미 풍부한 녹음기(메인뷰 원본영상+타임라인+"내 차례" 배너+비프+±200ms 캘리브레이션+로컬백업)를 명세하나, 현 실장(`src/features/dub/DubRecorder.tsx`)은 "MVP·나머지 ponytail defer(G-283)"로 **최소 버전만 배선**(오른쪽 `<audio>` + 트랙 리스트, 제출 전 미리보기). 즉 주인님 요청 상당수가 **이미 SSOT에 있고 미구현일 뿐** → 새 설계가 아니라 **SSOT 갭 채우기 + α(신규: 마이크 실시간 시각화·녹음 즉시 영상반영 미리보기)**.

**판정:** 핵심 2개(마이크 실시간 피드백·영상 즉시반영)는 **중간 규모·전부 브라우저 내·ffmpeg 불필요**(미리보기는 재생, 최종 다운로드만 ffmpeg). "실제 멀티트랙 영상 편집기(파형 드래그·트림)"만 **대설계**로 범위 밖(별도 goal). Phase 2 로 이미 센터 MainView에 원본영상+자막·현재 세그먼트 하이라이트가 들어가 있어 "메인뷰 영상" 토대는 완성.

## 1. Outcome (이진 판정) — 2026-07-17 주인님 결정 4건 반영
- **P1 마이크 실시간 시각화**: 녹음 중 마이크 입력 레벨미터가 실시간으로 움직인다(입력 있으면 값 변화·무음 지속 시 경고). "마이크가 잡히는지" 즉시 확인.
- **P2 녹음 로컬모드 + 즉시 미리보기** *(결정: 영상 보면서 녹음)*: 녹음 시작 → 센터 MainView 영상이 해당 세그먼트 시작점으로 이동해 음소거 재생(내 화면만 — vodSync 일시 해제 "로컬 모드"), 구간 끝 도달 시 정지 유도. 정지 즉시 같은 로컬 창에서 방금 녹음한 오디오+영상이 자동 동기 재생 → 제출/재녹음 후 동기 복귀.
- **P3 누적 더빙 시사회** *(결정: 센터 공유 재생 — 전원이 같이 봄 + 멤버 게이트 완화)*: 호스트가 "지금까지 더빙 ▶" → vodSync 공유 타임라인으로 방 전원의 센터 영상이 재생되고, **각 멤버의 브라우저가** `get-dub-recordings`(게이트: 호스트→방 활성 멤버, 대상: synced→submitted+synced 로 완화·재배포)로 트랙 오디오를 받아 각자 start_ms(+calibration) 에 스케줄해 얹는다. 개인 미리보기가 아니라 다같이 시사회.
- **P4 SSOT 갭** *(결정: 이번 루프에 포함)*: "내 차례" 배너(현재 재생위치가 내 트랙 구간이면 표시) + ±200ms 캘리브레이션 슬라이더(스키마 `dub_tracks.calibration_offset_ms` 이미 존재 — 저장 경로만 소형 Edge 확장).
- 각 기능이 헤드리스 실렌더로 동작(아래 §2).

## 2. Verification surface
- 명령: `npm run check:all` → tsc·lint·test(i18nCoverage 포함)·build·docs 전부 PASS.
- 명령: `deno check` (서버 변경 시에만 — 이 골은 대부분 프론트).
- 실렌더(헤드리스 Chrome + 가짜 마이크 `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`):
  - P1: 녹음 시작 후 `analyser.getByteTimeDomainData(arr)` 결과가 정적이 아님(입력 파일 재생 중 값 변동) → 레벨미터 DOM 값 변화 캡처.
  - P2/P3: 미리보기 재생 시 `video.currentTime` 진행 + 스케줄된 오디오가 소리남(AudioContext 상태·스케줄 콜 수 검증) + 시각적 스크린샷.
- 아티팩트: 이 브리프의 §6 기술설계대로 구현된 컴포넌트 + `qa` 스크린샷(선택).

## 3. Constraints (후퇴 금지)
- 기존 더빙 e2e(업로드→STT→번역→역할→동의→녹음→합성) green 유지 · check:all 159/159 불하락.
- **DubRecorder.md MUST NOT 준수**: 원본 영상 음성 재생 금지(`muted`)·본인 마이크만(다른 참가자 믹싱 금지)·미리보기 없이 저장 금지·역할잠금 중 역할변경 금지.
- **ffmpeg 최종합성 경로 불변**: 미리보기는 별개 재생 레이어, 다운로드용 완성본은 여전히 `lib/ffmpeg.ts mixAndMux`. 미리보기 ≠ 최종물.
- **에코 방지**: 마이크 AnalyserNode 는 `destination` 에 연결하지 않는다(모니터링 아웃 금지 — 하울링/이중음성). 녹음 중 원본은 `muted`.
- **새 의존성 최소(ponytail)**: 레벨미터·스케줄 재생은 네이티브 Web Audio 로 구현(무의존). wavesurfer.js 는 파형/편집기 확장이 필요해질 때만 도입(§6 대안).
- i18n(en/ja/ko 완역)·반응형 게이트 준수.

## 4. Boundaries
- 허용: `src/features/dub/*`(DubRecorder·DubPanel·신설 프리뷰 컴포넌트) · `src/stores/dubStore.ts` · `src/features/stage/MainView.tsx`(로컬모드·시사회 배선) · `src/i18n/locales/*` · `src/lib/`(오디오 유틸 신설 가능) · **Edge 소형 변경 2건 허용(주인님 승인 2026-07-17)**: `get-dub-recordings` 게이트 완화(멤버+submitted) · 캘리브레이션 저장 경로.
- 금지/범위 밖: **멀티트랙 영상 편집기**(파형 위 드래그·클립 트림·컷) = 별도 대설계 goal. 신규 마이그 0(`calibration_offset_ms` 는 기존 컬럼 재사용). 화자 자동분리·서버합성 무관.

## 5. Iteration policy
- Phase 순서: P1(레벨미터) → P2(녹음후 즉시 미리보기) → P3(누적 미리보기) → P4(내 차례 배너·캘리브레이션, 여력 시).
- 각 phase: 구현 → check:all → 헤드리스 실렌더 검증 → 자기리뷰 → 다음. phase 사이 정지 가능.
- 무진전 3패스(오디오 자동재생 정책·동기 드리프트 미해결)면 blocked.

## 6. 기술 설계 + 조사한 예제 코드 (레퍼런스 기반)

### 6-A. 마이크 실시간 레벨미터/파형 (P1) — 네이티브 Web Audio, 무의존
`getUserMedia` 스트림 → `AnalyserNode`. **destination 미연결(에코 방지).** rAF 루프에서 `getByteTimeDomainData`(파형) 또는 `getByteFrequencyData`(레벨바). `Uint8Array`는 1회 생성·재사용.
```js
const ctx = new AudioContext()
const analyser = ctx.createAnalyser()
analyser.fftSize = 2048                       // 파형; 레벨바만이면 256
const buf = new Uint8Array(analyser.frequencyBinCount)  // = fftSize/2, 재사용
const src = ctx.createMediaStreamSource(stream)
src.connect(analyser)                         // ⚠️ analyser.connect(ctx.destination) 하지 않음(모니터 아웃=하울링)
function tick() {
  raf = requestAnimationFrame(tick)
  analyser.getByteTimeDomainData(buf)         // 128=무음 기준, 편차=입력세기
  const level = buf.reduce((m, v) => Math.max(m, Math.abs(v - 128)), 0) / 128  // 0..1 레벨
  setLevel(level)                             // 막대/파형 렌더
}
```
- 기존 `DubRecorder.startRec` 의 `getUserMedia` 스트림을 그대로 AnalyserNode 에 물리면 됨(MediaRecorder 와 병존 — 같은 stream 공유).
- 정리: 녹음 stop 시 `cancelAnimationFrame` + `ctx.close()`.

### 6-B. 녹음 즉시/누적 영상 미리보기 (P2·P3) — AudioBufferSourceNode 스케줄, 무의존·ffmpeg 불필요
녹음 blob 을 `decodeAudioData` 로 `AudioBuffer` 화 → 원본 영상(muted) 재생 + 각 트랙을 자기 offset 에 `start(when, offset)` 스케줄. **모든 스케줄 시간은 `ctx.currentTime` 기준.** video↔ctx 좌표를 재생 시작점에서 매핑.
```js
// 누적 미리보기: 영상 0부터 재생 + 각 트랙을 start_ms(+calibration) 에 발화
async function playPreview(video, tracks /* {buffer, startMs, calMs} */) {
  const ctx = new AudioContext()
  video.muted = true; video.currentTime = 0
  const base = ctx.currentTime + 0.1                 // 약간의 리드타임
  const baseVideoMs = 0
  for (const t of tracks) {
    const node = new AudioBufferSourceNode(ctx, { buffer: t.buffer })  // 1회용 — 재생마다 새로 생성
    node.connect(ctx.destination)
    const whenMs = t.startMs + (t.calMs ?? 0) - baseVideoMs
    node.start(base + Math.max(0, whenMs) / 1000)
  }
  await video.play()
}
```
- 핵심(MDN): `AudioBufferSourceNode` 는 1회용 — 재생마다 새 노드, `AudioBuffer` 는 재사용(디코드 1회). `start(when, offset)` 의 offset 으로 클립 중간부터도 가능.
- 드리프트: 짧은 클립(현 25MB·수십초)은 단발 스케줄로 충분. 긴 클립·seek/pause 대응은 재스케줄(후속). P2 는 "그 구간만" 재생(video.currentTime=startMs 로 seek 후 단일 트랙 스케줄)이라 더 단순.
- Phase 2 로 이미 있는 센터 MainView `<video>` 를 재사용(별도 플레이어 신설 최소화) — dubStore 에 "미리보기 재생중" 플래그를 두고 MainView 가 원음 뮤트+스케줄 오디오를 얹는 형태 검토.

### 6-C. 라이브러리 대안 — wavesurfer.js Record 플러그인(선택, 편집기 확장 대비)
`wavesurfer.js` + Record 플러그인은 녹음 중 **라이브 파형**(scrolling/continuous)과 `record-end`(Blob)을 제공. 파형 위 리전(구간) 편집으로 확장하기 쉬움 → 후속 "편집기 대설계"의 토대. 단 **신규 의존성**이라 이 골(체감 최소구현)엔 네이티브 Web Audio 우선, wavesurfer 는 편집기 단계에서 재검토.

## 7. 실행 기록 (실행 에이전트가 기록)
- 2026-07-17 설계(메인/Opus): 브리프 작성 + 웹 레퍼런스 조사(§8). 구현 미착수 — 주인님이 "설계문서만" 선택. 다음: 승인 후 P1부터 phase-loop.
- 2026-07-17 설계 확정(주인님 결정 4건): ①미리보기 무대=센터 공유 재생(전원 시사회, 개인 미리보기는 녹음 로컬모드에 한정) ②녹음 중 센터 영상 구간 자동재생(음소거·로컬모드) ③P3 접근=방 멤버 전체+submitted 포함(get-dub-recordings 게이트 완화·재배포) ④P4까지 완주. phase-loop 착수.
- 2026-07-17 **P1 PASS**: MicLevelMeter(AnalyserNode·destination 미연결·무음 2.5s 경고) DubRecorder 배선 + i18n 3로케일. `check:all` exit 0(159/159·drift 0) + 헤드리스 실렌더 2종 — 비프 wav: 미터 max 91/100·distinct 9·경고 없음 / 무음 wav: level 0·경고 표시. 중지→미리보기 UI 등장(정리 경로 무크래시). 스크린샷 육안 확인(g9-p1-tone.png).
- 2026-07-17 **P2 PASS**: dubStore.localMode + lib/dubPreview.ts(AudioBufferSourceNode 스케줄·버퍼 캐시·DEV 훅) + MainView(로컬모드 진입/복귀·vodSync 발행/수신/하트비트 3중 게이트·REC/미리보기 배지·구간끝 정지) + DubRecorder(startRec(track)→record 모드, stop→preview 자동재생, submit→해제). `check:all` exit 0 + 헤드리스 12어서션 전부 ok — 시크 4.34s≈3680ms·구간끝 정지·중지 즉시 재시크+스케줄 {scheduled:1, running}·제출 후 위치 복원·트랙 submitted 실측. 스크린샷 육안(g9-p2-preview.png).
- 2026-07-17 **P3 PASS**: get-dub-recordings 게이트 완화(호스트→활성멤버·synced→submitted+synced·calibration 동봉) **배포 v13(14:47 실측)** + dubStore.screening + SEC-RA-1 HOST_CLIENT_TYPES 에 dub_screening(호스트 identity 게이트 상속) + RoomPage 발행/수신 + MainView 시사회 스케줄·토글·배지 + 녹음 진입 시 시사회 이탈. `check:all` exit 0·deno check clean. 실증 — API: 호스트 200(submitted 포함)·멤버 200(calibration 필드)·비멤버 403 / 2탭: 호스트 토글→양쪽 배지+{scheduled:1,running}·B 위치 추종(1.7s↔1.6s)·중지→양쪽 해제·멤버에 토글 버튼 비노출. 스크린샷 육안(g9-p3-memberB.png). 알려진 한계(주석 명시): 늦은 입장자는 신호 미수신 — 호스트 재토글로 합류.
- 2026-07-17 **P4 PASS**: MainView 내차례 배너(dubStore.myTurnRanges — DubPanel 이 내 미제출 트랙 구간 파생) + DubRecorder ±200ms 슬라이더·[다시 미리보기](localMode.calMs 재재생)·제출 시 calibration 전송 + submit-dub-track 서버 클램프 ±200 **배포 v10(14:56 실측)** + DubCompositor 합성 cue 에 cal 동일 적용(미리보기=완성본 싱크 일치, adelay 0 클램프). `check:all` exit 0·deno clean. 실증 5/5 — 배너: 미제출 구간 표시·제출 구간 비표시·다음 미제출 구간 재표시 / 캘리브레이션: 재미리보기 cals=[200] 훅 실측·제출 후 DB calibration_offset_ms=200. 스크린샷 육안(g9-p4-cal.png). (첫 실행 1회 flake = 하네스 고정 4s 대기 — 폴링으로 견고화, 제품 결함 아님. create-room 429 는 테스트 계정 교체로 우회.)
- **완료 판정(2026-07-17)**: 재현됨 — P1~P4 전부(§2 검증 표면 그대로: check:all + 헤드리스 가짜마이크 실렌더 + 프로드 Edge 2종 배포 실측). 근사 — 비호스트 시사회 오디오는 자기 시계 스케줄(영상만 vodSync 보정, seek 시 오디오 미추종·±200ms 허용오차 내). 막힘 — 없음. 남은 불확실 — 늦은 입장자 시사회 하트비트(후속).
- 2026-07-18 **bepo 완료**: 프리플라이트 check:all exit 0 → CF Pages `--branch main` 배포(함정 재확인: branch 누락 시 프리뷰만 갱신·별칭 MISMATCH) → 별칭 `index-DpVmQqc7.js` **로컬 dist byte-identical**·curl root/asset/deep 200·번들 시크릿 6종 clean·`__dubPreviewStats` 프로드 번들 0건(DEV 게이트 실증) → **배포판 스모크 8/8**(가짜마이크: 레벨미터 0→59 변동·REC 배지·구간 시크·재미리보기 배지·제출→DB submitted+cal=200(v10 경유)·배너 3게이트). create-room 429 는 테스트 계정 b 교체로 우회.

## 8. 참조 문서 / 레퍼런스
- SSOT: `docs/contracts/DubRecorder.md`(메인뷰 레이아웃·MUST NOT) · `docs/state-machines/DubSession.md`(RECORDING) · `DATA-SCHEMA §1.13 dub_tracks`(calibration_offset_ms) · `docs/contracts/DubCompositor.md`(최종합성).
- 현 실장: `src/features/dub/DubRecorder.tsx` · `src/features/stage/MainView.tsx`(Phase 2 센터영상) · `src/stores/dubStore.ts` · `src/lib/ffmpeg.ts`.
- 웹 레퍼런스(조사):
  - MDN — [Visualizations with Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API) (AnalyserNode 레벨미터/파형 canonical)
  - MDN — [AnalyserNode.getByteFrequencyData()](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData)
  - MDN — [AudioBufferSourceNode.start()](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start) (when/offset 스케줄·1회용 노드)
  - [wavesurfer.js Record plugin](https://wavesurfer.xyz/docs/plugins/record/) (라이브 파형·record-end Blob — 편집기 확장 대안)
  - 참고 글: [Measuring audio volume in JavaScript (Jim Fisher)](https://jameshfisher.com/2021/01/18/measuring-audio-volume-in-javascript/) · [Real-time Microphone Level Meter (dev.to)](https://dev.to/tooleroid/building-a-real-time-microphone-level-meter-using-web-audio-api-a-complete-guide-1e0b)
