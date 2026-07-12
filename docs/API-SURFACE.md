---
tags: [hub, spec]
---

# API Surface — Edge Functions, RPC, Client Reads

> SSOT for server boundaries. Updated: 2026-07-08.
> Goal: implementation can start without hunting across contracts for endpoint shape, auth, inputs, outputs, and side effects.

> **구현 현황 (2026-07-08, 로비 수직기능 페이즈루프)** — 아래 표는 풀비전 스펙이고, 이번에 배포된 as-built 는 축소형(상세 편차는 contracts/LobbyPage·ViewerGate·GreenRoom as-built + GAP-MATRIX Phase 1~7 행):
> - **초대(LOB-05)**: `create-room-invite`(Host — role actor/viewer·max_uses·expires_h·**invited_user_id**=지명 1회권+re_invite 알림) / `verify-invite-code`(Auth·read-only, `{ room_id, title, host_display_name, role }` 축소 응답, user당 5회/5분) / `accept-invite`(`consume_room_invite` RPC 원자 소비 → join RPC 멱등. **편차: 유효 초대는 잠금방 비번 생략**, device_type·Quick Ready 미구현).
> - **뷰어**: `join-as-viewer`(Auth — 좌석·정원 비점유, 잠금방 403) + `join_room_as_viewer`/`join_room_as_participant` v2 RPC(뷰어 제외 정원·실 role 반환). 표의 join-public-room viewer 형태와 달리 **join-public-room 은 actor 전용 유지**, 뷰어는 전용 함수.
> - **소셜/예약**: `list-recent-rooms`·`list-recent-people`(Auth — room_participants 파생, user_room_history 테이블 미생성) / `create-reservation`(Auth — 예약+reservation_invite 알림, 방·초대코드 연결은 후속) / notifications 는 Edge 없이 RLS 직접 SELECT + realtime.
> - 미구현 유지: refresh-livekit-token·end-room·set-participant-safety(kick/mute 는 별도 함수 기구현)·signed-asset-url(자산별 개별 함수로 대체 중)·idempotency_key/audit_logs 일반화.

## Rules

- Browser code may use only `VITE_*` public values. Provider keys and LiveKit signing secrets stay in Edge Function/Worker secrets.
- Mutations that spend credits, issue LiveKit tokens, touch R2 objects, moderate content, or write audit logs go through Edge Functions.
- Plain Supabase client reads are allowed only where RLS already expresses the full rule.
- All mutating Edge Functions accept `Authorization: Bearer <supabase_access_token>` unless marked `Public` or `Admin`.
- Every mutation that can be retried accepts `idempotency_key` and writes an `audit_logs` row when safety, credit, token, or moderation state changes.
- Invite verification is read-only. Only `accept-invite` may increment use count or create/update `room_participants`.
- Age gate is P0 for room entry, demo entry, recording, DUB, OBS, and VGEN flows. Edge Functions must re-check `users.age_band` where applicable.
- Active `account_restrictions` are checked server-side before room creation, room join, LiveKit token issue, and VGEN trigger.

## Auth Levels

| Level | Meaning |
|---|---|
| `Public` | No session required. Must be rate limited by IP/session. |
| `Auth` | Any authenticated Supabase user. |
| `Participant` | Auth user has active `room_participants` row for `room_id`. |
| `Actor` | Participant with `role='actor'` or room host. |
| `Host` | `rooms.host_id = users.id`. |
| `Owner` | User owns the target resource. Host may be additionally allowed per endpoint. |
| `Admin` | Moderator/admin service UI or service role only. |

## Core Room APIs

