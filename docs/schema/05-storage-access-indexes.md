
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
