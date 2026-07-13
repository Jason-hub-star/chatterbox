## 0. Naming SSOT

마이그레이션 파일을 만들 때 이 섹션을 먼저 따른다. 목표는 테이블/컬럼 이름이 짧고, 읽자마자 뜻이 보이며, 같은 개념이 문서마다 다른 이름으로 번지지 않게 하는 것이다.

| 경계 | 규칙 | 예시 | 금지 |
|---|---|---|---|
| DB table | 복수형 `snake_case` | `rooms`, `room_participants`, `vgen_jobs` | `Room`, `roomParticipant`, `room_participant` |
| DB column | `snake_case`, FK는 `{entity}_id` | `room_id`, `user_id`, `host_id`, `background_url` | `roomId`, `owner`, `hostUser` |
| DB enum/status value | 짧은 lowercase | `waiting`, `live`, `ended`, `viewer` | `WAITING`, `in_progress`가 아닌 새 별칭 |
| Edge/API payload | DB와 같은 `snake_case` | `{ room_id, idempotency_key }` | `{ roomId }` |
| TypeScript props/store | `camelCase` | `roomId`, `roomStore.currentRoomId`, `stageStore.backgroundUrl` | `current_room_id`, `background_url` |
| DataChannel payload | wire format이므로 `snake_case` | `{ type: 'bg_change', payload: { background_url } }` | `{ backgroundUrl }` |

**Boundary rule:** DB/API/DataChannel은 `snake_case`, React/Zustand/컴포넌트 내부는 `camelCase`다. Supabase row를 store에 넣을 때만 mapper에서 변환한다.

```typescript
type RoomRow = { id: string; background_url: string | null; host_id: string }
type RoomState = { id: string; backgroundUrl: string | null; hostId: string }

function mapRoomRow(row: RoomRow): RoomState {
  return { id: row.id, backgroundUrl: row.background_url, hostId: row.host_id }
}
```

ponytail: DB 컬럼을 앱 camelCase에 맞추려고 quoted identifier를 쓰지 않는다. PostgreSQL 기본인 lowercase snake_case를 그대로 쓰고, 변환은 boundary mapper 한 곳에서 한다.

## 1. Supabase Database Tables

### 1.1 users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL UNIQUE,  -- Supabase Auth UID
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
    -- display_name: 글로벌 UNIQUE 없음 (닉네임 선점 방지)
    -- 동명이인 구분은 방 내 slot_index + display_name 조합으로 처리 (G-81)
    -- 빈 문자열 불가: CHECK (char_length(display_name) >= 1)
    -- 최대 20자: CHECK (char_length(display_name) <= 20)
  avatar_url TEXT,  -- profile picture URL (Supabase Storage)
  status TEXT DEFAULT 'offline',  -- active, online, offline, away
  is_admin BOOLEAN DEFAULT FALSE,  -- admin review / moderation console access
  language TEXT DEFAULT 'ko',  -- ko, ja, en
  timezone TEXT DEFAULT 'Asia/Seoul',  -- 사용자가 선택한 타임존 (IANA 포맷, G-82)
    -- UI 날짜 표시에만 사용; DB 저장은 항상 UTC
  onboarding_step TEXT DEFAULT NULL,  -- NULL | 'intro' | 'genre' | 'lobby' | 'done'
  preferred_genres TEXT[] DEFAULT '{}',  -- 최대 3개: 'fantasy','romance','sci-fi','comedy','horror','daily'
  anonymous_session_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable; guest→정회원 이관 추적 (G-56)
  bio TEXT,  -- 자기소개 (PROFILE-01, G-150)
    -- 최대 120자: CHECK (bio IS NULL OR char_length(bio) <= 120)
  profile_visibility TEXT DEFAULT 'public',  -- 프로필 공개 범위 (PROFILE-02, G-150)
    -- CHECK (profile_visibility IN ('public', 'connected', 'private'))
    -- public: 모든 사용자 SELECT 가능 | connected: 같은 방 참가자만 | private: 본인만
  notification_prefs JSONB DEFAULT '{"room_invite":true,"room_scheduled":true,"room_full":false,"credit_low":true}',  -- 알림 설정 SSOT (SET-14 / PROFILE-03, G-156)
    -- ProfilePage·SettingsPage Tab 8 둘 다 이 컬럼을 읽고 씀
  age_band TEXT DEFAULT NULL,  -- '14_17' | '18_plus'. 14세 미만은 가입/방 진입 차단
    -- 생년월일 원문 저장 금지. Auth/ViewerGate는 age_band + age_attested_at 없으면 방 진입 차단.
  age_attested_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,  -- 연령 확인 시각
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,  -- 소프트 삭제 타임스탬프 (AUTH-05, G-152)
    -- NULL = 활성 계정 | NOT NULL = 삭제 예약 (30일 유예 후 pg_cron 영구 삭제)
    -- 모든 SELECT RLS에 `deleted_at IS NULL` 조건 추가 필요
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: users can read their own row + all users in same room
-- RLS Policy: users can update only their own row (display_name, bio, profile_visibility, notification_prefs, language, timezone, preferred_genres)
-- RLS Policy (추가): SELECT/UPDATE WHERE deleted_at IS NULL — 삭제 예약 계정 접근 차단
-- RLS Policy (추가): profile_visibility='public' → 모든 인증 사용자 SELECT 가능
-- RLS Policy (추가): profile_visibility='connected' → room_participants에서 같은 방 참가자만 SELECT
-- RLS Policy (추가): profile_visibility='private' → 본인(auth.uid() = id)만 SELECT
-- Realtime: subscribe to user presence changes

