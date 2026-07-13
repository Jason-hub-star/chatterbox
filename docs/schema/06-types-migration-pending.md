
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