| Endpoint | Auth | Input | Output | Side Effects | Source |
|---|---|---|---|---|---|
| `POST /functions/v1/create-room` | `Auth` | `{ title, visibility, password?, language, mode, max_participants, template_id?, idempotency_key }` | `{ room_id, host_participant_id, invite_code? }` | Check `account_restrictions.can_create_room`; insert `rooms`, `room_secrets?`, host `room_participants`, optional `room_invites`, `audit_logs` | [[DATA-SCHEMA]], [[LobbyPage]], [[SecurityPolicies]] |
| `POST /functions/v1/verify-invite-code` | `Public` or `Auth` | `{ invite_code, expected_room_id? }` | `{ valid, room_id, title, role_hint, role_source, expires_at, requires_auth, requires_password, reason? }` | Read-only. Validate invite hash, expiry, revocation. If `expected_room_id` is present, require `invite.room_id === expected_room_id`. No use-count increment, no participant creation. Rate limit by IP + code hash | [[DATA-SCHEMA]], [[SecurityPolicies]], [[ViewerGate]] |
| `POST /functions/v1/accept-invite` | `Auth` | `{ invite_code, room_id, requested_role?, device_type: 'desktop'|'mobile', idempotency_key }` | `{ room_id, participant_id, role, role_source, greenroom_required }` | Validate `room_invites`, check age/block/capacity/`account_restrictions.can_join`, increment usage, insert/update `room_participants`; mobile/guest actors downgrade to viewer | [[DATA-SCHEMA]], [[ONBOARDING-FLOW]], [[LobbyPage]] |
| `POST /functions/v1/join-public-room` | `Auth` | `{ room_id, requested_role?: 'viewer', idempotency_key }` | `{ room_id, participant_id, role: 'viewer' }` | Atomic capacity check + viewer insert; age/block/`account_restrictions.can_join` gates; no SELECT count → INSERT split | [[ViewerGate]], [[SecurityPolicies]] |
| `POST /functions/v1/livekit-token` | `Participant` or `Host` | `{ roomName }` | `{ server_url, token, jti, token_version }` | Sign LiveKit JWT with participant `token_version` metadata; block ended room, disabled participant, stale/restricted participant, block relationships; audit token issue | [[livekit-edge-fn]], [[SecurityPolicies]] |
| `POST /functions/v1/refresh-livekit-token` | `Participant` or `Host` | `{ room_id, current_jti? }` | `{ server_url, token, jti }` | Same gates as `livekit-token`; audit token refresh | [[livekit-edge-fn]] |
| `POST /functions/v1/leave-room` | `Participant` | `{ room_id }` | `{ ok: true, new_host_id? }` | Set participant `state='left'`; auto host transfer when needed | [[livekit-edge-fn]], [[HostAuthority]] |
| `POST /functions/v1/end-room` | `Host` | `{ room_id, reason?, idempotency_key }` | `{ ok: true, status: 'ended' }` | Soft-end only: set `rooms.status='ended'`, revoke tokens, audit. No room hard DELETE/R2 purge by host | [[DATA-SCHEMA]], [[Room]] |
| `POST /functions/v1/kick-participant` | `Host` | `{ room_id, target_user_id, reason?, idempotency_key }` | `{ ok: true }` | Disable/left target participant, LiveKit removeParticipant, audit log | [[livekit-edge-fn]], [[HostConsole]] |
| `POST /functions/v1/set-participant-safety` | `Host` | `{ room_id, target_user_id, action: 'warn'|'mute'|'kick', duration_sec?, reason?, idempotency_key }` | `{ ok: true, muted_until? }` | Warning system message, timed mute, or kick; audit log | [[HostConsole]], [[DATA-SCHEMA]] |
| `POST /functions/v1/advance-script-cue` | `Host` | `{ room_id, scene_id, cue_index }` | `{ ok: true }` | Host 서버검증 후 `script-cue` 토픽으로 방 전체 broadcast(server relay). 클라 직접 publish 금지 — 수신측은 서버발(participant undefined)만 수락(진행권한 스푸핑 방어, SEC-5) | [[ScriptPanel]], [[SecurityPolicies]] |
| `POST /functions/v1/set-room-background` | `Host` | `{ room_id, background_url }` | `{ ok: true, background_url }` | Host 서버검증 → `/scenes/` allowlist → `rooms.background_url` UPDATE → `room-authority` `bg_change` 서버 broadcast (HOST-04·05, ROOM-09) | [[HostConsole]], [[SceneBackground]] |
| `POST /functions/v1/set-room-mode` | `Host` | `{ room_id, mode: 'normal'\|'vgen'\|'dub' }` | `{ ok: true, mode }` | Host 서버검증 → `rooms.current_mode` UPDATE → `room-authority` `mode_change` 서버 broadcast (G-261). late joiner 는 입장 rooms 조회로 복원 | [[RoomView]], [[DATA-SCHEMA]] |
| `POST /functions/v1/set-script-mode` | `Host` | `{ room_id, mode: 'rehearsal'\|'performance' }` | `{ ok: true, mode }` | Host 서버검증 → `rooms.script_mode` UPDATE → `room-authority` `script_mode` broadcast (ROOM-14) | [[ScriptPanel]] |
| `POST /functions/v1/sync-script-role` | `Participant` | `{ room_id, action: 'claim'\|'release'\|'assign', role, target_auth_id? }` | `{ ok: true }` | claim/release=본인·활성 배우만, assign=호스트만 서버검증 → `script-role` reliable broadcast(수신측 서버발만 수락, ROOM-14) | [[ScriptPanel]] |
| `POST /functions/v1/join-room-with-password` | `Auth` | `{ room_id, password }` | `{ room_id, participant_id, slot_index, role, rejoined? }` | 잠금방 PBKDF2 상수시간 대조 + **브루트포스 레이트리밋**(user·room 5회/5분, 정답 시 리셋, SEC-1) | [[SecurityPolicies]], [[LobbyPage]] |