-- pg_cron: 소프트 삭제 계정 영구 삭제 (매일 03:00 KST = 18:00 UTC)
-- SELECT cron.schedule('purge-deleted-users', '0 18 * * *', $$
--   DELETE FROM users WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
-- $$);
```

### 1.1.1 account_restrictions

```sql
CREATE TABLE account_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restriction_type TEXT NOT NULL,  -- warning, suspend, vgen_block, room_create_block, join_block, permanent_ban
  reason TEXT NOT NULL,
  can_join BOOLEAN DEFAULT TRUE,
  can_create_room BOOLEAN DEFAULT TRUE,
  can_vgen BOOLEAN DEFAULT TRUE,
  starts_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,  -- NULL = permanent until moderator lifts
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  lifted_at TIMESTAMP WITH TIME ZONE,
  lifted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: no direct client SELECT/INSERT/UPDATE/DELETE.
-- Mutation: moderation-action Edge Function with service role only.
-- Gate rule: create-room, accept-invite, join-public-room, livekit-token, trigger-vgen MUST reject active restrictions.
-- Active restriction = lifted_at IS NULL AND (expires_at IS NULL OR expires_at > now()).
-- ponytail: one table is enough for MVP; if policy becomes complex, derive a user_effective_permissions view later.
```

### 1.2 rooms

> **as-built 추가 컬럼 (2026-07-08, 마이그 `20260708160000`)** — `is_practice boolean not null default false`(LOB-10 연습 방: 시스템 호스트 시드·비어도 ended 안 함·참가자 전원 대본 진행). `public_rooms` 뷰 끝에 `is_practice` 노출. `genre` 는 create-room 화이트리스트(comedy·drama·romance·fantasy·horror·free)로 배선됨.
>
> **as-built 추가 컬럼 (2026-07-09, 마이그 `20260709100000`)** — `script_mode text not null default 'performance' check in ('rehearsal','performance')`(ROOM-14 모드 토글, 주인님 확정 의미론: 리허설=활성 참가자 전원 cue 진행 허용·본공연=호스트만). `set-script-mode` Edge(호스트 검증→update→room-authority `script_mode` broadcast)가 유일 쓰기 경로, `advance-script-cue` 가 진행권 판정에 참조. 뷰 노출 없음(멤버는 rooms 직접 SELECT).

```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  genre TEXT,  -- drama, comedy, fantasy, romance, etc.
  status TEXT DEFAULT 'waiting',  -- waiting, live, ended
  current_mode TEXT NOT NULL DEFAULT 'normal',  -- 무대 진행 모드 normal|vgen|dub (G-261, 마이그 20260710093000) — 쓰기는 set-room-mode Edge 전용, late joiner 복원용
  is_demo BOOLEAN DEFAULT FALSE,  -- public Watch-only demo room; viewer-only anonymous entry allowed
  is_locked BOOLEAN DEFAULT FALSE,  -- 비밀번호/초대 필요 여부. 해시는 room_secrets에만 저장.
  max_participants INT DEFAULT 6,
  current_participants INT DEFAULT 0,
  background_url TEXT,  -- current scene/background image URL
  background_key TEXT,  -- Supabase Storage key for easy updates
  template_id UUID,  -- optional room_templates.id; nullable to avoid bootstrapping dependency
  language VARCHAR(10) DEFAULT 'ko',  -- ISO 639-1 코드 (ko, en, ja, zh, ...) — 진행 언어 표시 (G-61)
  authority_state_json JSONB,  -- last confirmed host authority state
  authority_epoch INT DEFAULT 1,  -- increments on host transfer; rejects stale authority/cue messages
  cue_operator_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- temporary cue issuer if host transfer is in progress
  live_participant_count INT DEFAULT 0,  -- LiveKit webhook/reaper reconciliation
  emptied_at TIMESTAMP WITH TIME ZONE,  -- set when live_participant_count reaches 0; 30s grace before ended
  playback_position_ms INT DEFAULT 0,  -- 현재 MainView 영상 재생 위치(ms), 호스트 클라이언트가 주기적으로 UPDATE (5초마다) (G-65)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: host + same-room participants can read room detail
