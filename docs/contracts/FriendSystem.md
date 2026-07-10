---
tags: [contract]
---

# FriendSystem

친구 추가/제거, 팔로우/언팔로우, 차단 기능을 통한 관계 관리 시스템. P1 성장 루프 기본 (친구 목록, 온라인 상태, 함께한 사람 추천).

> **as-built (2026-07-10, PROFILE-04/05 코어 — 커밋 `7b81d9a`·`1c5106d`):**
> **IA(주인님 확정, LoL식)**: 관리 거점은 **로비 광장 상시** — `FriendsButton`(벨 옆)→패널(온라인 초록점·광장/공연 중·요청 수신함·최근 함께한 사람에서 추가/팔로우). 별도 FriendListPage/라우트 없음.
> **구현**: 마이그 `20260710150000_create_friendships`(계약 스키마 그대로) + Edge 5(send/respond/remove·set-follow·list-friends) + `friendStore`+`usePresence` + NotificationBell 3타입(friend_request/friend_accepted/followed_creator_stream_start).
> **presence 재설계(2026-07-10 델타 감사 DP-1 — 커밋 `3c34e6d`)**: 초기 전역 Realtime presence 채널(`friends_presence`)이 네트워크 레벨에서 전체 온라인 유저 `{users.id, activity}`를 아무 로그인 유저에게 노출 → **폐기**. 대체: 본인 `users.last_active_at` heartbeat(30s, `usePresence`) + `list-friends`가 **친구관계 검증 후** 각 친구의 online(last_active<60s)·activity(활성 room_participants=room) 반환 → 전역 노출 0·계약 MUST NOT("차단자 온라인 노출") 구조적 준수. 트레이드오프: 실시간→준실시간(패널 열린 동안 15s 폴링). NotificationBell 공연시작 클릭은 방 상태 재검증 후 분기(UX-2, `ebd9bd5`).
> **계약 대비 편차**: ①RLS 는 `auth.uid()` 직비교 대신 `current_user_id()`(users.id≠auth_id 분리) ②쓰기 정책 미부여=Edge(service) 전용 — 차단·rate-limit(요청 30/일·팔로우 50/일)·미러 행(수락 시)을 서버 강제 ③타인 display_name·presence 는 users RLS(본인만) 때문에 `list-friends` Edge 가 해석(전역 노출 0) ④공연시작 알림은 rooms 'live' 전환 FSM 미구현이라 **create-room 시점** 발송(캡 10/시간·팔로워 ≤200, live FSM 구현 시 이동) ⑤`friend_joined`(온라인 전환 알림)은 서버 훅 부재로 defer ⑥**차단(user_blocks)은 defer** — 소비 UI(프로필 페이지 슬라이스)와 함께(G-84 게이트 포함), 죽은 스키마 방지 ⑦presence 에 roomId 미포함(비공개 방 노출 방지 — 공개방 판별 seam 후 따라가기).

## Props Interface

```typescript
interface FriendListProps {
  userId: string;
  loading?: boolean;
  error?: string;
}

interface FriendActionProps {
  targetUserId: string;
  action: 'add_friend' | 'remove_friend' | 'block' | 'unblock' | 'follow' | 'unfollow';
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface FriendStatusBadgeProps {
  userId: string;
  showPresence?: boolean; // 온라인 상태 표시
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|---|---|---|---|---|
| `userStore` | `userId` | ✓ | | 현재 사용자 |
| `friendStore` | `friends`, `followers`, `blocked`, `onlinePresence` | ✓ | ✓ | 친구/팔로우/차단 목록 + 온라인 상태 |
| `relationshipStore` | `pendingRequests`, `requestStatus` | ✓ | ✓ | 친구 요청 대기 중 상태 |

## 데이터 규칙

- `friendships` 테이블: `(user_id, friend_id, relationship_type, created_at, status)` — 양방향 기록 (A→B와 B→A 별도 행)
- `relationship_type`: `'friend'|'follow'` (차단은 `user_blocks` 테이블에서만 관리)
- `status`: `'pending'|'accepted'|'rejected'`
- 친구 추가 = `relationship_type='friend'` + `status='pending'` → 상대 수락 시 `'accepted'`
- 팔로우 = `relationship_type='follow'` + `status='accepted'` (즉시 승인, 상호 팔로우 아님)
- 차단 = `user_blocks` 테이블 INSERT (`blocker_user_id`, `blocked_user_id`) — 차단 대상은 나를 찾을 수 없고, 방에 함께 입장할 수 없음
- 삭제 = `friends` 행 soft delete (30일 유예 후 영구 삭제)

## DataChannel

없음. FriendSystem은 REST API + Supabase Realtime (presence) 사용.

```typescript
// Realtime presence 구독 예
const subscription = supabase
  .channel('friends_presence')
  .on('presence', { event: 'sync' }, (payload) => {
    // friendStore.setOnlinePresence(payload)
  })
  .subscribe();
