---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->

# 2. Onboarding State Machine

## 구현 현황 (as-built · 2026-07-13)

> 이 문서는 **설계 상한(ceiling)** 이다. 아래 표/다이어그램은 의도된 풀 플로우고, 현재 구현은 **최소 슬라이스**만 실현했다. 다음 세션은 이 섹션을 먼저 읽어라.

**실현됨 (G-ONB, 커밋 `1b099e4`):**
- `OnboardingGuide`(`src/features/onboarding/OnboardingGuide.tsx`) — 로비(`LobbyPage`) 위 Modal 2단: 환영 → 장르 선택(`ROOM_GENRES`, `preferred_genres` 기록) → 완료. 별도 `/onboarding/*` 라우트·GREEN_ROOM 게이트 통합·INTRO 영상은 **없음**.
- 노출 게이트: `userStore.onboardingStep ∈ {'intro','genre'}` 일 때만. 완료/건너뛰기 → `completeOnboarding()` 이 `onboarding_step='done'`(+선택 장르) 직접 UPDATE(users_update_own, 새 Edge 없음).
- 신규 가입자 진입: `handle_new_user` 트리거가 **가입 시** `onboarding_step='intro'` 로 심는다(마이그 `20260713170000`).

**설계와의 의도적 divergence (중요):**
- 설계는 `step=NULL` = "신규 유저 → INTRO"(아래 전이표·라우트가드 `INTRO guard: step===null`). **as-built 는 `step=NULL` = 기존/레거시 유저 → 가이드 미노출**로 뒤집었다. 이유: 기존 322명 유저가 전부 `onboarding_step=NULL`(컬럼 미소비 상태)이라, NULL=신규 로 잡으면 전원에게 가이드가 폭격된다. backfill 마이그 대신 "신규만 트리거로 intro" 로 우회 — 기존 유저 무영향(psql 실측 322명 NULL 유지).
- 따라서 아래 **전이표의 `step=NULL` 행들은 설계 의도이며 as-built 아님**. 라우트가드 기반 풀 플로우(트랙 A/B/revisit·GREEN_ROOM 5게이트·speaker/face 검증·analytics 이벤트·Settings "온보딩 다시보기" G-57)는 **미구현(defer)**.
- OAuth 신규유저: 현 prod OAuth 미설정이라 무영향. 설정 시 첫 로그인 intro 세팅은 후속(트리거는 email/OAuth 무관하게 auth.users INSERT 시 발화하므로 실은 커버됨 — 재검증 후속).

## State Diagram