-- Public discovery uses public_rooms view only; never expose secrets.
-- RLS Policy: only host can update their own room
-- RLS Policy: host can update own room status/background/settings.
-- RLS Policy: host cannot hard-delete rooms. Host "delete room" UX must call end-room and set status='ended'.
-- Hard DELETE is admin/retention-worker only and blocked while moderation/evidence hold exists.
-- Realtime: subscribe to room status changes (live, host_changed, ended)
--
-- R2 Cascade 정책 (G-50):
--   사용자/호스트 액션으로 rooms DELETE 금지. rooms.status='ended' soft-end 후 retention worker가 보존기간 만료와 evidence_hold를 확인한다.
--   admin/retention-worker가 rooms hard DELETE를 수행할 때만 연관 R2 오브젝트 자동 삭제:
--   1. rooms.background_url → R2 background 오브젝트 삭제
--   2. vgen_jobs.result_object_key → R2 vgen 오브젝트 삭제 (ON DELETE CASCADE로 DB 행은 자동 삭제)
--   3. recordings.storage_object_key → R2 recording 오브젝트 삭제 (ON DELETE CASCADE)
--   4. dub_sessions/dub_outputs → R2 dub 오브젝트 삭제 (ON DELETE CASCADE)
--   구현: Cloudflare Worker 또는 Edge Function이 admin/retention hard DELETE 작업에서 R2 DELETE 실행.
--   ponytail: DB CASCADE는 자동이지만 R2는 별도 삭제 필요. pg_cron daily 보조 정리.
```

### 1.2.0 public_rooms view

```sql
-- C11 해소: host_id 대신 host_display_name 노출 (신원 추적 방지)
-- host_id는 비공개 방의 경우 호스트 신원 추적에 악용될 수 있으므로 public view에서 제외.
-- host_display_name은 users 테이블 JOIN으로 표시용 이름만 제공.
CREATE VIEW public_rooms AS
SELECT
  r.id,
  r.title,
  r.description,
  r.genre,
  r.status,
  r.is_demo,
  r.is_locked,
  r.max_participants,
  r.current_participants,
  r.background_url,
  u.display_name AS host_display_name,  -- host_id 대신 표시용 이름만
  r.created_at,
  r.started_at,
  r.updated_at
