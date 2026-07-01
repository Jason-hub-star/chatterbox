---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- 스택: Supabase room_participants, roomStore, react-router, MobileViewer -->

# 31. ViewerGate

`/rooms/:id` 진입 시 role·디바이스를 판정해 올바른 뷰로 분기하는 라우트 가드 로직.
시각적 컴포넌트가 아닌 **판정 + 리다이렉트 레이어**. (ONBOARDING-FLOW.md §뷰어게이트 연계, G-158)

## 진입 조건 매트릭스

| 조건 | 판정 | 이동 경로 |
|---|---|---|
| 미로그인 + 초대 링크 있음 | 익명 읽기 전용 뷰어 허용 | `/rooms/:id?viewer=anon` → `MobileViewer(readOnly)` |
| 미로그인 + 초대 링크 없음 | 차단 | `/login?redirect=/rooms/:id` |
| 모바일 디바이스 (MOB-01) | 인증/초대 검증 후 뷰어 전용. 호스트 기능은 MVP에서 데스크톱 전용 | `MobileViewer` 또는 `desktop-required` |
| `room_participants.role = 'host'` | 호스트 | `RoomView` + `HostConsole` 활성 |
| `room_participants.role = 'actor'` | 배우 | `GreenRoom` → `RoomView` |
| `room_participants.role = 'viewer'` | 관람자 | `RoomView(viewer mode)` |
| 방 정원 초과 (`max_participants`) | 차단 | `LobbyPage` 에러 토스트 (`access_denied`) |
| 방 존재하지 않음 / 비공개 | 차단 | `LobbyPage` 에러 토스트 (`access_denied`) |

## Role 결정 로직

```typescript
async function resolveRole(roomId: string, userId: string | null): Promise<ViewerGateResult> {
  // [SECURITY] 1. 방 존재·공개 여부를 모바일/익명 판정보다 먼저 확인.
  //            ended·비공개 방은 어떤 경로로도 진입 불가.
  // [VUL-NEW-07] 방 미존재/종료를 'access_denied'로 통일 — 방 존재 여부 노출 방지
  const room = await supabase.from('rooms').select('id, status, max_participants, host_id, is_locked')
    .eq('id', roomId).single()
  if (!room || room.status === 'ended') return { redirect: 'lobby', error: 'access_denied' }

  // 2. 미로그인 처리. 모바일 판정보다 먼저 초대/방 권한을 닫는다.
  if (!userId) {
    const inviteCode = searchParams.get('invite')
    if (!inviteCode) return { redirect: 'login' }
    // [SECURITY] invite 파라미터 존재 여부가 아니라 실제 유효성을 서버에서 검증.
    //            가짜 ?invite=abc 로 익명 뷰어 등록 불가.
    // [VUL-NEW-01 수정] expected_room_id를 함께 전송해 cross-room 사용 방지.
    //   서버가 invite_code.room_id == expected_room_id 일치 여부를 검증한다.
    const { data: invite, error } = await supabase.functions.invoke('verify-invite-code', {
      body: { invite_code: inviteCode, expected_room_id: roomId }
    })
    if (error || !invite?.valid) return { redirect: 'login' }
    // [VUL-NEW-01] 응답의 room_id가 URL room_id와 일치하는지 이중 검증
    if (invite.room_id !== roomId) return { redirect: 'login' }
    // [POLICY] 익명 뷰어는 age_band 검증 대상 아님 — SecurityPolicies.md §1.6 참조, MVP 의도된 제한
    return { redirect: isMobile() ? 'mobile-viewer' : 'room', role: 'viewer', anonymous: true, readOnly: true }
  }

  // 3. 연령 확인. AuthPage에서 저장한 age_band이 없으면 먼저 age gate로 보낸다.
  const profile = await supabase.from('users').select('age_band, age_attested_at').eq('id', userId).single()
  if (!profile?.age_band || !profile?.age_attested_at) return { redirect: 'age-gate' }

  // 4. room_participants 조회
  const participant = await supabase.from('room_participants')
    .select('role, slot_index, raise_hand_at')
    .eq('room_id', roomId).eq('user_id', userId).maybeSingle()

  const deviceType = isMobile() ? 'mobile' : 'desktop'

  // 5. 호스트 판정 (room.host_id 우선). MVP 호스트 컨트롤은 데스크톱 전용.
  if (room.host_id === userId) {
    if (deviceType === 'mobile') return { redirect: 'desktop-required', role: 'host' }
    return { redirect: 'room', role: 'host' }
  }

  // 6. 기존 참가자 역할
  if (participant) {
    if (isMobile()) return { redirect: 'mobile-viewer', role: 'viewer' }
    return { redirect: participant.role === 'actor' ? 'green-room' : 'room', role: participant.role }
  }

  // 7. 정원 확인 + 신규 뷰어 등록 (원자적 처리)
  //    - is_locked=true  (잠긴방): accept-invite Edge Function 경유 (원자적, SEC-CAPACITY 준수)
  //    - is_locked=false (공개방): DB 레벨 원자적 INSERT-SELECT (VUL-02 TOCTOU 수정)
  if (room.is_locked) {
    const inviteCode = searchParams.get('invite')
    if (!inviteCode) return { redirect: 'lobby', error: 'access_denied' }
    const { data: joined, error: joinErr } = await supabase.functions.invoke('accept-invite', {
      body: { invite_code: inviteCode, room_id: roomId, device_type: deviceType, idempotency_key: roomId + userId }
    })
    if (joinErr) return { redirect: 'lobby', error: 'access_denied' }
    if (joined?.room_id !== roomId) return { redirect: 'lobby', error: 'access_denied' }
  } else {
    // [VUL-02 수정] 공개방: count 조회 + INSERT 분리(TOCTOU) 대신 단일 RPC로 원자적 처리.
    // DB 트리거 또는 join-public-room RPC가 current_participants < max_participants를
    // 트랜잭션 내에서 확인하고 INSERT한다. 0 rows 반환 시 정원 초과.
    const { error: joinErr } = await supabase.functions.invoke('join-public-room', {
      body: { room_id: roomId, idempotency_key: roomId + userId }
    })
    if (joinErr?.status === 409) return { redirect: 'lobby', error: 'access_denied' }
    if (joinErr) return { redirect: 'lobby', error: 'access_denied' }
  }
  return { redirect: isMobile() ? 'mobile-viewer' : 'room', role: 'viewer' }
}
```

