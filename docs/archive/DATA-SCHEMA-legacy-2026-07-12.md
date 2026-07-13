---
tags: [hub]
---

# Data Schema — snack-web Supabase + LiveKit Protocol

> Derived from state-machines/_INDEX.md and PLATFORM-ARCHITECTURE.md
> Updated: 2026-07-01 · P0 보안 감사 반영: room_secrets/room_invites 분리, RLS room 상관 검증, R2 signed URL 원칙 · 토큰 무효화 주석 §1.3 (G-37·G-44) · 녹화/DUB 동의 §1.11·§1.12 (G-39·G-43) · 메시지 멱등성 §1.6 (C5) · 멀티탭 정책 §1.3 (C17·G-51) · chat seq §2.3 · authority_epoch 12타입 §2.1 (G-45) · R2 Cascade §1.2 (G-50) · obs_viewer_tokens §1.17은 P2 방송 송출 옵션 전용 · DataChannel SSOT 4개(`room-authority`, `chat`, `script-cue`, `blendshape`)
<!-- opencode: 2026-06-29 - §1.17 obs_viewer_tokens 테이블 신설 (OBS P2 방송 송출 옵션, 비인증 뷰어 차단). Coded with OpenCode; high-cost model review recommended. -->

---

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

### 1.6 messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 500 AND content !~ '[<>]' AND content !~ '[[:cntrl:]]'),
  message_type TEXT DEFAULT 'chat',  -- chat, reaction, system, note
  reaction_emoji TEXT,  -- only set if message_type = 'reaction'
  status TEXT DEFAULT 'visible',  -- visible, hidden, tombstone
  hidden_reason TEXT,  -- user_block, moderator_action, deleted_by_author, automated_filter
  hidden_by UUID REFERENCES users(id) ON DELETE SET NULL,
  hidden_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  idempotency_key TEXT,  -- C5: 클라이언트 재시도 시 중복 저장 방지 (SHA256(user_id + room_id + content + timestamp_bucket_10s))
  seq BIGINT,  -- HIGH: sender별 monotonic sequence (채팅 순서 보장)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(idempotency_key)  -- 같은 idempotency_key 재전송 시 ON CONFLICT DO NOTHING으로 무시
);

-- 멱등성 정책 (C5):
-- 1. 클라이언트가 메시지 전송 전 idempotency_key = SHA256(user_id + room_id + content + floor(timestamp/10000)*10000) 계산
-- 2. INSERT 시 ON CONFLICT(idempotency_key) DO NOTHING → 중복 메시지 무시
-- 3. 10초 버킷 내 동일 내용 재전송은 같은 key → 1회만 저장
-- 4. seq: 각 sender가 로컬에서 increment, 수신 측은 seq로 순서 복원 (gap 허용, reorder 감지)

-- RLS Policy: users can read messages only when an active room_participants row exists with room_participants.room_id = messages.room_id
-- RLS Policy: no client INSERT. send-chat/send-viewer-chat Edge Functions sanitize, rate-limit, audit, then service_role INSERT.
-- RLS Policy: no hard delete in MVP. Author/host/moderator can set status='tombstone' via Edge Function only.
-- Realtime: subscribe to new messages (for chat sync)
```

### 1.7 scenes

```sql
CREATE TABLE scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,  -- fantasy, sci-fi, modern, custom
  image_url TEXT NOT NULL,  -- Supabase Storage URL (fallback when layers_json is NULL)
  thumbnail_url TEXT,  -- small preview image
  palette_mood TEXT,  -- warm, cool, dark, bright
  accent_color TEXT,  -- hex color code (e.g., #FF8C2A) for CSS var(--scene-accent)
  layers_json JSONB,  -- SceneLayer[] 배열. NULL이면 단일 image_url 정적 렌더 fallback
  is_system BOOLEAN DEFAULT FALSE,  -- true = read-only system scene
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL for system scenes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: all authenticated users can read all scenes
-- RLS Policy: host can insert/update/delete custom scenes in their own room only
-- RLS Policy: is_system=true rows are read-only for all users

-- Storage Path Migration: scenes/system/{slug}.jpg → scenes/system/{slug}/layers/{layer_id}.png
-- SceneLayer Structure (layers_json 배열 요소):
-- {
--   "id": "sky",                          -- 레이어 고유 ID
--   "name": "하늘",                       -- 표시용 이름
--   "image_url": "scenes/system/campfire-forest/layers/sky.png",
--   "z_order": 0,                         -- 레이어 깊이 (0 = 가장 뒤)
--   "transform": { "x": 0, "y": 360, "scale_x": 1.0, "scale_y": 1.0 },
--                                         -- 선택. 없으면 (0,0) 풀프레임. 1536×1024 기준 (contracts/SceneBackground.md LayerTransform)
--   "interaction_type": ["idle_anim"],    -- ["idle_anim"] | ["click"] | ["click", "idle_anim"]
--   "idle_animation": {                   -- NULL이면 정적 이미지
--     "type": "float" | "flicker" | "sway" | "pulse",
--     "amplitude": 2,                     -- 픽셀 단위
--     "period_ms": 6000
--   },
--   "click_event": {                      -- NULL이면 클릭 비활성화
--     "animation": "scale_bounce",        -- 애니메이션 타입
--     "duration_ms": 400,
--     "sound_id": "campfire_crackle"      -- 선택사항
--   }
-- }
--
-- Migration: 기존 rows는 layers_json=NULL → 단일 image_url fallback으로 하위 호환 유지
```

### 1.8 vgen_jobs

```sql
CREATE TABLE vgen_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  triggered_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,  -- SHA256 hash for deduplication
  prompt_snapshot TEXT,  -- Moderation 검사 시점 프롬프트 스냅샷 (VGEN-01 LWW 충돌 방지, C5)
  egress_id TEXT,  -- LiveKit Egress ID (Egress webhook 매핑용, C5)
  status TEXT DEFAULT 'pending',  -- pending | generating | done | failed | flagged (DB enum). Note: 'moderating' and appeal progress are frontend/API states, not persisted here
  appeal_status TEXT,  -- NULL | pending | reviewing | approved | rejected (for flagged jobs)
  failure_reason TEXT,  -- moderation_rejected, post_moderation_rejected, provider_error, timeout, validation_failed
  result_object_key TEXT,  -- R2 object key; durable source of truth
  result_url TEXT,  -- short-lived signed R2 URL cache; never public URL
  provider TEXT DEFAULT 'seedance',  -- AI video provider adapter
  model_id TEXT DEFAULT 'seedance-v2.0',  -- provider model/pricing key for cost monitoring
  provider_job_id TEXT,  -- provider-side async job id; webhook reconciliation only
  duration_sec INT DEFAULT 10,  -- requested/generated duration for cost monitoring
  credit_cost INT DEFAULT 0,  -- credits spent on this job
  estimated_cost_usd NUMERIC(10, 4),  -- server-calculated estimate at trigger time
  output_format TEXT DEFAULT '16:9',  -- '16:9' | '9:16' (VGEN-11)
  output_9x16_url TEXT,  -- 세로형 변환 결과 URL (VGEN-11)
  clip_count INT DEFAULT 1,  -- 멀티클립 수 (60초 쇼츠 = 4클립, VGEN-11)
  visibility TEXT DEFAULT 'members_only',  -- public | private | members_only | private_hold (withdrawal/evidence hold)
  flagged_categories TEXT[],  -- moderation 거부 카테고리 (VGEN-06)
  idempotency_key TEXT UNIQUE,  -- SHA256(prompt_hash + user_id + room_id + timestamp_bucket_10s) for race-condition prevention (C3)
  credit_deducted_at TIMESTAMPTZ,  -- 차감 완료 시각 (null이면 미차감)
  credit_refunded_at TIMESTAMPTZ,  -- 환불 완료 시각
  validation_status TEXT DEFAULT 'pending',  -- 'pending'|'passed'|'failed' (MP4 무결성, C5)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(room_id, prompt_hash)  -- dedup: same prompt in same room → same job result (VGEN-05)
);

-- RLS Policy: vgen_jobs SELECT 게이트 (G-66 visibility 처리):
--   public: 모든 인증 사용자 SELECT 허용
--   members_only: room_participants 테이블 JOIN 후 같은 방 참가자만 SELECT 허용
--   private: 본인(triggered_by = auth.uid()) 또는 호스트만 SELECT 허용
-- RLS Policy: only room host can insert vgen_jobs (trigger)
-- RLS Policy: only room host can update vgen_jobs status/result_url/visibility
-- Realtime: subscribe to vgen_jobs.status changes (pending→generating→done)