FROM rooms r
LEFT JOIN users u ON u.id = r.host_id
WHERE r.status IN ('waiting', 'live');

-- RLS/Grants: authenticated users can SELECT this view for lobby discovery.
-- MUST NOT join room_secrets or expose password_hash/invite_code_hash.
-- MUST NOT expose host_id (UUID) — host_display_name만 노출 (C11, 신원 추적 방지).
```

### 1.2.1 room_secrets

```sql
CREATE TABLE room_secrets (
  room_id UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  password_hash TEXT,  -- bcrypt/argon2 hash, NULL if unlocked
  invite_salt TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: no direct client SELECT.
-- Mutation/verification: Edge Function with service role only.
-- Public room list MUST use public_rooms view that excludes this table.
```

### 1.2.1.1 rate_limit_counters (범용 레이트리밋 · 보안 인프라)

```sql
-- 고정윈도 레이트리밋 카운터 (2026-07-06, SEC-1/SEC-4). Edge Function(service_role) 전용, deny-all RLS.
-- bucket_key 로 용도 구분: 'pwjoin:<user>:<room>'(잠금방 비번 브루트포스), 'refine:<user>'·'transcribe:<user>' 등(비용 API 캡).
CREATE TABLE rate_limit_counters (
  bucket_key   TEXT PRIMARY KEY,
  count        INT NOT NULL DEFAULT 0,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- RLS enabled, no policy (deny-all).
-- check_rate_limit(p_key, p_max, p_window_sec) SECURITY DEFINER RPC 로 원자 증가 + 만료 윈도 리셋 → boolean(허용) 반환.
```

### 1.2.2 room_invites

> **구현됨 (2026-07-08, 마이그 `20260708120000`)** — as-built: RLS 는 deny-all(발급·검증·수락 전부 Edge 경유라 클라 직접 읽기 없음 — 호스트 초대목록 UI 생기면 SELECT 정책 추가) + `consume_room_invite(p_code_hash, p_user_id)` RPC(행 잠금 원자 소비, service_role 전용). 코드 = 128-bit hex, 해시 = 무염 SHA-256(코드 자체가 난수라 충분·해시 컬럼 직조회용). 지명 초대(invited_user_id)는 max_uses=1 강제 + re_invite 알림.

```sql
CREATE TABLE room_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  invited_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  invite_code_hash TEXT NOT NULL,
  role TEXT DEFAULT 'actor',  -- actor, viewer. 모바일/게스트는 Edge Function에서 viewer로 다운그레이드
  role_source TEXT DEFAULT 'host_selected',  -- host_selected, invite_default, mobile_downgrade, guest_demo
  max_uses INT DEFAULT 1,
  used_count INT DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: host can create/revoke invites for own room.
-- RLS Policy: invited_user_id can read own unexpired invite metadata only.
-- Join flow: valid invite creates room_participants row, then LiveKit token can be requested.
```

### 1.3 room_participants

> **as-built 갱신 (2026-07-08, 마이그 `20260708130000`·`20260708170000`)** — 유니크는 **활성 행 한정 부분 인덱스**: `(room_id,user_id) where state<>'left'` + `(room_id,slot_index) where state<>'left' and slot_index is not null`. 전행 유니크는 제거 — left 행이 좌석·재입장을 영구 점유하던 잠복 버그 2건의 정수정(재입장 = 세션당 새 행, 이력 보존). 뷰어는 slot_index null·정원 비점유(`join_room_as_viewer` RPC).
>
> **as-built 갱신 (2026-07-09, 마이그 `20260708190000`·`20260708200000`, 배포됨)** — `raise_hand_at` 컬럼(ROOM-20 손들기 큐) + `promote_viewer_to_actor(uuid,uuid)` RPC(ROOM-21 viewer→actor 승격: `FOR UPDATE` 슬롯 배정 + `token_version++` + `raise_hand_at=null`). RPC는 **service_role 전용 3중 revoke**(`public,anon,authenticated`) — 클라 노출 시 임의 승격을 막는 정수정(`join_room_as_participant` 패턴).

```sql
CREATE TABLE room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_index INT,  -- 0-5 for 6-person layout
  role TEXT DEFAULT 'actor',  -- actor, viewer. viewer는 GreenRoom 없이 Viewer Gate만 통과
  role_source TEXT DEFAULT 'host_selected',  -- invite, user_choice, mobile_downgrade, guest_demo, fallback_no_camera
  state TEXT DEFAULT 'joining',  -- joining, connected, active, muted, inactive, left
  audio_enabled BOOLEAN DEFAULT FALSE,
  muted_by_host BOOLEAN DEFAULT FALSE,
  muted_until TIMESTAMP WITH TIME ZONE,  -- HOST-08/G-167 timed mute expiry. null = not timed
  is_disabled_by_host BOOLEAN DEFAULT FALSE,
  token_version INT DEFAULT 1,  -- increments on kick/leave/safety revoke/promote; LiveKit token metadata must match
  token_revoked_at TIMESTAMP WITH TIME ZONE,
  raise_hand_at TIMESTAMP WITH TIME ZONE,  -- ROOM-20 손들기 큐(마이그 20260708190000). null = 손 안 듦; 승격·내리기 시 null
  character_role TEXT,  -- actor's assigned character name (e.g., "리온", "세이라"); NULL = unassigned
  is_tracking_failed BOOLEAN DEFAULT FALSE,  -- fallback state when expression tracking fails (ROOM-11)
  is_ready BOOLEAN DEFAULT FALSE,  -- G-62: GreenRoom에서 준비 완료 여부 (호스트만 state 변경 권한)
  slot_display_name TEXT,  -- G-81: 방 입장 시 동명이인이면 "이름#2" 형태로 자동 생성
    -- 예: "Jason"이 이미 있으면 신규 입장자는 "Jason#2"
    -- NULL이면 display_name 그대로 사용
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(room_id, user_id),
  UNIQUE(room_id, slot_index)
);

-- RLS Policy: users can read room_participants rows only when an active row exists for the same room_id
-- RLS Policy: only host can update audio_enabled, muted_by_host, is_disabled_by_host, character_role
-- RLS Policy: users can update only their own audio_enabled, is_ready (G-62)
-- RLS Policy: users can update is_ready=true only when state='joining' (GreenRoom phase)
-- Realtime: subscribe to participant state changes (join, leave, mute, slot changes, character assignment, is_ready)
--
-- 동명이인 구분 정책 (G-81):
--   방 입장 시 동명이인 감지: SELECT COUNT(*) FROM room_participants WHERE room_id=X AND display_name=Y AND id!=자신
--   1명 이상이면: slot_display_name = ${display_name}#${count+1} 자동 배정
--   UI에서는 slot_display_name 우선, null이면 display_name 표시
--
-- Token Revocation (SecurityPolicies §8, G-37·G-44):
--   kick/leave/set-participant-safety는 token_version을 +1 하고 token_revoked_at을 기록한다.
--   livekit-token은 AccessToken metadata에 token_version을 넣고, livekit-webhook participant_joined는
--   metadata token_version != room_participants.token_version 이면 즉시 removeParticipant 한다.
--   무효화는 (1) token_version mismatch, (2) is_disabled_by_host=true, (3) state='left'+left_at 조합으로 처리한다.
--   jti는 LiveKit AccessToken metadata와 audit_logs에 저장한다. DB jti 블랙리스트는 P2.
--   자발적 퇴장 후 재입장은 room_invites 새 발급 시에만 허용 (livekit-edge-fn.md §4.1 게이트).
--
-- Multi-tab 동시 진입 정책 (C17·G-51):
--   UNIQUE(room_id, user_id) 제약으로 같은 사용자의 2개 탭 동시 입장을 차단한다.
--   LiveKit은 같은 identity로 2번째 연결 시 기존 연결을 자동으로 끊음 (kick first).
--   2번째 탭의 room_participants INSERT는 UNIQUE 충돌 → ON CONFLICT DO NOTHING으로 무시.
--   클라이언트는 "이미 다른 탭에서 접속 중입니다" 메시지 표시 후 LobbyPage로 라우팅.
--   ponytail: 1인 1세션이 단순하고 안전. 다중 디바이스 지원은 P2에서 별도 설계.
--
-- token_version 필드 (HIGH 핵심):
--   안전 조치 후 1~3초 재접속 창이 abuse path가 되므로 MVP부터 둔다.
--   ponytail: Redis jti 블랙리스트보다 DB version 비교가 작고 충분하다.
```

### 1.3.1 room_waitlist (G-59)

```sql
CREATE TABLE room_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notified_at TIMESTAMP WITH TIME ZONE,  -- 자리 생겼을 때 알림 발송 후 갱신
  UNIQUE(room_id, user_id)
);