## VGEN & Credit APIs

| Endpoint | Auth | Input | Output | Side Effects | Source |
|---|---|---|---|---|---|
| `POST /functions/v1/refine-vgen-prompt` | `Host` | `{ room_id, rough_prompt, reference_asset_ids?, target_duration_sec? }` | `{ refined_prompt }` | LLM(OpenAI 호환·키 서버 보관·성역: 개발 NVIDIA NIM 무료 / 실서비스 `gpt-4o-mini`)으로 사용자 자유 입력(개떡 OK)을 Seedance 카메라시트 프롬프트(캐릭터 @Image 참조·장면·구도[앵글+무빙]·모션·스타일)로 확장. 생성 전 미리보기·편집용. No credit charge (LLM 비용 ≈$0.0002/req) | [[VgenPanel]], [[VgenCostAnalysis]] |
| `POST /functions/v1/trigger-vgen` | `Host` | `{ room_id, prompt_sections, duration_sec, format, resolution, reference_asset_ids?, idempotency_key }` | `{ job_id, status: 'accepted'|'duplicate', credit_cost, estimated_latency_sec }` | Re-check `age_band='18_plus'` until guardian flow exists; check `account_restrictions.can_vgen`; moderate prompt; lock `credits` row (해상도 가중 크레딧, VgenCostAnalysis §2); insert `vgen_jobs`; insert debit `credit_transactions`; call fal.ai/adapter (reference-to-video: `image_urls`←reference_asset_ids, `aspect_ratio`←format, `resolution`) | [[VgenPanel]], [[Vgen]], [[DATA-SCHEMA]], [[COST-ESTIMATE]] |
| `POST /functions/v1/cancel-vgen` | `Host` or `Owner` | `{ job_id, reason? }` | `{ ok: true, status }` | Cancel only if provider not started or local queue pending; refund if deducted and eligible | [[VgenPanel]], [[DATA-SCHEMA]] |
| `POST /functions/v1/refund-credit` | `Admin` or system job | `{ user_id, amount, reason, ref_id, idempotency_key }` | `{ ok: true, balance }` | Transactional credit refund + `credit_transactions` append | [[DATA-SCHEMA]], [[COST-ESTIMATE]] |
| `POST /functions/v1/vgen-appeal` | `Owner` or `Host` | `{ job_id, reason }` | `{ appeal_id, status: 'pending' }` | Insert `vgen_appeals`, keep `vgen_jobs.status='flagged'`, set `vgen_jobs.appeal_status='pending'`, send receipt | [[VgenPanel]], [[MODERATION-OPS]] |
| `GET /functions/v1/signed-asset-url?type=...&asset_id=...` | RLS resource viewer | Query `{ type: 'vgen'|'recording'|'dub_output', asset_id }` | `{ url, expires_at }` | [SECURITY] ①asset_id(UUID v4만 허용, sequential ID 거부) → owner_user_id 또는 room_id 조회 → 요청자 일치 검증 후 signed URL 발급. ②durable DB의 object key만 신뢰하고 저장 URL 직접 노출 금지. ③존재하지 않거나 권한 없으면 동일하게 404 반환. ④`private_hold`/consent withdrawal 상태는 admin/evidence service 외 404. | [[DATA-SCHEMA]], [[SecurityPolicies]] |

## Avatar Forge APIs (PNG→Live2D)