## Props Interface

```typescript
interface ViewerGateProps {
  /** 진입 대상 room_id (URL param) */
  roomId: string;
  /** 초대 코드 (URL search param) */
  inviteCode?: string;
  /** 판정 완료 후 콜백 (테스트/스토리북 용) */
  onResolved?: (result: ViewerGateResult) => void;
}

type ViewerGateResult =
  | { redirect: 'room';         role: RoomRole; anonymous?: boolean }
  | { redirect: 'green-room';   role: 'actor' }
  | { redirect: 'mobile-viewer'; role?: RoomRole; anonymous?: boolean; readOnly?: boolean }
  | { redirect: 'desktop-required'; role: 'host' | 'actor' }
  | { redirect: 'age-gate' }
  | { redirect: 'login' }
  | { redirect: 'lobby'; error: 'access_denied' };

type RoomRole = 'host' | 'actor' | 'viewer';
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|---|---|---|---|---|
| `userStore` | `id`, `isAnonymous` | ✓ | | 사용자 식별·익명 여부 |
| `roomStore` | `currentRoomId`, `role` | | ✓ | 판정 결과 저장 |

## Supabase 접근

| 테이블 | 작업 | 비고 |
|---|---|---|
| `rooms` | SELECT id, status, max_participants, host_id | RLS: public_rooms 뷰 경유 |
| `room_participants` | SELECT role / INSERT viewer | 신규 뷰어 자동 등록 |
| (Edge Function) | `verify-invite-code(invite_code, expected_room_id?)` | room URL이 있을 때 expected_room_id 포함 cross-room 방지 (VUL-NEW-01) |
| (Edge Function) | `join-public-room(room_id, idempotency_key)` | 원자적 정원 확인 + INSERT (SEC-CAPACITY, VUL-02) |
| (Edge Function) | `accept-invite(invite_code, room_id, device_type, idempotency_key)` | 초대 수락 (원자적, SEC-CAPACITY). 서버 응답 role이 최종 진실 |

## 모바일 판정 기준 (MOB-01)

```typescript
function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || window.innerWidth < 768
}
```

- 모바일 = 권한 검증 후 `MobileViewer` 리다이렉트 (차단 에러가 아님)
- 태블릿은 `window.innerWidth` 기준으로 768px 미만만 모바일 처리

## 컴포넌트 관계

```
[react-router /rooms/:id]
  └─ <ViewerGate roomId={id} inviteCode={...}>
       ├─ resolveRole() — 비동기 판정
       │
       ├─ redirect: 'mobile-viewer' → <MobileViewer />
       ├─ redirect: 'green-room'    → <GreenRoom />
       ├─ redirect: 'room' (host)   → <RoomView> + HostConsole 활성
       ├─ redirect: 'room' (actor)  → <RoomView> + AvatarCanvas
       ├─ redirect: 'room' (viewer) → <RoomView> 트래킹 없음
       ├─ redirect: 'login'         → navigate('/login?redirect=...')
       └─ redirect: 'lobby' + error → navigate('/lobby') + toast
