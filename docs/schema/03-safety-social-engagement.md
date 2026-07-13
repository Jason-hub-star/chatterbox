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