> SSOT: `docs/reference/patterns/avatar-forge-pipeline.md` · [[DATA-SCHEMA]] §1.8.2 avatar_jobs. 클라 래퍼 `src/lib/avatarJobs.ts`. 결과=rig(`avatars/<job>/project.json`), 25~40분 비동기 잡. UI 빌더는 아래 4함수만 호출.

| Endpoint / Call | Auth | Request | Response | Notes | Refs |
|---|---|---|---|---|---|
| Storage `avatar-uploads` upload (클라 직접) | `Auth` | `uploadAvatarPng(file)` → `<authUid>/uploads/<uuid>.png` | `{ object_key }` | RLS 본인 폴더만(auth.uid()). private 버킷 | [[avatar-forge-pipeline]] |
| `POST /functions/v1/create-avatar-job` | `Auth` | `{ object_key }` | `{ job_id, status:'running' }` | `isSafeObjectKey(authId)` 검증 → `avatar_jobs` insert(queued) → 업로드 signed URL → Modal 웹엔드포인트 spawn(`trigger_secret` body). 실패 시 status=failed | [[avatar-forge-pipeline]], [[DATA-SCHEMA]] |
| `subscribeToAvatarJob(jobId, cb)` (Realtime) | `Auth` | postgres_changes UPDATE on `avatar_jobs` | `AvatarJob` | phase 진행/완료 자동 방송. `fetchMyAvatarJobs()`=재진입 | [[avatar-forge-pipeline]] |

**Modal → Supabase (webhook 대신 직접 PATCH)**: 파이프라인 컨테이너가 service_role로 `PATCH /rest/v1/avatar_jobs?id=eq.<job>`(phase·status=done+result_project_url). 인바운드 엣지 없음, 인증=Modal `vtube-supabase` 시크릿. 트리거 엔드포인트=`POST <modal>/submit`(`{trigger_secret, job_id, exp_id, png_url}` → `{call_id}`).

## Recording & DUB APIs