```
┌──────────────────┐
│  UNAUTHENTICATED │
└────────┬─────────┘
         │ login / register / invite link click
         ▼
      ┌──────┐
      │ AUTH │
      └─┬────┘
        │
   ┌────┼───────────┐
   │    │           │
 (A)  (재)        (B)
Invite방문      Direct/Email
Link   User      Signup
   │    │           │
   │    ▼           ▼
   │  ┌─────────┐ ┌───────┐
   │  │ LOBBY   │ │ INTRO │
   │  │(skip)   │ │       │
   │  └────┬────┘ └───┬───┘
   │       │          │
   │       │    ┌─────▼──────┐
   │       │    │GENRE_SELECT│
   │       │    └────┬────────┘
   │       │         │
   │       └────┬────┘
   │            ▼
   │         ┌─────────┐
   │         │ LOBBY   │
   │         └────┬────┘
   │              │
   └──────┬───────┘
          ▼
      ┌───────────┐
      │GREEN_ROOM │ (gate: avatar + webcam + face + mic + speaker)
      │(auth gate)│
      └─────┬─────┘
            │ "무대로 나가기" clicked
            ▼
         ┌────────┐
         │IN_ROOM │
         └────────┘
```

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| UNAUTHENTICATED | AUTH | User logs in | `authStore.signIn()` | `users.onboarding_step` = NULL / existing value |
| UNAUTHENTICATED | AUTH | User registers (email/social) | `authStore.signUp()` | New user: `users.onboarding_step` = NULL |
| UNAUTHENTICATED | AUTH | User clicks invite link | Preserve `/lobby?invite={invite_code}` then login | `onboardingStore.pendingInviteCode` stored before AUTH; room_id is returned only by `verify-invite-code` |
| AUTH | INTRO | Track B user (new, direct signup) | Route guard `onboarding_step === NULL` | Sets `onboardingStore.track = 'B'`; DB `onboarding_step` still NULL |
| AUTH | INTRO | User clicks "온보딩 다시보기" in Settings (G-57) | `onboardingStore.requestOnboardingRestart()` | Sets `onboardingStore.restart_requested = true`; navigate to /onboarding/intro |
| AUTH | LOBBY | Track A user (invite link) | Route guard `pendingInviteCode` is set | Sets `onboardingStore.track = 'A'`; skips INTRO/GENRE |
| AUTH | LOBBY | Re-visit user | Route guard `onboarding_step === 'lobby' \| 'done'` | Sets `onboardingStore.track = 'revisit'`; skips all screens |
| INTRO | GENRE_SELECT | User completes intro (5s auto or next button) | `onboardingStore.completeIntro()` | Updates `users.onboarding_step` = 'intro' |
| INTRO | LOBBY | User clicks skip (재시청 모드일 시) | `onboardingStore.skipIntro()` (G-57) | 재시청 사용자는 GENRE 스킵 후 LOBBY로 직진 가능; `restart_requested = false` 리셋 |
| GENRE_SELECT | LOBBY | User selects genre(s) (1-3) | `onboardingStore.selectGenres()` → `users.preferred_genres` | Updates `users.onboarding_step` = 'genre' |
| LOBBY | GREEN_ROOM | User clicks room card / joins existing room | `roomStore.joinRoom(roomId)` or creates new room | `users.onboarding_step` = 'lobby' (not yet 'done') |
| GREEN_ROOM | GREEN_ROOM | User toggles avatar / webcam / mic | `trackingStore.selectAvatar()` / media toggles | No DB update; local state only |
| GREEN_ROOM | GREEN_ROOM | Face validation updates | `trackingStore.setFaceValid(true/false)` | When `is_face_valid = true`, checks other gates. On failure, offer explicit voice-only actor or viewer downgrade |
| GREEN_ROOM | IN_ROOM | User passes all gates + clicks "무대로 나가기" | `onboardingStore.completeOnboarding()` | Updates `users.onboarding_step` = 'done'; LiveKit connect |
| IN_ROOM | LOBBY | User leaves room (back button / room ENDED) | `roomStore.leaveRoom()` | `onboarding_step` stays 'done' |
| LOBBY | LOBBY | Re-visit user re-enters platform | Session restored | No state change; remains in 'done' state for future |

## Edge Cases

1. **Invite Link Expired / Invalid**
   - Invite link checked before AUTH; if expired, show toast "초대 링크가 만료되었습니다"
   - User can proceed with direct signup (track B) or login (revisit)
   - Store: `onboardingStore.pendingInviteCode = null` on expiry validation failure

2. **Network Disconnect During INTRO / GENRE_SELECT**
   - Onboarding screens run offline-first (UI data only)
   - DB update (onboarding_step) only at INTRO→GENRE and GENRE→LOBBY transitions
   - User refresh: local `userStore.onboarding_step` checked first; if mismatch with DB (via hydration), show warning and re-sync

3. **Camera / Microphone Denied in GREEN_ROOM**
   - Camera denied/unsupported: `trackingStore.is_face_valid=false`, show retry plus downgrade choices.
   - If microphone works, user may choose `voice-only actor`: create/keep `room_participants.role='actor'`, set `is_tracking_failed=true`, render static avatar + voice.
   - If microphone is also denied, actor entry stays disabled and user can only enter as `viewer`.
   - Viewer downgrade sets `room_participants.role='viewer'`, `role_source='fallback_no_camera'`; route skips GreenRoom and enters Viewer Gate.

4. **Tab Closed & Re-open (Mid-Onboarding)**
   - Case 1: INTRO/GENRE_SELECT phase → localStorage `onboardingStore` persists track/progress (20min TTL)
   - Case 2: GREEN_ROOM phase → `roomStore.reconnectRoom()` triggered; participant record still exists
   - Case 3: IN_ROOM phase → reconnect via LiveKit SDK; full room state restored
   - **No "go back" — always forward**: if user returns, navigate to last stored room/screen