-- RLS Policy: users can INSERT/DELETE only their own waitlist entries
-- RLS Policy: SELECT policy: no direct client access (server-only table)
-- Realtime: subscribe to room status changes (current_participants update) to trigger notification check
--
-- 자동 정리 (G-59):
--   1. room 삭제 시 CASCADE로 자동 삭제
--   2. 알림 발송 후 notified_at 갱신
--   3. pg_cron 일일 정리: 24시간 이상 notified_at 상태인 행 자동 삭제 (optional)
--
-- pg_cron UTC 타임존 통일 (G-82):
--   모든 pg_cron 스케줄은 UTC 기준으로 설정
--   KST 00:00 = UTC 15:00 (전날)
--   예: '0 15 * * *' = 매일 15:00 UTC = 매일 00:00 KST
--   월초 크레딧 리셋: '0 15 1 * *' = 매월 1일 15:00 UTC = 매월 1일 00:00 KST
```

### 1.4 models

```sql
CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rig_url TEXT NOT NULL,  -- Supabase Storage path to rig.json
  preview_image_url TEXT,  -- PNG preview
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,  -- user's selected avatar
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, name)
);

-- RLS Policy: users can read only their own models + all public models
-- RLS Policy: users can create/update/delete only their own models
-- Realtime: not used (static asset)
```

### 1.5 scripts

```sql
CREATE TABLE scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  language TEXT DEFAULT 'ko',  -- ko, ja, en (script may contain multiple)
  cues_json JSONB NOT NULL,  -- array of {index, character_role, text, duration_ms}
  current_cue_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT FALSE,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: users in same room can read script