| Endpoint | Auth | Input | Output | Side Effects | Source |
|---|---|---|---|---|---|
| `POST /functions/v1/record-consent` | `Participant` | `{ room_id, recording_id?, dub_session_id?, consented, post_action?, idempotency_key }` | `{ ok: true, all_consented }` | Update `recordings.consent_json` or `dub_sessions.consent_json`, insert audit log | [[SecurityPolicies]], [[DATA-SCHEMA]] |
| `POST /functions/v1/withdraw-recording-consent` | `Participant` | `{ room_id, recording_id?, dub_session_id?, reason?, idempotency_key }` | `{ ok: true, status: 'private_hold'|'hold' }` | Set consent false/post_action request_delete, block signed URL issuance, hide from member galleries, notify host/admin, audit | [[SecurityPolicies]], [[DATA-SCHEMA]] |
| `POST /functions/v1/start-recording` | `Host` | `{ room_id, source: 'room'|'vgen'|'dub', source_id?, visibility, idempotency_key }` | `{ recording_id, status: 'recording' }` | Check consent/quota, create `recordings`, start MediaRecorder/Egress path | [[SecurityPolicies]], [[DATA-SCHEMA]], [[VgenPanel]] |
| `POST /functions/v1/upload-recording-chunk` | `Owner` or assigned participant | `{ recording_id?, dub_track_id?, sequence, checksum, chunk, resume_token? }` | `{ ok: true, next_sequence, resume_token }` | Store chunk object, update local backup manifest, allow interrupted upload resume | [[DubRecorder]], [[DATA-SCHEMA]] |
| `POST /functions/v1/complete-recording-upload` | `Owner` or assigned participant | `{ recording_id?, dub_track_id?, chunk_count, final_checksum, idempotency_key }` | `{ object_key, status: 'submitted'|'processing' }` | Compose/mark uploaded chunks, update `recordings` or `dub_tracks`, delete stale chunks by cron | [[DubRecorder]], [[DATA-SCHEMA]] |
| `POST /functions/v1/stop-recording` | `Host` or `Owner` | `{ recording_id }` | `{ recording_id, status: 'processing' }` | Stop capture, upload object, move to processing | [[DATA-SCHEMA]], [[VgenPanel]] |
| `POST /functions/v1/discard-recording` | `Host` or `Owner` | `{ recording_id, reason? }` | `{ ok: true, status: 'discarded'|'cancelled' }` | Mark discarded/cancelled, delete object if already uploaded | [[DATA-SCHEMA]], [[VgenPanel]] |
| `POST /functions/v1/create-dub-upload` | `Host` | `{ room_id, file_name, size_bytes, mime_type, checksum, idempotency_key }` | `{ upload_id, upload_url, max_chunk_bytes }` | Feature flag + age/consent/quota gate; create short upload intent; no direct Storage upload from client | [[DubSessionSelector]], [[SecurityPolicies]] |
| `POST /functions/v1/create-dub-session` | `Host` | `{ room_id, source_type: 'upload'|'vgen', source_object_key, rights_attestation, idempotency_key }` | `{ dub_session_id, status: 'uploaded'|'moderating' }` | Insert `dub_sessions`; source frame/text moderation before READY; audit. YouTube is P2-disabled | [[DubSessionSelector]], [[DATA-SCHEMA]] |
| `POST /functions/v1/start-dub-transcription` | `Host` or system job | `{ dub_session_id, idempotency_key }` | `{ dub_session_id, status: 'transcribing' }` | Feature flag + source moderation passed; call STT/diarization adapter; audit provider job id | [[DubSessionSelector]], [[DATA-SCHEMA]] |
| `POST /functions/v1/translate-dub-script` | `Host` | `{ dub_session_id }` | `{ dub_session_id, translated_count, skipped_count, skipped? }` | DUB-06: STT 대본 세그먼트를 JP/EN→KR 번역(gpt-4o-mini). 원문 `rooms.language='ko'` 면 skip·무과금. `diarization_result_json.segments[].translated_text` 저장 + 역할배정 후면 `dub_tracks.translated_text` 복사(start_time_ms 매칭). `OPENAI_API_KEY` 서버 시크릿(성역) | [[DubPanel]], [[DubSession]], [[DATA-SCHEMA]] |
| `POST /functions/v1/update-dub-segment-text` | `Host` | `{ dub_session_id, segment_id, text? \| translated_text? }` | `{ dub_session_id, segment_id }` | V-10 자막편집: `status='ready'` 에서만 세그먼트 대사 수정(1~500자). `diarization_result_json.segments[]` 갱신 + 역할배정 후면 `dub_tracks.transcript_text/translated_text` 미러(start_time_ms 매칭) — 프롬프터·합성 자막(mov_text/VTT)이 같은 텍스트를 봄 | [[DubPanel]], [[DubCompositor]], [[DATA-SCHEMA]] |
| `POST /functions/v1/submit-dub-track` | Assigned participant | `{ dub_session_id, speaker_id, object_key, duration_ms, idempotency_key }` | `{ track_id, status: 'submitted' }` | Update assigned `dub_tracks`; never let user write another participant track | [[DubRecorder]], [[DATA-SCHEMA]] |
| `POST /functions/v1/create-dub-output-upload` | `Host` | `{ dub_session_id }` | `{ output_id, path, uploadUrl }` | 전 트랙 synced 게이트; `dub_outputs`(compositing) 생성 + 산출물 R2 presigned PUT URL; 세션 compositing 전이 (합성은 브라우저 ffmpeg.wasm) | [[DubCompositor]], [[DATA-SCHEMA]] |
| `POST /functions/v1/submit-dub-output` | `Host` | `{ output_id, output_path?, file_size_bytes?, duration_ms?, error_message? }` | `{ output_id, status: 'ready'\|'failed' }` | 성공→output ready + 세션 completed / 실패(error_message)→output failed + 세션 recording 복귀; 경로 프리픽스 검증 | [[DubCompositor]], [[DATA-SCHEMA]] |
| `POST /functions/v1/get-dub-output-url` | 방 멤버 | `{ dub_session_id }` | `{ url, file_size_bytes, duration_ms }` | 최신 ready 완성본 signed download URL(멤버 검증) | [[DubCompositor]] |
| `POST /functions/v1/get-dub-recordings` | 방 멤버 | `{ dub_session_id }` | `{ recordings: [{ track_id, start_time_ms, url }] }` | synced 트랙 녹음 signed URL 일괄(호스트 합성용 다운로드) | [[DubCompositor]] |
| `POST /functions/v1/separate-dub-audio` | `Host` | `{ dub_session_id }` | `{ dub_session_id, background_urls: string[], stem_count }` | 소스 signed URL → fal.ai Demucs(`fal-ai/demucs`) 원어 대사(vocals) 제거 → 비보컬 배경 스템 URL. DB 무변경 순수 컴퓨트·호스트 게이트(크레딧 보호). `FAL_KEY` 서버 시크릿(성역·VITE 노출 금지) | [[DubCompositor]], [[dub-audio-separation-anime]] |

