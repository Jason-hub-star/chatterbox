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
