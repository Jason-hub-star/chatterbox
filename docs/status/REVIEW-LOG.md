---
tags: [status]
---

<!--
  REVIEW-LOG — 리뷰/검수 증거 로그 (append-only).
  진행로그(GAP-MATRIX)와 분리: 여기는 "무엇을 리뷰했고 무엇이 진짜였나"의 증거 축.
  규칙: 서브에이전트(페이블 등) 리뷰는 메인(Opus)이 ground truth로 대조 후 판정 — 맹종 금지.
  각 항목: 날짜 · 대상 · 리뷰어(모델) · 발견 · 판정(진짜/오탐) · 조치.
-->

# REVIEW-LOG — 리뷰 증거 로그

> 최신순. 서브리뷰는 "검증 후 반영"이 원칙 — 오탐 기각·제안코드 버그도 기록한다.

## 2026-07-02 · blendshape 전송 — 페이블 리뷰 1패스 + Opus 대조

- **대상**: 코덱/송수신/훅/배선(위 자기리뷰와 동일 파일). 페이블(diversity, 주인님 요청) 3건 + 안전목록(seq·isNewerSeq·byteOffset·프루닝·스로틀·콜백ref·StrictMode·고빈도ref = 모두 안전 확인, Opus와 일치).
- **P0 "CRC-16 표준 불일치" → 오탐(기각)**: 페이블이 검증 벡터를 혼동. `"123456789"` → **0x29B1 = CRC-16/CCITT-FALSE(init 0xFFFF)** = 내 코드 값 = 정답. 0x31C3은 **XMODEM(init 0x0000)** 값. 게다가 crc16은 **송·수신 동일 함수**(같은 모듈)라 "양단 계산 상이" 시나리오 자체가 불가(외부 상호운용 없음). 이중 오탐. → 회귀 가드로 표준 벡터 테스트(`crc16('123456789')===0x29B1`) 추가.
- **P1 "NaN/Inf 미검증" → 진짜(반영)**: 페이블 근거(MediaPipe가 NaN 생성·PixiJS 무한루프)는 부실 — MediaPipe blendshape은 [0,1] 정규화값이고 onFrame은 얼굴 감지 시에만 발화, 무한루프도 아님. **그러나 핵심은 타당**: `decodeBlendshapeFrame`은 신뢰 불가 원격 경계인데 유한성 검증 부재 → crc 맞는 NaN 프레임(손상·악의 peer)이 `s += (NaN-s)*a`로 EMA 상태 **영구 오염**(이후 정상 프레임도 NaN 고정). 코드 주석("디코드는 반드시 검증")과도 모순. → `Number.isFinite` 드롭 + 테스트(NaN·Inf) 반영.
- **P2 "browRaise /2" → 오탐(기각)**: 이 feature 코드 아님 — 기존 `toFaceParams`(웹캠 실사용자 확인·테스트 존재). `/2`는 평균 아니라 `Math.min(1,…)` 클램프된 **의도적 게인**(눈썹 blendshape는 1.0 도달 드묾). 결함 아님.
- **게이트**: test 30/30(코덱 13)·tsc0·lint클린·docs:check PASS.
- **교훈**: 표준 CRC 판정은 "이름"이 아니라 **검증 벡터**로 — init값(0x0000=XMODEM vs 0xFFFF=CCITT-FALSE)이 같은 poly에서도 결과를 가른다. 서브리뷰의 "표준" 주장도 ground truth(테스트 벡터) 대조 후 반영.

## 2026-07-02 · blendshape 표정 전송(LiveKit DataChannel) — Opus 자기리뷰

- **대상**: `blendshapeCodec.ts`(220B 프레임·crc16·seq)·`useLiveKitRoom`(송수신)·`useFaceTracking`(onFrame)·`AvatarLayer`/`RemoteAvatar`·`RoomPage` 배선.
- **seq stale → 재입장 프리즈 (진짜)**: `lastSeq` Map을 참가자 퇴장 시 안 지워 같은 identity 재입장(새로고침 등) 시 상대 seq가 1로 리셋되는데 `isNewerSeq(옛높은값,1)=false` → 새 프레임 전부 드롭 → 아바타 프리즈. `RoomPage`에 참가자 목록 변화 시 부재 identity의 lastSeq 프루닝 effect 추가. 반영.
- **계약 정합(진짜·문서정정)**: MILESTONES가 blendshape을 `reliable`로 적었으나 SSOT(WebRTC.md)는 `unreliable/lossy`(30Hz 표정은 reliable 시 head-of-line 블로킹). 계약대로 unreliable 구현 + MILESTONES 문구 정정.
- **확인(오탐 아님)**: 고빈도 프레임이 React state를 안 거치는지 — 수신 콜백은 ref Map만 만지고 `.update()`만 호출(setState 없음) → 리렌더 폭주 없음. 콜백 ref 갱신은 렌더가 아닌 effect에서(react-hooks/refs 준수). crc16/길이 검증으로 손상·비정상 원격 페이로드 드롭(네트워크 경계 성역).
- **실증**: 헤드리스 2계정·2탭 E2E — A→B·B→A 양방향, 극단 표정 송신 시 상대 원격 아바타 영역 픽셀 diff PASS + 스샷 육안(눈감음·입벌림·눈썹) 정확 반응·콘솔에러0. 단위 11건(라운드트립·crc손상·byteOffset·seq순환) 추가(총 28).