## Trust, Safety, Account APIs

| Endpoint | Auth | Input | Output | Side Effects | Source |
|---|---|---|---|---|---|
| `POST /functions/v1/create-report` | `Auth` | `{ room_id?, reported_user_id?, message_id?, target_type, target_id?, reason, description?, evidence_object_key?, idempotency_key }` | `{ report_id, status: 'pending' }` | Allows active or former participant within 24h; snapshots last N messages + participant/safety audit evidence server-side; rate limit reporter | [[SecurityPolicies]], [[MODERATION-OPS]] |
| `POST /functions/v1/create-block` | `Auth` | `{ blocked_user_id, reason? }` | `{ ok: true }` | Upsert `user_blocks`; no automatic moderation report | [[SecurityPolicies]], [[DATA-SCHEMA]] |
| `DELETE /functions/v1/block` | `Auth` | `{ blocked_user_id }` | `{ ok: true }` | Delete own `user_blocks` row | [[SecurityPolicies]], [[DATA-SCHEMA]] |
| `POST /functions/v1/report-appeal` | Report respondent | `{ report_id, reason }` | `{ appeal_id, status: 'pending' }` | Insert `reports_appeals`, increment appeal count, notify moderation queue | [[SecurityPolicies]], [[MODERATION-OPS]] |
| `POST /functions/v1/moderation-action` | `Admin` | `{ report_id, action, duration_days?, reason, target_id? }` | `{ ok: true, final_status }` | Warn/suspend/delete/hide, write `account_restrictions` when action limits account capability, write audit, notify reporter/respondent | [[MODERATION-OPS]], [[SecurityPolicies]] |
| `POST /functions/v1/data-export-request` | `Auth` with recent reauth | `{ format: 'json'|'zip', idempotency_key }` | `{ request_id, status: 'queued' }` | Queue scoped export manifest, audit, notify by email; result link is short-lived and single-use; do not generate synchronously in browser | [[SettingsPage]], [[DATA-EXPORT]] |
| `POST /rpc/soft_delete_user` | `Auth` with reauth | `{}` | `{ ok: true, deletion_scheduled_at }` | Derive target from `current_app_user_id()` only; soft delete user, sign out, schedule 30-day purge | [[SettingsPage]], [[DATA-SCHEMA]] |

## Mobile Viewer APIs

> [SECURITY] 모바일 viewer는 `canPublishData=false`로 LiveKit 토큰 발급. 채팅·리액션·폴 응답은 반드시 아래 Edge Function 경유 — 직접 DB insert 또는 client DataChannel publish 금지. 익명 viewer는 MVP에서 read-only이며 아래 쓰기 API를 호출할 수 없다.

| Endpoint | Auth | Input | Output | Side Effects | Source |
|---|---|---|---|---|---|
| `POST /functions/v1/send-chat` | `Actor` or `Host` | `{ room_id, text, idempotency_key }` | `{ message_id, ok: true }` | Sanitize + slow mode + blocked words + rate-limit; insert `messages`; server-side broadcast over `chat`. Direct actor/host DataChannel publish forbidden | [[ChatPanel]], [[SecurityPolicies]] |
| `POST /functions/v1/send-viewer-chat` | `Participant(role=viewer)` | `{ room_id, text, idempotency_key }` | `{ message_id, ok: true }` | Sanitize + rate-limit (≤2/s, ≤30/min per user); insert `messages`; broadcast via server-side DataChannel relay | [[MobileViewer]], [[SecurityPolicies]] |
| `POST /functions/v1/send-viewer-reaction` | `Participant(role=viewer)` | `{ room_id, emoji, idempotency_key }` | `{ ok: true }` | Rate-limit (≤5/s per user); server-side DataChannel broadcast to room — viewer never gets `canPublishData` | [[MobileViewer]], [[SecurityPolicies]] |
| `POST /functions/v1/submit-viewer-poll` | `Participant(role=viewer)` | `{ room_id, poll_id, choice_index, idempotency_key }` | `{ ok: true, total_votes }` | Upsert `poll_responses` (한 session당 1회); idempotency_key로 중복 방지 | [[MobileViewer]], [[DATA-SCHEMA]] |