```

## 이벤트 흐름

```
[친구 목록 진입 또는 프로필 카드]
  ↓
친구 요청:
  - "친구 추가" → friendships INSERT (status='pending')
  - 상대가 수락 → status='accepted' + 양쪽 목록 갱신
  - 상대가 거절 → status='rejected' + 요청 제거
  ↓
팔로우:
  - "팔로우" → friendships INSERT (relationship_type='follow', status='accepted')
  - 알림 전송 (G-266):
    * `friend_joined`: 친구가 온라인 상태로 전환될 때 발송
      - 저장 위치: `users.notification_prefs.friend_joined` (boolean toggle, SettingsPage 탭 8에서 관리)
      - 알림 본문: "OOO가 온라인 상태가 되었습니다"
    * `followed_creator_stream_start`: 팔로우한 크리에이터(relationship_type='follow')가 방을 'live' 상태로 바꿀 때 발송
      - 저장 위치: `users.notification_prefs.followed_creator_stream_start` (boolean toggle, SettingsPage 탭 8에서 관리)
      - 알림 본문: "OOO가 지금 공연을 시작했습니다!"
      - 트리거: rooms.status UPDATE 'live' 시, rooms.host_id에 대해 following 관계가 있는 모든 user_id에 notification 생성
  ↓
차단:
  - "차단" → user_blocks INSERT (blocker_user_id, blocked_user_id)
  - 차단 대상 → 나를 찾을 수 없음 + 초대 불가 + 방 입장 불가 (livekit-edge-fn.md G-84 차단 게이트, SecurityPolicies.md §2.2 user_blocks 정책 준용)
```

## MUST NOT

- ❌ 차단 관계를 양방향으로 인정 (차단은 단방향: 차단자만 인지)
- ❌ `friendships` 테이블의 `relationship_type`에 `'blocked'` 값 사용 — 반드시 `user_blocks` 테이블 사용
- ❌ 친구 요청 대기 중에 바로 채팅/초대 권한 부여
- ❌ 차단된 사용자의 온라인 상태를 차단자에게 노출
- ❌ 차단된 사용자가 나와 같은 방에 입장할 수 있도록 허용 (livekit-edge-fn.md G-84 차단 게이트에서 `user_blocks` 테이블 검증)
- ❌ 친구/팔로우 목록을 캐시만 사용, 서버 재검증 없음 (RLS 필수)

## Supabase 스키마

### friendships 테이블

```sql
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  friend_id UUID NOT NULL REFERENCES users(id),
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('friend', 'follow')),  -- 'blocked' 제거: user_blocks 테이블에서만 관리
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  
  CONSTRAINT no_self_friendship CHECK (user_id != friend_id),
  UNIQUE(user_id, friend_id, relationship_type)
);

CREATE INDEX idx_friendships_user_id ON friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX idx_friendships_status ON friendships(status);
```

### RLS 정책

```sql
-- 친구 목록 조회 (본인 + 공개 설정한 사용자만)
CREATE POLICY "select_friendships"
  ON friendships FOR SELECT
  USING (
    auth.uid() IN (user_id, friend_id)
    OR (
      relationship_type = 'follow'
      AND friend_id = auth.uid()
      AND (SELECT profile_visibility FROM users WHERE id = user_id) = 'public'
    )
  );

-- 친구 요청/추가
CREATE POLICY "insert_friendships"
  ON friendships FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 상태 업데이트 (상대방이 수락/거절할 수 있음)
CREATE POLICY "update_friendships"
  ON friendships FOR UPDATE
  USING (user_id = auth.uid() OR friend_id = auth.uid())
  WITH CHECK (
    (user_id = auth.uid() AND status IN ('pending', 'rejected', 'accepted'))
    OR (friend_id = auth.uid() AND status IN ('accepted', 'rejected'))
  );
```

## 관련 문서

- `../FEATURE-SPEC.md` — PROFILE 섹션 친구/팔로우 항목
- `../GAP-MATRIX.md` — G-196, G-197 친구/팔로우 시스템 갭
- `../specs/SecurityPolicies.md` — §2.2 RLS 정책 `user_blocks` 테이블 + 차단(block) 정책
- `../specs/livekit-edge-fn.md` — §4, G-84 차단 게이트: `user_blocks` 테이블 검증
- `../DATA-SCHEMA.md` — §1.20 `user_blocks` 테이블, `friendships` 테이블 CHECK 제약
- `ProfilePage.md` — 친구 목록 UI 진입점