### vgen_jobs DONE 진입 3-way 게이트 (C5·C8)

DONE 상태로의 전이는 다음 3가지 조건을 모두 만족해야만 허용:
1. `validation_status = 'passed'` — MP4 파일 무결성 검증 통과 (ffprobe/MediaInfo)
2. `result_url IS NOT NULL` — R2 오브젝트 존재 확인 (고아 오브젝트 방지, C8)
3. `credit_deducted_at IS NOT NULL` — 크레딧 차감 완료

**조건 불만족 시 흐름:**
- 하나 이상 미충족 → `status='failed'` 전이
- `credit_deducted_at IS NOT NULL AND credit_refunded_at IS NULL` 시 자동 환불 (pg_cron, 120초 타임아웃)
- 사용자 알림: "영상 검증에 실패했습니다. 크레딧이 환불되었습니다."

**중간 상태: flagged (관리자 검토 경로)**
- Post-moderation frame check에서 불안전한 콘텐츠 감지 → `status='flagged'` (VGEN-06)
- FAILED가 아님: 사용자 알림 없음, 크레딧 환불 없음
- 관리자 검토 대기: Admin console에서 수동 승인 또는 거절

### 크레딧 차감 원자성 규칙 (C3)

멀티유저 동시 요청 시 크레딧 차감 중복 방지:

1. **Edge Function에서 비관적 잠금**:
   - `BEGIN; SELECT balance FROM credits WHERE user_id=? FOR UPDATE;`
   - 차감 가능 여부 검증: `balance >= cost`
   - 부족 시 → `ROLLBACK` + 402 Payment Required 반환

2. **멱등성 키 기반 중복 방지**:
   - `idempotency_key = SHA256(prompt_hash || user_id || room_id || floor(timestamp/10000)*10000)`
   - 10초 버킷 내 동일 요청은 기존 job_id 반환 (UNIQUE 충돌 시)
   - 추가 크레딧 차감 방지

3. **차감 원자화**:
   - `idempotency_key INSERT` (또는 UNIQUE 충돌) + `balance -= cost` + `credit_deducted_at = NOW()` 을 같은 트랜잭션 내 실행
   - 성공 → `COMMIT`
   - 실패 → `ROLLBACK` (balance 복구)

4. **fal.ai 호출 실패 시 보상 트랜잭션**:
   - 생성 실패 → `credit_refunded_at = NOW()` + `balance += cost` 실행
   - 동일 트랜잭션으로 `credit_transactions` 로그 INSERT (`reason='refund'`)

5. **타임아웃 자동 환불** (pg_cron):
   - `credit_deducted_at IS NOT NULL AND credit_refunded_at IS NULL`
   - 초기 생성 후 120초 내 status가 'done'/'failed'/'flagged'로 전환되지 않으면 자동 환불
   - 크론 주기: 5분 (주기적 스캔)
```

### 1.8.1 vgen_appeals

```sql
CREATE TABLE vgen_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES vgen_jobs(id) ON DELETE CASCADE,
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK(length(reason) >= 20),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewing', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(job_id, requester_user_id)
);

