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