## 2026-07-02 · 아리아/Storage 통합 보안 — 페이블 1패스 + Opus 대조

- **대상**: `?project=` URL 로드, 공개 Storage 버킷, iframe 카메라/중첩, crossOrigin/CORS, service_role 격리.
- **페이블(diversity 목적, 주인님 요청)**: MEDIUM 1건 + 나머지 안전 확인.
  - **MEDIUM `?project=` 임의 URL 로드** (LOW→MEDIUM 격상): 신뢰 도메인 링크로 임의 project JSON+이미지 로드 → DoS/트래킹/디페이스. XSS 아님(모든 DOM 삽입 `escapeHtml`)·자격증명 탈취 아님(무자격 fetch·crossOrigin anonymous) — 페이블도 확인.
  - XSS/자격증명/공개버킷/iframe allow/service_role → 모두 안전 확인(Opus 자기리뷰와 일치).
- **Opus 대조**: MEDIUM 격상 타당(즉시 수정 채택). **단 페이블 제안코드 버그 발견** — `import.meta.env.VITE_SUPABASE_URL`은 `public/` 정적파일(Vite 번들 미처리)에서 `undefined` → 그대로면 깨짐.
- **조치(반영)**: `public/aria-player/src/main.js`에 origin 화이트리스트 — `*.supabase.co` 또는 동일오리진만 허용(정적파일용으로 import.meta.env 안 씀). **양방향 검증**: 헤드리스에서 Storage URL 허용(렌더 PASS)·`evil.example.com` 차단(fatal "허용되지 않은 project URL origin"). iframe `allow`는 microphone 제거(camera만).

## 2026-07-02 · 표정 트래킹/아리아 통합 — Opus 자기리뷰 (규칙: 최상위 메인 직접)

- **useFaceTracking 리소스 누수 (진짜)**: `getUserMedia`/`createFaceLandmarker`가 cleanup 이후 resolve 시 카메라 안 꺼짐(StrictMode/빠른 언마운트) → cancelled 가드 강화(track.stop()/landmarker.close()). 반영.
- **MediaPipe 모델 URL 404 (진짜·근본원인)**: 문서(MediaPipeConfig.md)의 `mediapipe-tasks/vision/...`가 404 → 정본 `mediapipe-models/.../float16/1/`로 코드+문서 5곳 정정. 헤드리스로 TRACKING 도달 확인.

## 2026-07-02 · 채팅(ROOM-05) — 페이블 리뷰 #2

- **판정**: 클린. 유효 1건(cosmetic) — 새 메시지 자동 스크롤 없음 → `listRef`+`useEffect` 반영. SDK API(publishData/DataReceived) 정확 확인.

## 2026-07-02 · LiveKit 음성 PoC(auth/room) — 페이블 리뷰 #1

- **판정**: 4건 중 3.5건 **오탐**(Opus가 설치 SDK 2.20 실타입 대조로 기각).
  - autoplay "블로커" 오탐(SDK가 esm.mjs:13388서 autoplay=true 설정) · TrackSubscribed 3-param "컴파일실패" 오탐(tsc 통과) · detach().forEach "MEDIUM" 오탐(RemoteAudioTrack.detach()는 HTMLMediaElement[] 반환) · `RoomEvent.ConnectionLostError` 제안은 2.20에 없는 API라 반영 시 오히려 파손.
  - 유효 1건: `livekit.ts` 에러 바디 파싱 — 반영.
- **교훈**: 서브리뷰(같은 티어 포함)는 반드시 ground truth 대조 후 반영. 맹종하면 없는 API를 넣어 깨뜨린다.