## OBS / Public Viewer APIs

| Endpoint | Auth | Input | Output | Side Effects | Source |
|---|---|---|---|---|---|
| `POST /functions/v1/create-obs-token` | `Host` | `{ room_id, obs_mode, target_slot_index?, expires_in_sec }` | `{ token, url, expires_at }` | **P2 release-blocked**. Room-wide broadcast/badge + audit before insert hashed token; plain token returned once | [[DATA-SCHEMA]], [[OBSViewer]] |
| `POST /functions/v1/verify-obs-token` | `Public` | `{ token }` | `{ room_id, obs_mode, target_slot_index?, expires_at }` | **P2 release-blocked**. Hash token, validate expiry/revocation and room status; read-only data only. No LiveKit token | [[DATA-SCHEMA]], [[OBSViewer]] |

## Direct Supabase Reads

These are not Edge endpoints. Use Supabase client with RLS and Realtime subscriptions.

| Surface | Operation | Auth | Notes | Source |
|---|---|---|---|---|
| `credits` | `SELECT own row` | `Auth` | Balance display only. Updates only through Edge Functions | [[DATA-SCHEMA]] |
| `credit_transactions` | `SELECT own rows` | `Auth` | Usage history UI | [[DATA-SCHEMA]], [[COST-ESTIMATE]] |
| `rooms` | list/search active rooms | `Auth` or public demo rules | Respect password/private flags | [[LobbyPage]], [[DATA-SCHEMA]] |
| `room_participants` | read same-room participants | `Participant` | Client hides blocked users but DB evidence remains | [[DATA-SCHEMA]], [[SecurityPolicies]] |
| `vgen_jobs` | subscribe/read visible jobs | Visibility RLS | `public`, `members_only`, `private` gates | [[VgenPanel]], [[DATA-SCHEMA]] |
| `avatar_jobs` | subscribe/read own jobs | Own-row RLS | `createAvatarJob`/`subscribeToAvatarJob`/`fetchMyAvatarJobs` (avatarJobs.ts). 완료 시 `result_project_url`→AvatarPreview/SelfAvatar | [[avatar-forge-pipeline]], [[DATA-SCHEMA]] |
| `recordings` | read visible recordings | Visibility RLS | Durable playback URL requires signed URL endpoint | [[DATA-SCHEMA]] |
| `notifications` | read/update `read_at` own rows | `Auth` | Creation only through Edge/system | [[DATA-SCHEMA]] |

## Realtime/Webhook Surfaces

| Surface | Direction | Payload | Effect | Source |
|---|---|---|---|---|
| LiveKit DataChannels | Client/server relay to room | `room-authority`, `script-cue`, `chat`, `blendshape` only | Receivers enforce LiveKit identity + type matrix. Durable writes and chat sends go through Edge/DB first, then server relay/broadcast where needed | [[DATA-SCHEMA]], [[VgenPanel]], [[SecurityPolicies]] |
| `POST /functions/v1/livekit-webhook` | LiveKit to Edge | participant joined/left, egress events | Reconcile participants, remove revoked/disabled users, update recording/egress status | [[livekit-edge-fn]], [[DATA-SCHEMA]] |
| `POST /functions/v1/fal-webhook` | fal.ai/provider to Edge | `{ job_id, status, result_url?, error? }` | Verify provider signature, update `vgen_jobs`, refund on failure | [[VgenPanel]], [[DATA-SCHEMA]] |

## Implementation Order

1. `livekit-token`, `create-room`, `verify-invite-code`, `accept-invite`.
2. `trigger-vgen` with credit transaction and failure refund.
3. `record-consent`, `withdraw-recording-consent`, `start-recording`, `stop-recording`, `signed-asset-url`.
4. `create-report`, `create-block`, `report-appeal`.
5. Admin-only moderation and OBS endpoints.

## Open Questions

- `create-room` and `accept-invite` password hashing must stay in Edge Functions over `room_secrets`; no client hash verification endpoint.
- `cancel-vgen` provider-level cancellation depends on selected video API support.
- `data-export-request` is Edge Function only for the Vite platform. `/api/data-export-request` is forbidden in platform contracts.