-- RLS Policy: only host can update current_cue_index, is_active
-- Realtime: subscribe to cue_index changes
```

### 1.5.1 script_versions (G-104 버전 히스토리)

```sql
CREATE TABLE script_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  content JSONB NOT NULL,          -- 전체 대본 스냅샷 (scripts.cues_json 복제)
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  version_num INT NOT NULL,        -- 1부터 증가, scripts 당 unique
  UNIQUE(script_id, version_num),
  CHECK (version_num >= 1)
);

-- RLS Policy: users in same room can read all versions (room_id via scripts JOIN)
-- RLS Policy: only room host can trigger new version creation (via rollback RPC)
-- Realtime: not needed (historical archive)
-- Index: script_id, version_num 복합 인덱스
CREATE INDEX idx_script_versions_script_id ON script_versions(script_id);
CREATE INDEX idx_script_versions_created_at ON script_versions(script_id, created_at DESC);

-- 버전 생성 정책:
-- 1. scripts.cues_json UPDATE 시 (호스트 수정): script_versions에 자동 INSERT (trigger 또는 Edge Function)
-- 2. rollback: 이전 버전 content를 scripts.cues_json에 복사 + 새로운 version_num 행 INSERT
-- 3. 버전 번호: version_num = (SELECT MAX(version_num) FROM script_versions WHERE script_id=?) + 1
```