5. **Rapid State Transitions (e.g., skip genre, click lobby twice)**
   - Debounce `onboardingStore` actions (300ms)
   - Stale API responses ignored if `requestId` mismatch
   - Toast: "잠시만요..." during in-flight requests

6. **Split Auth (Social + Email)**
   - User signs up with Google → track B path → completes intro/genre
   - Later, same user logs in with email → `users.onboarding_step = 'genre'` (already past intro)
   - Route guard: skip INTRO, go directly to GENRE (or LOBBY if already there)
   - No double-induction

7. **Speaker Test Fails (No Sound)**
   - Playback initiated; user indicates "듣지 못했습니다" → retry
   - If repeated fail: warning "스피커를 확인해주세요" but allow proceed (accessibility)
   - Log to analytics for support follow-up

8. **Background Scene Selection Timeout**
   - Scene list loads from API (optional feature)
   - If API fail after 5s, hide scene picker; user proceeds with default background
   - Do not block gate on scene data

## Implementation Hints

- **Route guards** (React Router + `<ProtectedRoute>`):
  - Check `userStore.onboarding_step` + `onboardingStore.track`
  - INTRO guard: `step === null && !pendingInviteCode && !isRevisit`
  - GENRE guard: `step === 'intro'`
  - LOBBY guard: `step in ['genre', 'lobby', 'done'] || pendingInviteCode || isRevisit`
  - GREEN_ROOM guard: `step in ['lobby', 'done']` (joining a room)
  - Viewer Gate guard: `role === 'viewer' || isMobileDevice || anonymous guest`; never require face/mic gates

- **Store synchronization**:
  - `userStore.onboarding_step` (Zustand): mirrors `users.onboarding_step` from Supabase on session init
  - `onboardingStore.track` (Zustand): 'A' | 'B' | 'revisit' — set once on AUTH, immutable for session
  - `onboardingStore.pendingInviteCode` (Zustand): set before redirect to login, cleared after `verify-invite-code` returns room_id and LOBBY join succeeds
  - `trackingStore.is_face_valid` (Zustand): updated real-time; not persisted to DB until GREEN_ROOM exit

- **Database update timing**:
  - `users.onboarding_step = 'intro'` after INTRO screen completion (or auto-advance after 5s)
  - `users.onboarding_step = 'genre'` after genre selection; `users.preferred_genres` updated atomically
  - `users.onboarding_step = 'lobby'` when joining/creating room from LOBBY screen
  - `users.onboarding_step = 'done'` only after GREEN_ROOM gates passed + entering IN_ROOM
  - Use Supabase `UPDATE users SET ... WHERE id = $1` with `onConflict` handling

- **Track-specific messaging** (useOnboardingMessages hook):
  - Track A: "아바타를 선택해주세요" (no genre prompt)
  - Track B: "좋아하는 장르를 선택해주세요 (최대 3개)"
  - Revisit: skip all education prompts; show "다시 돌아왔네요 :)" brief tooltip

- **Progressive re-visitor feature**:
  - On LOBBY first load for revisit user: show one-time tooltip for new features (e.g., "분장실에서 스피커 테스트가 추가됐어요")
  - Store tooltip view state in `localStorage` under `revisitTooltips_${userId}` (30day TTL)
  - Only show each tooltip once per user

- **Error recovery**:
  - All async operations (signIn, selectGenres, joinRoom, face validation) should emit `onboardingStore.setError(msg)` on failure
  - Display error in toast; do NOT auto-transition state
  - Provide explicit "다시 시도" button (re-trigger same action)

- **Accessibility & mobile**:
  - GREEN_ROOM gates must support keyboard nav (tab → avatar → webcam → mic → speaker → next)
  - Intro/genre screens responsive to mobile; buttons min 48px
  - Face detection (WebRTC) may require HTTPS; test on staging before prod

- **Analytics events**:
  - `onboarding_start` (track, source)
  - `intro_completed`, `genre_selected` (genres array), `room_joined`
  - `greenroom_gate_passed` (face_valid, mic_level, speaker_tested)
  - `onboarding_completed` (total_duration_s, track, room_id)
  - `onboarding_abandoned` (last_step, reason)