```

## Room FSM 전이 시점

ViewerGate 판정이 완료되면 Room FSM의 `CONNECTING` 상태로 전이한다.

| ViewerGate 결과 | Room FSM 전이 |
|---|---|
| `role: 'host'` | `IDLE → CONNECTING → HOSTING` |
| `role: 'actor'` | GreenRoom 통과 후 `IDLE → CONNECTING → ACTING` |
| `role: 'viewer'` | `IDLE → CONNECTING → VIEWING` |
| 에러 | FSM 전이 없음 (lobby 복귀) |

## 금지 사항 (MUST NOT)

- ❌ ViewerGate 없이 /rooms/:id 직접 진입 허용 (반드시 게이트 통과)
- ❌ 모바일에서 에러 메시지 표시 (MobileViewer로 조용히 리다이렉트)
- ❌ 모바일 판정을 인증/초대/age gate보다 먼저 실행
- ❌ host_id 판정을 room_participants.role로만 수행 (rooms.host_id 우선 확인)
- ❌ 모바일 호스트를 `MobileViewer(role='host')`로 보내기 — MVP 호스트 조작은 데스크톱 전용, 모바일 호스트는 `desktop-required`
- ❌ 정원 초과 시 RoomView 렌더 시도 (lobby 복귀 필수)
- ❌ 익명 뷰어에게 아바타·마이크 권한 요청
- ❌ 익명 뷰어에게 채팅/반응/투표 쓰기 권한 부여 — Supabase anonymous auth 기반 식별 모델이 구현되기 전까지 read-only
- ❌ 공개방(is_locked=false) viewer 등록 시 SELECT count → INSERT 분리 패턴 사용 — TOCTOU 레이스로 정원 초과 가능. `join-public-room` Edge Function 경유 필수 (SEC-CAPACITY 원자적 INSERT-SELECT)
- ❌ `/rooms/:id` 경로에서 `verify-invite-code` 호출 시 `expected_room_id` 누락 — cross-room 초대코드 재사용 가능 (VUL-NEW-01)
- ❌ 서버 응답의 `invite.room_id`와 URL `roomId` 불일치를 허용
- ❌ `room_not_found`·`room_full` 별도 에러 코드 반환 — 에러 통일로 방 존재/정원 정보 노출 방지 (VUL-NEW-07)

## 검증 체크리스트

- [ ] 모바일 UA + 좁은 뷰포트 양쪽에서 MobileViewer 리다이렉트 확인
- [ ] 미로그인 + 초대 링크 없음 → /login?redirect 보존 확인
- [ ] host_id 일치 시 HostConsole 활성 확인
- [ ] 정원 초과 시 room_participants INSERT 없이 lobby 복귀 확인
- [ ] RLS: room_participants INSERT는 본인 user_id만 허용

## join-public-room Edge Function (VUL-02 신설)

```typescript
// supabase/functions/join-public-room/index.ts
// 공개방(is_locked=false) viewer 입장 — 원자적 정원 확인 + INSERT
// 입력: { room_id: string, idempotency_key: string }
// 출력: 200 OK | 409 room_full | 404 not_found

// DB 레벨 원자적 처리 (SEC-CAPACITY):
// INSERT INTO room_participants (room_id, user_id, role)
// SELECT :room_id, :user_id, 'viewer'
// FROM rooms
// WHERE id = :room_id
//   AND status <> 'ended'
//   AND current_participants < max_participants
// ON CONFLICT (room_id, user_id) DO NOTHING
// → affected rows = 0이면 정원 초과 또는 방 종료 → 409
```

## 관련 문서

- `../ONBOARDING-FLOW.md` — 뷰어게이트 진입 흐름 전체
- `./MobileViewer.md` — 모바일 관람 전용 뷰
- `./GreenRoom.md` — 배우 입장 전 준비 단계
- `./LobbyPage.md` — 방 탐색·대기열
- `../state-machines/Room.md` — Room FSM 상태 정의
- `../GAP-MATRIX.md` G-158