-- RLS Policy: requester can create/read own appeals. Host can read same-room appeals. Admin/moderator can read/update all.
-- Side effect: vgen-appeal keeps vgen_jobs.status='flagged' and sets vgen_jobs.appeal_status='pending'.
```

### 1.8.2 avatar_jobs (Avatar Forge — PNG→Live2D)

vgen_jobs 자매 잡 테이블. 결과가 영상이 아니라 rig(`avatars/<job>/project.json` + `parts/*.webp`). 크레딧/디덥/모더레이션은 슬라이스 제외(해피패스) — 트리거=Modal 웹엔드포인트 spawn, 진행/완료는 파이프라인이 service_role로 직접 PATCH(별도 webhook 없음). SSOT: `docs/reference/patterns/avatar-forge-pipeline.md`.

```sql
CREATE TABLE avatar_jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | failed
  phase              TEXT,                             -- analyzing | cutting | rigging | finishing (25~40분 하위 진행)
  input_object_key   TEXT,                             -- Storage avatar-uploads/<authUid>/uploads/<uuid>.png
  result_project_url TEXT,                             -- avatars/<job>/project.json (완료 시, 공개 URL — isValidAvatarUrl 통과)
  provider           TEXT NOT NULL DEFAULT 'modal',
  provider_call_id   TEXT,                             -- Modal FunctionCall id
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ,
  CONSTRAINT avatar_jobs_status_chk CHECK (status IN ('queued','running','done','failed'))
);
-- RLS: SELECT 본인 행만(user_id = current_user_id()). INSERT/UPDATE 정책 없음 = service_role(Edge·파이프라인)만.
--   Realtime 전달도 이 SELECT 를 타므로 본인 잡 구독 성립.
-- Realtime: subscribe to avatar_jobs (queued→running→done/failed, phase 진행)
```

**상태 기계**: `queued → running`(phase analyzing→cutting→rigging→finishing)`→ done`(result_project_url 세팅) | `→ failed`(error). 발행처는 **Supabase Storage 공개 `avatars` 버킷**(로더 신뢰-오리진 `*.supabase.co`), `project.json._project_base_url=""`(로더 파생). 입력은 `avatar-uploads`(private, 본인폴더 RLS).

### 1.9 credits

```sql
CREATE TABLE credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance INT DEFAULT 100,  -- free starting credit
  total_earned INT DEFAULT 100,
  total_spent INT DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: users can read only their own credits row
-- RLS Policy: balance updates ONLY via Edge Function (no direct user UPDATE)
-- RLS Policy: historical tracking via credit_transactions table
```

### 1.10 credit_transactions

```sql
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INT NOT NULL,  -- positive = earn, negative = spend
  reason TEXT NOT NULL,  -- vgen_job, purchase, bonus, refund
  ref_id UUID,  -- foreign key context (e.g., vgen_jobs.id)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: users can read only their own transactions
-- RLS Policy: no direct INSERT/UPDATE by users (Edge Function only)
-- Realtime: not used (historical ledger)
```

### 1.11 recordings

```sql
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_object_key TEXT NOT NULL,  -- durable R2/Supabase object key. signed URL은 RPC/Edge Function이 단기 발급
  signed_url_cache TEXT,  -- optional short-lived cache; 만료 가능하며 source of truth 아님
  duration_ms INT,
  file_size_bytes BIGINT,
  status TEXT DEFAULT 'recording',  -- recording, processing, ready, failed, cancelled, discarded
  visibility TEXT DEFAULT 'members_only',  -- public | private | members_only (G-66)
  thumbnail_url TEXT,  -- 썸네일 이미지 URL (녹화물 갤러리 표시용, G-67)
  consent_json JSONB,  -- 참가자별 녹화 동의 상태 (G-39·C4, SecurityPolicies §11)
  local_backup_manifest JSONB,  -- ROOM-23: participant chunk manifest; durable file은 R2 object key만 저장
  upload_resume_token_hash TEXT,  -- ROOM-23: interrupted upload resume token hash; plaintext never stored
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  retention_expires_at TIMESTAMP WITH TIME ZONE,  -- 데이터 보존기간 만료 시각 (G-39)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- consent_json 구조:
-- {
--   "participants": {
--     "<user_id>": {
--       "consented": boolean,
--       "consented_at": ISO 8601 timestamp,
--       "consent_type": "pre" | "post",  -- 사전 동의(녹화 시작 전) 또는 사후 확인(녹화 완료 후)
--       "ip_hash": string  -- 동의 출천 증거 (GDPR §5)
--     }
--   },
--   "all_consented": boolean  -- 모든 활성 참가자 동의 완료 여부 (녹화 시작 게이트)
-- }
--
-- 녹화 시작 게이트: all_consented = true 여야만 status='recording' → 'processing' 전이 가능
-- 취소/폐기 (G-169):
--   cancelled: 시작 카운트다운 또는 업로드 전 취소. R2 object 없음.
--   discarded: 업로드 후 사용자가 폐기. R2 object 삭제 후 signed_url_cache/result refs null 처리.
-- 보존기간 정책: retention_expires_at = ended_at + 90일 (기본값, 호스트 연장 가능)
-- 만료 처리: pg_cron이 daily로 retention_expires_at < now()인 행 삭제 + R2 오브젝트 삭제

-- RLS Policy: recordings SELECT 게이트 (G-66 visibility 처리):
--   public: 모든 인증 사용자 SELECT 허용
--   members_only: room_participants 테이블 JOIN 후 같은 방 참가자만 SELECT 허용
--   private: 본인(user_id = current_app_user_id()) 또는 호스트만 SELECT 허용
--   private_hold: admin/evidence service only. 일반 사용자·호스트 signed URL 발급 금지
-- RLS Policy: recorder (user_id) can update/delete own recordings
-- RLS Policy: host can update/delete any room recordings
-- Realtime: not used (post-session artifact)
```

### 1.11.1 user_storage_quota (G-83)

```sql
CREATE TABLE user_storage_quota (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  used_bytes BIGINT DEFAULT 0,          -- 현재 사용량 (bytes)
  limit_bytes BIGINT DEFAULT 10737418240, -- 기본 10 GiB
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy:
--   SELECT: 본인만 (current_app_user_id() = user_id)
--   UPDATE: service_role만 (트리거/Edge Function 전용)
--   INSERT: service_role만
--
-- 업데이트 트리거: recordings/vgen_jobs INSERT/DELETE 시 used_bytes 갱신
-- (pg 트리거 또는 Edge Function 호출)
--
-- 사용량 계산:
--   vgen_jobs.result_url 파일 크기 (file_size 추가 필요) + recordings.file_size_bytes 합산
--   DELETE 시 used_bytes 차감
--
-- pg_cron 일일 정리 (G-83):
--   매일 04:00 UTC (= 매일 13:00 KST) 고아 R2 오브젝트 정리 후 used_bytes 재집계
```

### 1.12 dub_sessions

```sql
CREATE TABLE dub_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_video_url TEXT NOT NULL,  -- uploaded MP4 object key/signed cache or VGEN object key
  source_type TEXT NOT NULL,  -- 'mp4', 'vgen'. 'youtube' is P2-disabled until legal/SSRF gate lands
  youtube_url TEXT,  -- P2 only; never used in MVP
  whisper_job_id TEXT,  -- external Whisper API job ID
  diarization_result_json JSONB,  -- {segments: [{id, start_ms, end_ms, text}]}. whisper-1 은 화자분리 불가 → speaker 필드 없음(호스트가 DubRoleAssigner 에서 수동 배정). diarization provider 승급 시 speaker 추가 (G-269)
  role_version INT DEFAULT 1,  -- DUB-03/04 role assignment lock version
  roles_locked_at TIMESTAMP WITH TIME ZONE,  -- non-null while recording; role edits require new version
  roles_locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  consent_json JSONB,  -- 참가자별 더빙 동의 상태 (G-43·C4, recordings.consent_json과 동일 구조)
  retention_expires_at TIMESTAMP WITH TIME ZONE,  -- 데이터 보존기간 만료 시각 (G-39)
  status TEXT DEFAULT 'uploaded',  -- uploaded, transcribing, ready, recording, completed, failed
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- consent_json 구조: recordings.consent_json과 동일 (participants, all_consented)
-- 더빙 세션 시작 게이트: all_consented = true 여야만 status='ready' → 'recording' 전이 가능
-- 동의 전파 (G-43): recordings.consent_json과 dub_sessions.consent_json은 독립.
--   녹화 동의와 더빙 동의는 별개 프로세스. 한쪽 동의가 다른쪽으로 자동 전파되지 않음.
--   단, 같은 방에서 이미 녹화에 동의한 참가자는 더빙 동의 UI에서 "녹화에 이미 동의" 배지 표시 (UX only)

-- RLS Policy: same-room users can read all dub_sessions
-- RLS Policy: creator or host can update dub_sessions
-- Realtime: subscribe to status changes (transcribing→ready→completed)
```

### 1.13 dub_tracks

```sql
CREATE TABLE dub_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dub_session_id UUID NOT NULL REFERENCES dub_sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  speaker_name TEXT NOT NULL,  -- "Segment 1", "리온" 등. whisper-1 MVP 는 호스트 수동 배정(자동 diarization 아님, G-269)
  start_time_ms INT NOT NULL,
  end_time_ms INT NOT NULL,
  transcript_text TEXT NOT NULL,  -- original transcript from Whisper
  translated_text TEXT,           -- DUB-06: JP/EN→KR 번역(nullable, 미번역 시 원문 사용). translate-dub-script/assign-dub-roles 가 채움
  recording_url TEXT,  -- recorded audio URL (R2) after participant dubs
  recording_duration_ms INT,
  local_backup_manifest JSONB,  -- ROOM-23: local MediaRecorder chunk sequence + uploaded chunk keys
  upload_resume_token_hash TEXT,  -- resume token hash for chunk upload recovery
  calibration_offset_ms INT DEFAULT 0,  -- timing sync offset for dubbing session
  status TEXT DEFAULT 'assigned',  -- assigned, recording, submitted, synced
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(dub_session_id, participant_id, speaker_name)
);

-- RLS Policy: same-room users can read all dub_tracks
-- RLS Policy: assigned participant can update own recording_url/status
-- RLS Policy: host can adjust speaker_name/calibration_offset_ms
-- Realtime: subscribe to status changes (assigned→recording→synced)
```

### 1.14 dub_outputs

```sql
CREATE TABLE dub_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dub_session_id UUID NOT NULL REFERENCES dub_sessions(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'compositing',  -- compositing, ready, failed
  output_object_key TEXT,  -- durable R2 object key
  output_video_url TEXT,  -- R2 signed URL after final compositing
  file_size_bytes BIGINT,
  duration_ms INT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- RLS Policy: same-room users can read all dub_outputs
-- RLS Policy: host/creator can delete
-- Realtime: subscribe to status changes (compositing→ready)
```

### 1.15 expression_presets

```sql
CREATE TABLE expression_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preset_name TEXT NOT NULL,  -- 'default', '민감함', '둔감함' 등 사용자 지정명
  sensitivity_json JSONB NOT NULL,
  -- sensitivity_json 형식:
  -- { "eyeLOpen": [0.1, 0.9], "mouthOpen": [0.05, 0.95], "browDown": [0.0, 1.0], ... }
  -- ARKit 52 blendshape 중 조정 가능한 키만 포함 (미포함 = 기본값 사용)
  is_default BOOLEAN DEFAULT FALSE,  -- 해당 유저의 기본 프리셋
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, preset_name)
);

-- RLS Policy: users can read/write only their own presets
-- Index: (user_id, is_default) — GreenRoom 진입 시 기본 프리셋 빠른 조회
CREATE INDEX idx_expression_presets_user ON expression_presets(user_id);
CREATE INDEX idx_expression_presets_default ON expression_presets(user_id, is_default);
```

### 1.16 turn_timings

```sql
CREATE TABLE turn_timings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES room_participants(id) ON DELETE CASCADE,
  cue_index INT NOT NULL,         -- 해당 큐의 순번 (scripts.cue_index 연동)
  estimated_duration_ms INT,     -- 예상 소요시간 (ms), NULL = 미설정
  started_at TIMESTAMP WITH TIME ZONE,  -- 실제 시작 시각
  ended_at TIMESTAMP WITH TIME ZONE,    -- 실제 종료 시각
  UNIQUE(room_id, participant_id, cue_index)
);

-- RLS Policy: same-room users can read all turn_timings
-- RLS Policy: host can insert/update
-- Realtime: subscribe to started_at/ended_at changes → TimedTurnsProgressBar 갱신
-- Note: DB 저장 없는 임시 타이밍은 room-authority DataChannel로만 처리 (G-23 범위)
CREATE INDEX idx_turn_timings_room ON turn_timings(room_id, cue_index);

### 1.17 obs_viewer_tokens

```sql
CREATE TABLE obs_viewer_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  issued_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 호스트 (rooms.host_id)
  token_hash TEXT NOT NULL UNIQUE,  -- SHA256(token) — 토큰 자체는 저장하지 않음
  obs_mode TEXT NOT NULL,  -- 'transparent' (OBS-01) | 'chromakey' (OBS-02) | 'fullscreen' (OBS-03)
  target_slot_index INT,  -- OBS-03 전용: 풀스크린 대상 아바타 슬롯 (NULL = 전체 무대)
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,  -- 기본 4시간 (OBS 세션 길이)
  revoked_at TIMESTAMP WITH TIME ZONE,  -- 호스트 수동 폐기
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE  -- 마지막 OBS 접근 시각 (감사)
);

-- RLS Policy:
-- 1. 호스트(rooms.host_id = current_app_user_id())만 토큰 발급·폐기·조회 가능
-- 2. 토큰 소지자는 token_hash 검증을 통해서만 room scoped read 허용
--    (클라이언트가 token을 제시하면 Edge Function이 hash 검증 후 service role로 대신 조회)
-- 3. 비인증 사용자의 rooms/room_participants 직접 SELECT 금지 (token 없이는 차단)

-- 토큰 발급 플로우 (Edge Function):
-- 1. 호스트가 [OBS 토큰 발급] 클릭 → obs_mode, target_slot_index 선택
-- 2. Edge Function: 랜덤 토큰 생성 (crypto.randomUUID() + secret)
-- 3. token_hash = SHA256(token) 계산 후 obs_viewer_tokens INSERT
-- 4. 클라이언트(호스트)에게 token 평문 반환 (한 번만, 이후 재발급 불가)
-- 5. 호스트가 token을 OBS Browser Source URL에 추가: ?obs_token={token}&obs=1

-- 토큰 검증 플로우 (Edge Function):
-- 1. OBSViewer가 ?obs_token={token}으로 진입
-- 2. Edge Function: token_hash = SHA256(token) 계산 후 obs_viewer_tokens 조회
-- 3. 검증: expires_at > now(), revoked_at IS NULL
-- 4. 성공: room_id의 읽기 전용 데이터(rooms, room_participants, MainViewComponent)를 service role로 대신 조회
-- 5. last_used_at 갱신 (감사 추적)
-- 6. 실패: 403 Forbidden, OBS 브라우저 소스에 에러 표시

-- ponytail: 토큰은 단기(4h) + 단일 room scope + 읽기 전용.
--   토큰 철회는 revoked_at 설정 (호스트 수동 또는 room 종료 시 자동).
--   토큰 탈취 시 피해 범위 = 해당 room의 읽기 전용 데이터, 쓰기 권한 없음.

CREATE INDEX idx_obs_viewer_tokens_room_id ON obs_viewer_tokens(room_id);
CREATE INDEX idx_obs_viewer_tokens_token_hash ON obs_viewer_tokens(token_hash);
CREATE INDEX idx_obs_viewer_tokens_expires_at ON obs_viewer_tokens(expires_at);
```

### 1.18 audit_logs

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,  -- token_revoked, participant_kicked, report_created, message_hidden, consent_changed
  target_type TEXT,  -- room, participant, message, recording, dub_session, vgen_job
  target_id UUID,
  metadata_json JSONB DEFAULT '{}',
  ip_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: admins can read all audit_logs. Users can read only logs where actor_user_id = current_app_user_id().
-- RLS Policy: no direct client INSERT/UPDATE/DELETE; Edge Functions insert only.
-- Release gate: Preview/Prod MUST write security-sensitive events here or to an equivalent external sink. console.log-only is local dev only.
```

### 1.19 moderation_reports

```sql
CREATE TABLE moderation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  category TEXT NOT NULL,  -- harassment, sexual_content, hate, spam, impersonation, other
  description TEXT,
  status TEXT DEFAULT 'pending',  -- pending, reviewing, resolved_action, resolved_noaction, dismissed
  appeal_count INT DEFAULT 0,
  final_status TEXT CHECK(final_status IN ('pending', 'resolved_action', 'resolved_noaction', 'resolved_appeal')),
  handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  handled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: reporter can create/read own reports. Admin/moderator can read/update all.
-- RLS Policy: reported_user_id is hidden from non-admin list views except reporter's own report detail.
```

### 1.19.1 reports_appeals

```sql
CREATE TABLE reports_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES moderation_reports(id) ON DELETE CASCADE,
  respondent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK(length(reason) >= 20),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewing', 'approved', 'rejected')),
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(report_id, respondent_id)
);

-- RLS Policy: respondent can create/read own appeal. Admin/moderator can read/update all.
-- Side effect: moderation_reports.appeal_count/final_status can be derived or denormalized by moderation-action.
```

### 1.19b friendships — **as-built (2026-07-10, 마이그 `20260710150000`)**

계약(contracts/FriendSystem.md §Supabase 스키마) 그대로 배포: `(id, user_id, friend_id, relationship_type friend|follow, status pending|accepted|rejected, created/updated/deleted_at)` + `no_self_friendship` CHECK + `unique(user_id, friend_id, relationship_type)` + 인덱스 3(user_id·friend_id·status). RLS: SELECT=당사자(`current_user_id() in (user_id, friend_id)`), **쓰기 정책 없음**(Edge service 전용 — 미러 행·rate-limit 서버 강제). `supabase_realtime` publication 등재(패널 실시간 갱신). 이름 해석은 `list-friends` Edge(users RLS=본인만).

**presence(DP-1, 마이그 `20260710160000`)**: `users.last_active_at timestamptz` 추가(본인 UPDATE=기존 `users_update_own` RLS). 온라인 판정은 `list-friends`가 친구관계 검증 후 `last_active_at<60s`(online) + 활성 `room_participants`(activity=room) 로 서버 계산 — 전역 Realtime presence 채널 폐기(전역 노출 0).

### 1.20 user_blocks

```sql
CREATE TABLE user_blocks (
  blocker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id)
);

-- 차단 시스템 이원화 통합 (FriendSystem.md ↔ livekit-edge-fn.md G-84):
--   FriendSystem.md의 차단(block) UI 액션은 이 테이블에 직접 INSERT한다.
--   이전에 friendships 테이블(relationship_type='blocked')과 분리되어 있어
--   실제 방 입장 차단이 작동하지 않던 문제를 해결.
--   
--   - 차단 생성: INSERT INTO user_blocks(blocker_user_id, blocked_user_id)
--   - 차단 해제: DELETE FROM user_blocks WHERE blocker_user_id=? AND blocked_user_id=?
--   - 나를 차단한 사람 조회: SELECT * FROM user_blocks WHERE blocked_user_id = current_user_id
--   
--   livekit-edge-fn.md §4 G-84 차단 게이트가 이 테이블을 조회해
--   차단된 사용자의 방 입장을 거부한다. 따라서 FriendSystem UI의 "차단"이
--   실제 기능(방 입장 차단)과 연결된다.
--
-- RLS Policy: users can create/delete/read only their own block rows.
-- Runtime: ChatPanel/Participant list must hide or collapse blocked users' messages client-side, while moderation still retains DB evidence.
```

### 1.20.1 export_requests

```sql
CREATE TABLE export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format TEXT NOT NULL DEFAULT 'json',  -- json, zip
  status TEXT NOT NULL DEFAULT 'queued',  -- queued, processing, ready, downloaded, expired, failed
  manifest_json JSONB DEFAULT '{}',  -- scoped list of included tables/objects, no foreign private data
  export_object_key TEXT,  -- R2 object key for generated archive; never public URL
  download_token_hash TEXT,  -- SHA256(raw one-time token), returned once by data-export-request/ready notification
  download_expires_at TIMESTAMP WITH TIME ZONE,
  downloaded_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: users can read own export request metadata only. No client INSERT/UPDATE/DELETE.
-- Edge Function: data-export-request creates queued row after recent reauth.
-- Worker/Edge: when ready, set export_object_key + download_token_hash + short download_expires_at.
-- Download: token is single-use; successful download atomically sets downloaded_at and status='downloaded'.
-- MUST NOT: store public URL, allow repeated downloads with same token, or include shared-room evidence/audit rows not owned by the user.
```

### 1.21 room_templates

```sql
CREATE TABLE room_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = system starter template
  title TEXT NOT NULL,
  genre TEXT,
  description TEXT,
  starter_script_json JSONB,  -- optional cues for first-room guidance
  authority_state_json JSONB DEFAULT '{}',
  background_url TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: all authenticated users can read system templates; owners can manage own templates.
-- Use Case: CreateRoomModal offers "campfire improv", "shorts prompt jam", "voice acting practice" starters.
```

### 1.22 room_artifacts

```sql
CREATE TABLE room_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,  -- vgen_job, recording, dub_output
  source_id UUID NOT NULL,
  title TEXT,
  thumbnail_object_key TEXT,
  media_object_key TEXT NOT NULL,
  share_url_cache TEXT,
  visibility TEXT DEFAULT 'room',  -- private, room, public_link
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policy: same-room users can read room visibility artifacts; owner can read private; public_link requires signed URL token.
-- RLS Policy: no direct public URL fallback. Signed URL refresh path is shared with VgenExport.
```

### 1.23 user_room_history

```sql
CREATE TABLE user_room_history (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  last_role TEXT DEFAULT 'actor',  -- actor, viewer
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  invite_again_count INT DEFAULT 0,
  PRIMARY KEY (user_id, room_id)
);

-- RLS Policy: users can read their own history. Host can use same-room history to suggest "recently played with" re-invites.
```

> **as-built (2026-07-08): 테이블 미생성 — YAGNI 편차.** "최근 방/함께한 사람"은 `room_participants` 행(세션당 1행, left 이력 보존)에서 파생 — Edge `list-recent-rooms`·`list-recent-people` 이 service_role 로 조회(타인 display_name 은 클라 RLS 로 못 읽음). 전용 원장이 필요해지는 시점(집계 성능·invite_again_count)에 승격.

### 1.24 room_reservations and notifications

```sql
CREATE TABLE room_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  title TEXT NOT NULL,
  invite_code_hash TEXT,
  status TEXT DEFAULT 'scheduled',  -- scheduled, live, cancelled, ended
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES room_reservations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- reservation_invite, reservation_reminder, re_invite, friend_request, friend_accepted, followed_creator_stream_start, avatar_job_done, avatar_job_failed (design-pending: report_update, consent_request)
  payload_json JSONB DEFAULT '{}',
  delivery_channel TEXT DEFAULT 'in_app',  -- in_app, email, push
  status TEXT DEFAULT 'pending',  -- pending, sent, failed, read
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE
);

-- RLS Policy: users can read/update(read_at) own notifications. Edge Functions insert/send only.
-- MVP: in_app is required; email/push can be enabled after provider config.
-- As-built (migration 20260708140000, verified vs prod DB 2026-07-14): live table is the reduced in-app slice —
--   columns id, user_id, type, payload(jsonb), room_id, read_at, created_at only (payload_json→payload; no
--   reservation_id/delivery_channel/status/sent_at). avatar_job_done / avatar_job_failed are written by the
--   notify_avatar_job_status AFTER UPDATE trigger on avatar_jobs (migration 20260713180000).
```

> **구현됨 (2026-07-08, 마이그 `20260708140000`·`20260708150000`) — 축소 as-built:**
> - `notifications`: 컬럼 축소(payload/room_id/read_at — reservation_id 는 payload 로, delivery_channel/status/sent_at 은 email/push provider 후속). read_at 만 클라 UPDATE(컬럼 그랜트로 나머지 변조 차단), realtime publication 등재. 지명 초대 payload 의 원문 invite_code 는 invited_user_id 고정이라 bearer 자격 아님(consume 의 not_invited 게이트).
> - `room_reservations`: 컬럼 축소(host_id/title/scheduled_at/reminded_at — **room_id·invite_code_hash·status 연결은 후속**: 예약=약속+알림, 방은 시작 때 생성). 대상자 원장 = reservation_invite 알림 행. 리마인더 = `send_reservation_reminders()`(30분 전·멱등) + pg_cron 10분 주기(프로드 cron.job 등재 실측).

### 1.25 polls and poll_responses — **as-built (2026-07-12, ROOM-22 관객 투표, 마이그 `20260712150000`)**

```sql
CREATE TABLE polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL CHECK (char_length(question) BETWEEN 1 AND 200),
  options JSONB NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 4),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'revealed', 'closed')),
  counts JSONB,  -- reveal 시 서버 집계 스냅샷(늦입장 percent 동기). open 동안 NULL — 중간 결과 비공개(MobileViewer §4.2)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- 방당 활성 폴 1개(activePoll 단일 모델) — 생성 경쟁은 DB 가 원자 차단
CREATE UNIQUE INDEX polls_one_active_per_room ON polls (room_id) WHERE status <> 'closed';

CREATE TABLE poll_responses (
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  choice_index INT NOT NULL CHECK (choice_index BETWEEN 0 AND 3),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)  -- 1인 1표. upsert = open 동안 변경 허용
);
```

- **FSM:** `open`(투표 가능·percent 비공개) → `revealed`(투표 마감·counts 스냅샷 공개) → `closed`(내려감). `open → closed` 직행 허용(공개 없이 폐기). 전이·집계는 호스트 전용 Edge(`create-poll`·`set-poll-status`)만.
- **RLS:** `polls` SELECT = `is_room_member(room_id)`(늦입장 초기 동기). `poll_responses` SELECT = 본인 행만(`user_id = current_user_id()`) — 중간 집계는 클라 SELECT 로 재구성 불가, reveal 릴레이/스냅샷만이 공개 경로. 쓰기는 두 테이블 모두 service_role 전용(클라 정책 없음).
- **라이브 동기:** Realtime 미사용 — `poll` 서버 릴레이 토픽(§2 as-built) + 입장 시 RLS fetch.

---

## 2. LiveKit DataChannel Protocol

All DataChannels are created during CONNECTED state (see state-machines/_INDEX.md §5).

**SSOT:** 허용 DataChannel은 `room-authority`, `script-cue`, `chat`, `blendshape` 4개뿐이다. 클라이언트가 채팅/반응/투표를 직접 publish하지 않는다. 사용자 입력은 `send-chat`, `send-viewer-chat`, `send-viewer-reaction`, `submit-viewer-poll` Edge Function이 sanitize/rate-limit/audit 후 `messages` INSERT 또는 server relay로 브로드캐스트한다.

> **as-built 토픽 추가 (2026-07-09, ROOM-14)** — `script-role` (reliable, 서버 릴레이 전용): 대본 역할 클레임 동기. `sync-script-role` Edge 가 auth 로 클레이머를 확정 후 broadcast, 수신측은 `participant=undefined`(서버발)만 수락(SEC-5 동형). 메시지: `{kind:'set', role, authId, name}` · `{kind:'clear', role}`. 늦입장 동기는 각 클레이머가 memberKey 변동 시 자기 클레임 재전송(멱등, cue warm-up 동형) — 호스트 전체맵 sync 는 호스트 새로고침 시 전원 초기화 회귀가 있어 채택 안 함. 퇴장자 클레임은 수신측 렌더 파생 prune. room-authority 타입에 `script_mode` 추가(as-built).

> **as-built 토픽 추가 (2026-07-12, ROOM-22)** — `poll` (reliable, 서버 릴레이 전용): 관객 투표 동기. `create-poll`·`set-poll-status`·`submit-viewer-poll` Edge 만 발신, 수신측은 서버발(`participant=undefined`)만 수락(SEC-5 동형). 메시지: `{type:'poll_open', poll:{id,question,options}}` · `{type:'poll_vote', poll_id, total_votes}`(총계만 — 선택지별 중간 결과는 비공개) · `{type:'poll_reveal', poll_id, counts, total_votes}` · `{type:'poll_close', poll_id}`. 늦입장 동기는 §1.25 RLS fetch(멱등 — 릴레이 유실 시에도 수렴).

### 2.1 room-authority (Reliable, Ordered)

Used for host-initiated room state changes (slot, background, sound, cue).

**Message Format:**
```json
{
  "type": "slot_changes | bg_change | sound_trigger | cue_advance | host_transfer | room_end | vgen_mode_open | vgen_mode_close | vgen_prompt_patch | vgen_result | vgen_trigger_ack | dub_mode_open | dub_mode_close",
  "payload": {
    "slot_id": "uuid",
    "background_url": "string",
    "sound_id": "uuid",
    "cue_index": 5
  },
  "host_id": "uuid",
  "authority_epoch": 42,
  "seq": 1234,
  "timestamp_ms": 1624561200000
}
```

**Fields:**
- `type`: action category — G-45 완전화: 12개 타입 모두 명시
  - `slot_change` — 슬롯 배치 변경
  - `bg_change` — 배경 변경
  - `sound_trigger` — 사운드보드 효과음
  - `cue_advance` — 대본 큐 진행
  - `host_transfer` — 호스트 권한 이전 (authority_epoch 증가)
  - `room_end` — 방 종료 broadcast
  - `vgen_mode_open` — VgenPanel: 호스트가 VGen 프롬프트 패널 열기 broadcast
  - `vgen_mode_close` — VgenPanel: 패널 닫기 broadcast (생성 완료 포함)
  - `vgen_prompt_patch` — VgenPanel: 섹션별 LWW prompt patch
  - `vgen_result` — VgenPanel: 생성 완료, payload: { url: string }
  - `vgen_trigger_ack` — VgenPanel: 트리거 중복 응답, payload: { job_id, status: 'accepted'|'duplicate' }
  - `dub_mode_open` — DUB: 호스트가 DUB 오버레이 열기
  - `dub_mode_close` — DUB: DUB 오버레이 닫기
- `payload`: varies by type; opaque to transport
- `host_id`: current host UUID (guards against seq collision after host transfer)
- `authority_epoch`: increments on host transfer; receivers drop older epoch messages (replay 방어, SecurityPolicies §8.4.2)
- `seq`: monotonic counter per host (resets on host transfer)
- `timestamp_ms`: milliseconds since epoch (for drift detection)

**Frequency:** ~0.1 Hz (occasional control changes)

**Per-message auth matrix (receiver MUST enforce LiveKit participant identity, not payload `host_id`):**

| Message type | Allowed sender | Durable side effect |
|---|---|---|
| `slot_change`, `bg_change`, `sound_trigger`, `cue_advance`, `host_transfer`, `room_end`, `vgen_mode_open`, `vgen_mode_close`, `vgen_result`, `vgen_trigger_ack`, `dub_mode_open`, `dub_mode_close` | current host or server relay only | DB/Edge write required where state persists |
| `vgen_prompt_patch` | active participant in same room while `stageStore.mode='vgen'` | no direct DB write; bounded LWW patch only |
| `invite_to_stage`, `slow_mode`, `chat_clear` | current host or server relay only | Edge Function/DB audit required before broadcast |

`vgen_prompt_patch` payload is limited to `{ section_id, content, updated_at, author_id }`, max 4KB, 300ms debounce, and server/client receivers drop patches from non-participants. Host-only commands must never be accepted from actor/viewer clients even if `payload.host_id` claims host.

**Use Case:** Host clicks "next cue" → increments seq → broadcasts message → all clients update stageStore.cue_index

---

### 2.2 script-cue (Reliable, Ordered)

Synchronizes script cue navigation between host and actors.

**Message Format:**
```json
{
  "cue_index": 5,
  "issuer_id": "uuid",
  "authority_epoch": 42,
  "timestamp_ms": 1624561200000
}
```

**Frequency:** ~0.5 Hz (typically once per 2-5 seconds during script navigation)

**Use Case:** Host clicks "prev/next cue" → DataChannel sends message → all actors' UI jumps to cue index

---

### 2.3 chat (Reliable, Ordered)

Text messages and reaction emojis.

**Message Format (chat):**
```json
{
  "type": "chat",
  "sender_id": "uuid",
  "sender_name": "Alice",
  "text": "Great acting!",
  "seq": 42,
  "idempotency_key": "sha256_hash",
  "timestamp_ms": 1624561200000
}
```

**Fields:**
- `seq`: sender별 monotonic sequence (HIGH 해소). 각 클라이언트가 로컬에서 increment. 수신 측은 seq로 순서 복원 — gap 허용 (패킷 손실 시), reorder 감지 (seq < lastSeq 시 무시 또는 재정렬).
- `idempotency_key`: C5 멱등성 키. 클라이언트 재시도 시 중복 저장 방지 (SHA256(sender_id + room_id + text + floor(timestamp/10000)*10000)).

**Message Format (reaction):**
```json
{
  "type": "reaction",
  "sender_id": "uuid",
  "reaction_kind": "clap",
  "emoji": "👏",
  "timestamp_ms": 1624561200000,
  "ttl_ms": 3000
}
```

**Reaction whitelist:** `clap`, `check`, `question`, `heart`, `laugh`.
**Rate limit:** sender당 초당 5개 초과 drop. `ttl_ms`는 1000~5000 범위만 허용.

**Frequency:** Variable (async user input)

**Use Case:** User types message → Edge Function sanitizes/rate-limits → stores to `messages` table → server relay or Realtime sends `chat` message → all clients render in chat panel. Clients MUST NOT publish user chat directly to `chat`.

---

### 2.4 blendshape (Unreliable, Unordered)

Expression tracking (52 ARKit blendshape coefficients at 30fps). [개발 예정]

**Message Format:**
```json
{
  "blendshapes": [0.5, 0.2, 0.0, ...],  -- Float32Array of length 52
  "timestamp_ms": 1624561200000,
  "calibration_version": 1,
  "seq": 1234,
  "byte_length": 208,
  "crc16": 51321
}
```

**Frequency:** 30 Hz (~33ms per frame)

**Packet Loss Tolerance:** Yes. Receiver MUST drop frames when `byte_length != 208`, `crc16` mismatches, or `seq` is older than the newest accepted frame.

**Use Case:** MediaPipe Worker extracts blendshapes → sends via DataChannel → other clients receive and apply to rig parameters

---

### 2.5 LiveKit Events (DB-Independent)

The following features are transmitted via LiveKit but **not persisted to database**:

#### Audience Reactions (Ephemeral)
- **Transport:** `send-viewer-reaction` Edge Function → server relay over `chat` DataChannel with `type: 'reaction'`
- **Message Format:** `{ type: 'reaction', sender_id, reaction_kind, emoji, timestamp_ms, ttl_ms }`
- **Whitelist/TTL:** `reaction_kind` whitelist above, `ttl_ms` max 5000, rate limit 5/sec/sender
- **Persistence:** None — reactions disappear when room closes (ROOM-12)
- **Use Case:** Authenticated audience sends emoji reaction → server validates participant + whitelist + rate limit → broadcast to all participants → display floating animation. Anonymous viewer is read-only in MVP.

#### Director Notes (Optional DB Storage)
- **Transport:** `send-chat`/`send-director-note` Edge Function → server relay over `chat` DataChannel with `message_type='note'`
- **Message Format:** `{ type: 'chat', message_type: 'note', sender_id, text, timestamp_ms }`
- **Persistence:** Default none for session-only notes. If logging required, insert to `messages` table with `message_type='note'`.
- **Use Case:** Director sends note during live session → Edge Function validates host/director role → visible in director-only panel (ROOM-17)

---

## 3. Supabase Storage Paths

### 3.1 Avatar Models

```
/models/{user_id}/
  rig.json
  parts/
    part_001.png
    part_002.png
    ...
  preview.png
```

### 3.2 Scene Assets

```
/scenes/system/
  {slug}/layers/{layer_id}.png   -- 레이어 분해 PNG (§1.7 layers_json · design/scene-prompts.md)
  _shared/glow_dust.png          -- 공용 파티클 텍스처
/scenes/rooms/{room_id}/
  custom_scene_001.jpg
  custom_scene_002.jpg
  ...
```

### 3.3 Room Assets

```
/rooms/{room_id}/
  backgrounds/
    scene_001.jpg
    scene_002.jpg
    ...
  script.json
  recording_meta.json  -- MediaRecorder metadata
```

### 3.4 Recordings

```
/recordings/{room_id}/
  {recording_id}.webm  -- stored on R2 or Supabase Storage
```

### 3.5 Profile Images

```
/users/{user_id}/
  avatar.png
```

---

## 4. RLS (Row-Level Security) Summary

| Table | Read | Update | Delete | Insert |
|-------|------|--------|--------|--------|
| users | Own row + same-room display fields only (`id`, `display_name`, `avatar_url`, `status`) | Own profile only | N/A | On auth signup |
| rooms | Host, active participants, valid invited users; public list via `public_rooms` view only | Host only | Host only | Any authenticated |
| room_secrets | Edge Function only | Edge Function only | Host via Edge Function | Edge Function only |
| room_invites | Host + invited user metadata | Host revoke only | Host only | Host via Edge Function |
| room_participants | Same-room active users only | Host (mute/disable/character) or own audio | Host or participant left | Join gate only |
| models | Own + public models | Own only | Own only | Users can create |
| scripts | Same-room users only | Host only | Host only | On upload |
| messages | Same-room users only | Edge Function only (status/tombstone) | No hard delete in MVP; moderation hides via status/tombstone | Edge Function only |
| scenes | All authenticated (read) | Host custom scenes only | Host custom scenes only | Host only |
| vgen_jobs | Visibility gate: public (all) / members_only (same room) / private (creator/host) | Host only (status/result/visibility) | Host only | Host only (trigger) |
| credits | Own row only | Edge Function only | N/A | On user signup |
| credit_transactions | Own ledger only | Edge Function only | N/A | Edge Function only |
| recordings | Visibility gate: public (all) / members_only (same room) / private (owner/host) | Recorder/host only | Recorder/host only | Recorder only |
| dub_sessions | Same-room users only | Creator/host only (status) | Creator/host only | Room members only |
| dub_tracks | Same-room users only | Assigned participant (recording) / Host (timing/speaker) | Host only | Host only |
| dub_outputs | Same-room users only | N/A | Creator/host only | Host only |
| obs_viewer_tokens | Host only (발급·폐기·조회) | Host only | Host only (revoke) | Host only (발급) |
| audit_logs | Admin all, own actor rows only | N/A | N/A | Edge Function only |
| account_restrictions | Admin/moderator only | Admin/moderator via Edge Function | Admin/moderator via Edge Function | moderation-action only |
| moderation_reports | Reporter own + admin all | Admin/moderator only | N/A | Authenticated reporter |
| reports_appeals | Respondent own + admin all | Admin/moderator only | N/A | Report respondent |
| user_blocks | Own block rows only | Own rows only | Own rows only | Own rows only |
| vgen_appeals | Requester/host/admin | Admin/moderator only | N/A | Owner or host via Edge Function |
| export_requests | Own metadata only | Edge/worker only | Edge/worker only | Edge Function only |
| room_templates | System all + owner own | Owner/admin only | Owner/admin only | Owner/admin only |
| room_artifacts | Owner/private + same-room + signed public link | Owner/host only | Owner/host only | Edge Function only |
| user_room_history | Own history only | Edge Function only | Own rows only | Edge Function only |
| room_reservations | Host + invited users | Host only | Host only | Host only |
| notifications | Own notifications only | Own read_at only | N/A | Edge Function only |

---

## 5. Realtime Subscriptions

| Table | Channel | Events | Filter |
|---|---|---|---|
| rooms | `rooms` | INSERT, UPDATE | room_id match |
| room_participants | `room_participants` | INSERT, UPDATE, DELETE | room_id match |
| scripts | `scripts` | UPDATE | room_id match (cue_index) |
| messages | `messages` | INSERT | room_id match |
| vgen_jobs | `vgen_jobs` | UPDATE | room_id match (status, result_url) |
| dub_sessions | `dub_sessions` | UPDATE | room_id match (status, diarization_result_json) |
| dub_tracks | `dub_tracks` | UPDATE | dub_session_id match (recording_url, status) |
| dub_outputs | `dub_outputs` | UPDATE | dub_session_id match (status, output_video_url) |

**Example listener (Zustand):**
```typescript
useEffect(() => {
  const sub = supabase
    .channel(`room:${room_id}`)
    .on('postgres_changes', 
      { event: 'UPDATE', schema: 'public', table: 'rooms' },
      (payload) => roomStore.updateRoom(payload.new)
    )
    .subscribe();
  return () => sub.unsubscribe();
}, [room_id]);
```

---

## 6. Indexes

```sql
-- rooms
CREATE INDEX idx_rooms_host_id ON rooms(host_id);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_created_at ON rooms(created_at DESC);

-- room_secrets / room_invites
CREATE INDEX idx_room_invites_room_id ON room_invites(room_id);
CREATE INDEX idx_room_invites_invited_user_id ON room_invites(invited_user_id);
CREATE INDEX idx_room_invites_code_hash ON room_invites(invite_code_hash);

-- room_participants
CREATE INDEX idx_room_participants_room_id ON room_participants(room_id);
CREATE INDEX idx_room_participants_user_id ON room_participants(user_id);
CREATE INDEX idx_room_participants_state ON room_participants(state);

-- models
CREATE INDEX idx_models_user_id ON models(user_id);
CREATE INDEX idx_models_is_default ON models(is_default);

-- scripts
CREATE INDEX idx_scripts_room_id ON scripts(room_id);

-- messages
CREATE INDEX idx_messages_room_id ON messages(room_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- scenes
CREATE INDEX idx_scenes_category ON scenes(category);
CREATE INDEX idx_scenes_is_system ON scenes(is_system);
CREATE INDEX idx_scenes_created_by ON scenes(created_by);

-- vgen_jobs
CREATE INDEX idx_vgen_jobs_room_id ON vgen_jobs(room_id);
CREATE INDEX idx_vgen_jobs_prompt_hash ON vgen_jobs(prompt_hash);
CREATE INDEX idx_vgen_jobs_status ON vgen_jobs(status);
CREATE INDEX idx_vgen_jobs_created_at ON vgen_jobs(created_at DESC);

-- credit_transactions
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at DESC);

-- recordings
CREATE INDEX idx_recordings_room_id ON recordings(room_id);
CREATE INDEX idx_recordings_user_id ON recordings(user_id);
CREATE INDEX idx_recordings_status ON recordings(status);

-- dub_sessions
CREATE INDEX idx_dub_sessions_room_id ON dub_sessions(room_id);
CREATE INDEX idx_dub_sessions_created_by ON dub_sessions(created_by);
CREATE INDEX idx_dub_sessions_status ON dub_sessions(status);
CREATE INDEX idx_dub_sessions_created_at ON dub_sessions(created_at DESC);

-- dub_tracks
CREATE INDEX idx_dub_tracks_dub_session_id ON dub_tracks(dub_session_id);
CREATE INDEX idx_dub_tracks_participant_id ON dub_tracks(participant_id);
CREATE INDEX idx_dub_tracks_status ON dub_tracks(status);

-- dub_outputs
CREATE INDEX idx_dub_outputs_dub_session_id ON dub_outputs(dub_session_id);
CREATE INDEX idx_dub_outputs_status ON dub_outputs(status);

-- moderation / audit
CREATE INDEX idx_audit_logs_room_id ON audit_logs(room_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_moderation_reports_status ON moderation_reports(status);
CREATE INDEX idx_moderation_reports_room_id ON moderation_reports(room_id);
CREATE INDEX idx_reports_appeals_report_id ON reports_appeals(report_id);
CREATE INDEX idx_vgen_appeals_job_id ON vgen_appeals(job_id);
CREATE INDEX idx_user_blocks_blocker ON user_blocks(blocker_user_id);
CREATE INDEX idx_export_requests_user_status ON export_requests(user_id, status, created_at DESC);
CREATE INDEX idx_export_requests_token_hash ON export_requests(download_token_hash);

-- templates / artifacts / social loop
CREATE INDEX idx_room_templates_system ON room_templates(is_system, genre);
CREATE INDEX idx_room_artifacts_room_id ON room_artifacts(room_id, created_at DESC);
CREATE INDEX idx_room_artifacts_user_id ON room_artifacts(user_id, created_at DESC);
CREATE INDEX idx_user_room_history_user ON user_room_history(user_id, last_seen_at DESC);
CREATE INDEX idx_room_reservations_scheduled_at ON room_reservations(scheduled_at);
CREATE INDEX idx_notifications_user_status ON notifications(user_id, status, created_at DESC);
```

---

## 7. Data Shape Contracts (TypeScript)

### User Profile
```typescript
type User = {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  language: 'ko' | 'ja' | 'en';
  is_admin: boolean;
};
```

### Room
```typescript
type Room = {
  id: string;
  host_id: string;
  title: string;
  status: 'waiting' | 'live' | 'ended';
  is_demo: boolean;
  is_locked: boolean;
  template_id?: string;
  max_participants: number;
  current_participants: number;
  background_url?: string;
  authority_state_json?: object;
  authority_epoch: number;
  cue_operator_id?: string;
  live_participant_count: number;
  emptied_at?: string;
};
```

`Room` 타입과 클라이언트 응답에는 `password_hash`가 절대 포함되지 않는다.

### Participant
```typescript
type RoomParticipant = {
  id: string;
  room_id: string;
  user_id: string;
  slot_index?: number;
  role: 'actor' | 'viewer';
  role_source?: 'invite' | 'user_choice' | 'mobile_downgrade' | 'guest_demo' | 'fallback_no_camera';
  state: 'joining' | 'connected' | 'active' | 'muted' | 'inactive' | 'left';
  audio_enabled: boolean;
  muted_by_host: boolean;
  muted_until?: string;
  is_disabled_by_host: boolean;
  character_role?: string;  // 배우에게 할당된 캐릭터명 (e.g., "리온"); NULL = 미할당 (ROOM-14)
  is_tracking_failed?: boolean;  // 표정 트래킹 실패 폴백 상태 (ROOM-11)
};
```

### Model
```typescript
type AvatarModel = {
  id: string;
  user_id: string;
  name: string;
  rig_url: string;
  preview_image_url?: string;
  is_default: boolean;
};
```

### Script
```typescript
type Script = {
  id: string;
  room_id: string;
  title?: string;
  language: 'ko' | 'ja' | 'en';
  cues_json: Array<{
    index: number;
    character_role: string;
    text: string;
    duration_ms?: number;
  }>;
  current_cue_index: number;
  is_active: boolean;
};
```

### Message
```typescript
type Message = {
  id: string;
  room_id: string;
  user_id: string;
  content?: string;
  message_type: 'chat' | 'reaction' | 'system' | 'note';
  reaction_emoji?: string;
  status: 'visible' | 'hidden' | 'tombstone';
  hidden_reason?: 'user_block' | 'moderator_action' | 'deleted_by_author' | 'automated_filter';
  hidden_at?: string;
  deleted_at?: string;
  created_at: string;
};
```

### Scene
```typescript
type Scene = {
  id: string;
  name: string;
  category: 'fantasy' | 'sci-fi' | 'modern' | 'custom';
  image_url: string;
  thumbnail_url?: string;
  palette_mood?: 'warm' | 'cool' | 'dark' | 'bright';
  accent_color?: string;  // hex color code
  layers_json?: SceneLayer[];
  is_system: boolean;
  created_by?: string;
  created_at: string;
};
```

### VGen Job
```typescript
type VGenJob = {
  id: string;
  room_id: string;
  triggered_by: string;
  prompt_text: string;
  prompt_hash: string;
  prompt_snapshot?: string;
  egress_id?: string;
  status: 'pending' | 'generating' | 'done' | 'failed' | 'flagged';
  appeal_status?: 'pending' | 'reviewing' | 'approved' | 'rejected';
  failure_reason?: 'moderation_rejected' | 'post_moderation_rejected' | 'provider_error' | 'timeout' | 'validation_failed';
  result_object_key?: string;
  result_url?: string;
  provider: string;
  model_id: string;
  provider_job_id?: string;
  duration_sec: number;
  estimated_cost_usd?: number;
  credit_cost: number;
  output_format: '16:9' | '9:16';
  output_9x16_url?: string;
  clip_count: number;
  flagged_categories?: string[];
  validation_status: 'pending' | 'passed' | 'failed';
  credit_deducted_at?: string;
  credit_refunded_at?: string;
  created_at: string;
  completed_at?: string;
};
```

### Credits
```typescript
type Credits = {
  id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  updated_at: string;
};
```

### Credit Transaction
```typescript
type CreditTransaction = {
  id: string;
  user_id: string;
  amount: number;
  reason: 'vgen_job' | 'purchase' | 'bonus' | 'refund';
  ref_id?: string;
  created_at: string;
};
```

### Recording
```typescript
type Recording = {
  id: string;
  room_id: string;
  user_id: string;
  storage_object_key: string;
  signed_url_cache?: string;
  duration_ms?: number;
  file_size_bytes?: number;
  status: 'recording' | 'processing' | 'ready' | 'failed';
  started_at: string;
  ended_at?: string;
  created_at: string;
};
```

### DUB Session
```typescript
type DubSession = {
  id: string;
  room_id: string;
  created_by: string;
  source_video_url: string;
  source_type: 'mp4' | 'youtube';
  youtube_url?: string;
  whisper_job_id?: string;
  diarization_result_json?: {
    segments: Array<{
      speaker: string;
      start_ms: number;
      end_ms: number;
      text: string;
    }>;
  };
  status: 'uploaded' | 'transcribing' | 'ready' | 'recording' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
  completed_at?: string;
  updated_at: string;
};
```

### DUB Track
```typescript
type DubTrack = {
  id: string;
  dub_session_id: string;
  participant_id: string;
  speaker_name: string;
  start_time_ms: number;
  end_time_ms: number;
  transcript_text: string;
  recording_url?: string;
  recording_duration_ms?: number;
  calibration_offset_ms?: number;
  status: 'assigned' | 'recording' | 'submitted' | 'synced';
  created_at: string;
  updated_at: string;
};
```

### DUB Output
```typescript
type DubOutput = {
  id: string;
  dub_session_id: string;
  status: 'compositing' | 'ready' | 'failed';
  output_video_url?: string;
  file_size_bytes?: number;
  duration_ms?: number;
  error_message?: string;
  created_at: string;
  completed_at?: string;
};
```

---

## 8. Migration Path

### Phase 1: Core Tables (MVP)
1. Create tables in order: users → rooms → room_participants → models → scripts → messages
2. Enable RLS on all tables (restrict by default, then add policies)
3. Create Realtime subscriptions on rooms, room_participants, scripts, messages

### Phase 2: Content & Monetization (Current)
1. Create: scenes, vgen_jobs, credits, credit_transactions, recordings
2. Enable RLS on new tables
3. Create Realtime subscription on vgen_jobs.status
4. Create indexes on new tables (see §6)

### Phase 3: Safety, Artifacts & Social Loop (P1)
1. audit_logs, moderation_reports, user_blocks, export_requests
2. room_templates, room_artifacts
3. user_room_history
4. room_reservations, notifications
5. acting_streak / badges / friend graph stay P2 until the recent-room loop works

### Indexes
1. Add composite indexes for frequently filtered queries (room_id + state, user_id + is_default)
2. Index created_at DESC for sorting
3. Indexes for new tables as per §6

### Storage Buckets
1. Create private bucket: `models/` (rig.json + PNG parts; access via signed URL unless explicitly public sample)
2. Create private bucket: `rooms/` (room backgrounds; access via signed URL)
3. Create private bucket: `users/` (profile avatars; public display goes through sanitized CDN/signed URL)
4. Create private bucket: `scenes/` (system + custom room scenes; system assets may be mirrored to public CDN)
5. Create private bucket: `recordings/` (encoded videos; DB stores object keys, not durable signed URLs)

---

## PENDING

Implementation checklist for features not yet schematized.

### P0 — 온보딩 컬럼 (COMPLETED ✓)
- [x] Onboarding Step & Genre Preference — users.onboarding_step (NULL|'intro'|'genre'|'lobby'|'done'), users.preferred_genres TEXT[] (§1.1). Source: ONBOARDING-FLOW.md, state-machines/Onboarding.md

### P1 — MVP Phase 2 (COMPLETED ✓)
- [x] Scene Catalog — scenes 테이블 (§1.7). Storage: `scenes/system/` + `scenes/rooms/{room_id}/`. CSS var(--scene-accent). Source: DESIGN-DIRECTION.md §4
- [x] VGen Jobs — vgen_jobs 테이블 (§1.8). Seedance integration, credit tracking. Source: VGEN-03/04/05
- [x] Credit System — credits + credit_transactions tables (§1.9). Edge Function mutations only. Source: INF-06, SET-08
- [x] Recordings — recordings 테이블 (§1.10). Storage on R2/Supabase Storage. Source: ROOM-13
- [x] Character Role Assignment — room_participants.character_role + is_tracking_failed (§1.3). Source: ROOM-09, ROOM-14, ROOM-11

### P1 — DUB Sessions (SCHEMATIZED, CODE NOT IMPLEMENTED)
- [x] DUB Session Management — dub_sessions table (§1.12). Source: FEATURE-SPEC DUB-01/02
- [x] DUB Tracks — dub_tracks table (§1.13). Source: FEATURE-SPEC DUB-03/04
- [x] DUB Final Output — dub_outputs table (§1.14). Storage object key + signed URL only. Source: FEATURE-SPEC DUB-05

### P1 — Room v2 (NOT YET IMPLEMENTED)
- [x] Expression Sensitivity Presets — expression_presets 테이블 (§1.15). user_id·preset_name·sensitivity_json JSONB. Source: SET-05, SettingsPage.md
- [x] Timed Turns Progress Bar — turn_timings 테이블 (§1.16). room_id·participant_id·cue_index·started_at. Source: TimedTurnsProgressBar.md
- [x] Participant Event Reactions (ROOM-19) — DONE: Ephemeral `chat` relay message `type='reaction'` specified in §2.5 (reaction_kind whitelist, ttl_ms≤5000, rate limit 5/sec/sender). No DB persistence. Source: RUNTIME-HARDENING-REVIEW H13

### P1 — Safety / Artifacts / Social Loop (SCHEMATIZED, CODE NOT IMPLEMENTED)
- [x] Audit Logs — audit_logs table (§1.18). Source: SEC-04, INF-07
- [x] Reports / Appeals / User Blocks — moderation_reports + reports_appeals + user_blocks tables (§1.19~1.20). Source: SEC-04, SET-07
- [x] Room Templates — room_templates table (§1.21). Source: CNT-08, PLATFORM-ARCHITECTURE §4.7.A
- [x] Room Artifacts / Gallery — room_artifacts table (§1.22). Source: ROOM-13, CNT-07, VGEN-12
- [x] Recent Room Re-invite — user_room_history table (§1.23). Source: LOB-08
- [x] Reservations / Notifications — room_reservations + notifications tables (§1.24). Source: LOB-06

### P2 — Engagement & Social (FUTURE)
- [ ] Acting Streak (Snapchat pattern) — Need: streak_count, last_active_date columns on users; streak_events table for analytics. Source: PLATFORM-ARCHITECTURE §4.7.D
- [ ] Acting Role Badge (Steam pattern) — Need: role_badges table (role_id, user_id, earned_at, category). Source: PLATFORM-ARCHITECTURE §4.7.E
- [ ] Follow / Friend System (Letterboxd pattern) — Need: user_follows table (follower_id, followee_id, created_at); friend_requests table for approval flow. Source: PLATFORM-ARCHITECTURE §4.5 (future landing page personalization)
- [ ] Performance Card / Session Report — Need: session_reports table (session_id, room_id, user_id, duration_ms, performance_score, recording_url). Source: PLATFORM-ARCHITECTURE §4.7.D engagement layer
