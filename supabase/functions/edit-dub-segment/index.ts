// edit-dub-segment: 호스트가 STT 세그먼트의 시간(retime) 또는 존재(delete)를 수정 — DUB-EDIT E2.
// SSOT: docs/goals/GOAL-dub-edit.md · 게이트·JSON·트랙 미러 패턴 = update-dub-segment-text 동형.
// 입력: { dub_session_id, op: 'retime'|'delete', segment_id, start_ms?, end_ms? }
// 출력: { dub_session_id, segment_id, op }
//
// ready 잠금(정책): 세션이 'ready' 일 때만 — 녹음(recording) 시작 후엔 409 → 기녹음 테이크 무효화 원천 차단.
// dub_tracks 미러: 배정이 이미 됐으면 트랙의 start/end_time_ms 도 갱신(매칭 키 = 구 start_time_ms) /
//   delete 는 해당 트랙도 삭제. 전파는 dub_sessions UPDATE 를 클라 Realtime 구독이 받아 전원 반영.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

interface Segment { id: number; start_ms: number; end_ms: number; text: string; translated_text?: string }

const MIN_SEG_MS = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_session_id?: unknown; op?: unknown; segment_id?: unknown; start_ms?: unknown; end_ms?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.dub_session_id)) return json({ error: "Invalid dub_session_id" }, 400);
  const op = body.op === "retime" || body.op === "delete" ? body.op : null;
  if (!op) return json({ error: "Invalid op (retime|delete)" }, 400);
  if (!Number.isInteger(body.segment_id)) return json({ error: "Invalid segment_id" }, 400);

  let startMs = 0;
  let endMs = 0;
  if (op === "retime") {
    if (!Number.isInteger(body.start_ms) || !Number.isInteger(body.end_ms)) {
      return json({ error: "retime 은 start_ms/end_ms 정수 필요" }, 400);
    }
    startMs = body.start_ms as number;
    endMs = body.end_ms as number;
    if (startMs < 0 || endMs <= startMs || endMs - startMs < MIN_SEG_MS) {
      return json({ error: `Invalid 구간 (0≤start<end · 최소 ${MIN_SEG_MS}ms)` }, 400);
    }
  }

  const { data: sess } = await service
    .from("dub_sessions")
    .select("id, status, diarization_result_json, rooms(host_id)")
    .eq("id", body.dub_session_id)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);
  const room = sess.rooms as unknown as { host_id: string };
  if (room.host_id !== userId) return json({ error: "호스트만 세그먼트를 편집할 수 있어요." }, 403);
  if (sess.status !== "ready") return json({ error: `현재 상태(${sess.status})에선 편집 불가` }, 409);

  const segments: Segment[] = (sess.diarization_result_json?.segments ?? []);
  const seg = segments.find((s) => s.id === body.segment_id);
  if (!seg) return json({ error: "세그먼트를 찾을 수 없어요." }, 404);

  const updated = op === "delete"
    ? segments.filter((s) => s.id !== body.segment_id)
    : segments.map((s) => (s.id === body.segment_id ? { ...s, start_ms: startMs, end_ms: endMs } : s));
  const newJson = { ...(sess.diarization_result_json ?? {}), segments: updated };
  const { error: uErr } = await service
    .from("dub_sessions").update({ diarization_result_json: newJson }).eq("id", sess.id);
  if (uErr) return json({ error: "저장 실패", detail: uErr.message }, 500);

  // 트랙 미러(배정 존재 시) — 매칭 키 = 편집 전 start_time_ms (update-dub-segment-text 동형)
  if (op === "delete") {
    await service.from("dub_tracks").delete()
      .eq("dub_session_id", sess.id).eq("start_time_ms", seg.start_ms);
  } else {
    await service.from("dub_tracks").update({ start_time_ms: startMs, end_time_ms: endMs })
      .eq("dub_session_id", sess.id).eq("start_time_ms", seg.start_ms);
  }

  return json({ dub_session_id: sess.id, segment_id: body.segment_id, op }, 200);
});
