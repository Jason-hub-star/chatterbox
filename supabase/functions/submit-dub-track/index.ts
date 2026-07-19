// submit-dub-track: 참가자 녹음 제출 (트랙 소유자 전용).
// SSOT: docs/state-machines/DubSession.md (RECORDING: dub_tracks assigned→submitted), DubRecorder.md §5
// 입력: { dub_track_id, recording_path, duration_ms, calibration_offset_ms? (±200 클램프) }  출력: { track_id, status }
//
// recording_url 은 R2/Storage object key 만 저장(공개 URL 금지) — 재생 시 signed URL 발급.
// 호스트 확인 후 confirm-dub-track 으로 'synced' 승격.

import { cors, json, getAppUser, isUuid, isSafeObjectKey } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_track_id?: unknown; recording_path?: unknown; duration_ms?: unknown; calibration_offset_ms?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.dub_track_id)) return json({ error: "Invalid dub_track_id" }, 400);
  const recordingPath = typeof body.recording_path === "string" ? body.recording_path : "";
  if (!recordingPath.includes("/recordings/")) return json({ error: "Invalid recording_path" }, 400);
  const durationMs = Number.isInteger(body.duration_ms) ? (body.duration_ms as number) : null;
  // G9-P4 캘리브레이션(DubRecorder.md ±200ms) — 미리보기로 맞춘 오프셋을 합성에도 동일 적용
  const calibrationMs = Number.isInteger(body.calibration_offset_ms)
    ? Math.max(-200, Math.min(200, body.calibration_offset_ms as number))
    : 0;

  const { data: track } = await service
    .from("dub_tracks")
    .select("id, participant_id, status, dub_sessions(room_id, status)")
    .eq("id", body.dub_track_id)
    .maybeSingle();
  if (!track) return json({ error: "트랙을 찾을 수 없어요." }, 404);
  if (track.participant_id !== userId) return json({ error: "본인 트랙만 제출할 수 있어요." }, 403);
  // DUB-RETAKE 정합 게이트: 호스트 확정(synced)된 트랙은 API 직접호출로도 못 덮어쓴다 —
  // 되돌리려면 호스트가 confirm-dub-track { undo } 로 확정 해제 후 재제출.
  if (track.status === "synced") return json({ error: "확정된 트랙은 재제출할 수 없어요 — 호스트 확정 해제 후 다시 제출하세요." }, 409);
  const sess = track.dub_sessions as unknown as { room_id: string; status: string };
  if (sess.status !== "recording") return json({ error: `현재 상태(${sess.status})에선 제출 불가` }, 409);
  // 경로 조작 방지(SEC-2): 이 방 recordings/ 아래 안전한 키만(../·여분 슬래시 차단)
  if (!isSafeObjectKey(recordingPath, sess.room_id, ["recordings"])) {
    return json({ error: "recording_path 프리픽스 불일치" }, 400);
  }

  const { error } = await service
    .from("dub_tracks")
    .update({ recording_url: recordingPath, recording_duration_ms: durationMs, calibration_offset_ms: calibrationMs, status: "submitted" })
    .eq("id", track.id);
  if (error) return json({ error: "제출 실패", detail: error.message }, 500);

  return json({ track_id: track.id, status: "submitted" }, 200);
});
