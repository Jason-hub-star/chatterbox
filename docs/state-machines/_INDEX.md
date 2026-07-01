---
tags: [fsm]
---

# STATE-MACHINES — 12개 상태 머신

> 설계: Room·Participant·Avatar·Script·Auth·WebRTC·HostAuthority·Vgen·Onboarding·Tracking·StageMode·DubSession
> Updated: 2026-06-29
> Related: contracts/_INDEX.md, DATA-SCHEMA.md, PLATFORM-ARCHITECTURE.md
<!-- opencode: 2026-06-29 - DubSession 상태머신 추가 (C6·G-15 DONE). Coded with OpenCode; high-cost model review recommended. -->

---

## 목적

This document defines the core state machines governing room lifecycle, participant connection, avatar rendering, script synchronization, and real-time networking in snack-web. Each state machine is a blueprint for implementing the corresponding Zustand store logic, LiveKit event handlers, and Supabase Realtime listeners. Developers should reference the "Implementation Hints" section when wiring state transitions in code.

---

## 상태머신 목록 (12개)

| 파일 | 상태 머신 | 주요 상태 |
|---|---|---|
| [Room.md](Room.md) | Room Lifecycle | IDLE → CREATING → WAITING → LIVE → ENDED |
| [Participant.md](Participant.md) | Participant Connection | JOINING → CONNECTED → ACTIVE/MUTED → LEFT |
| [Avatar.md](Avatar.md) | Avatar Render | UNLOADED → LOADING → READY → RENDERING |
| [Script.md](Script.md) | Script Cue Sync | IDLE → LOADED → CUE_ACTIVE → SYNCING → ENDED |
| [Auth.md](Auth.md) | Authentication | UNAUTHENTICATED → AUTHENTICATING → AUTHENTICATED ⇄ REAUTHENTICATING |
| [WebRTC.md](WebRTC.md) | LiveKit Connection | DISCONNECTED → CONNECTING → CONNECTED ⇄ RECONNECTING |
| [HostAuthority.md](HostAuthority.md) | Host Commands | IDLE → SELECTING → BROADCASTING → CONFIRMED |
| [Vgen.md](Vgen.md) | Vgen Job (VGEN-01~12) | IDLE → PROMPT_EDITING → MODERATING → GENERATING → DONE ⇄ FORMAT_CONVERTING |
| [Onboarding.md](Onboarding.md) | Onboarding Flow | ENTRY → TRACK_A/B/C → GREEN_ROOM → COMPLETED |
| [Tracking.md](Tracking.md) | MediaPipe Tracking [개발 예정] | UNSUPPORTED / IDLE → INITIALIZING → CALIBRATING → TRACKING |
| [StageMode.md](StageMode.md) | Main View Mode | NORMAL ⇄ VGEN / NORMAL ⇄ DUB |
| [DubSession.md](DubSession.md) | DUB Session Lifecycle (DUB-01~05) | IDLE → UPLOADING → UPLOADED → TRANSCRIBING → READY → RECORDING → COMPOSITING → COMPLETED |

---

## 새 상태머신 추가 절차

새 기능이 **고유한 생명주기**(초기화 → 활성 → 종료 등 2단계 이상의 상태 전이)를 가지면 이 파일에 상태머신을 추가한다.

```
① 이 파일(state-machines/)에 새 섹션 추가 (상태 다이어그램 + 전환 테이블 + 엣지 케이스)
② DATA-SCHEMA.md PENDING에 필요한 테이블/컬럼 체크박스 추가
③ contracts/_INDEX.md 해당 컴포넌트 계약에 상태 의존 명시
   예: "stateStore.xyzState: 'IDLE' | 'ACTIVE' | 'DONE' 읽기"
④ 구현 후 Implementation Hints 업데이트
```

**추가 불필요한 경우:** boolean 하나로 표현되는 토글(on/off), 단순 로딩 상태(`isLoading`)는 상태머신 없이 store 필드로 충분.

---

## Integration Checklist

When implementing a state machine:

- [ ] Add Zustand store slice with actions for all transitions
- [ ] Register Supabase Realtime listeners in `useEffect` (cleanup on unmount)
- [ ] Register LiveKit event handlers in `useEffect` (cleanup on disconnect)
- [ ] Add error boundaries around state mutation to prevent frozen UI
- [ ] Test state transition order (e.g., is CREATING state finalized before WAITING is entered?)
- [ ] Document timeout values (e.g., 10s JOINING timeout, 30s inactive cleanup)
- [ ] Log state transitions to Sentry for production monitoring
- [ ] Add toast/banner notifications for user-visible state changes (e.g., "Host muted you")
- [ ] Test with network throttling (DevTools) and browser offline mode

---

## 한줄정리

snack-web의 12개 상태머신(룸·참가자·아바타·스크립트·인증·WebRTC·호스트권한·VGen·온보딩·추적·StageMode·DubSession)을 명시하는 설계 문서로, Zustand store·LiveKit event·Supabase Realtime을 연결하는 구현자의 청사진을 제공한다.
