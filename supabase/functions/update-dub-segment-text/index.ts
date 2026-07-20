// update-dub-segment-text: STT 세그먼트 대사 편집(호스트 전용, V-10 자막편집).
// SSOT: docs/API-SURFACE.md · docs/state-machines/DubSession.md
// 입력: { dub_session_id, segment_id, text? | translated_text? }  출력: { dub_session_id, segment_id }
//
// 설계(translate-dub-script 와 동일 저장 구조):
//  - status='ready'|'recording'(F5: 녹음 중 대사 문구 수정 허용 — 시간/구조 편집은 ready 잠금 유지).
//  - 저장(주): dub_sessions.diarization_result_json.segments[].{text,translated_text}
//  - 저장(부): dub_tracks 이미 있으면 start_time_ms 매칭으로 transcript_text/translated_text 미러
//    (녹음 프롬프터·합성 자막이 같은 텍스트를 보게 — translate-dub-script:97-105 패턴).
//  - 쓰기 service_role(클라 직접 UPDATE 는 RLS 로 차단돼 있음).

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

const MAX_LEN = 500;

interface Segment { id: number; start_ms: number; end_ms: number; text: string; translated_text?: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_session_id?: unknown; segment_id?: unknown; text?: unknown; translated_text?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isUuid(body.dub_session_id)) return json({ error: "Invalid dub_session_id" }, 400);
  if (typeof body.segment_id !== "number" || !Number.isInteger(body.segment_id)) {
    return json({ error: "Invalid segment_id" }, 400);
  }
  const patch: { text?: string; translated_text?: string } = {};
  for (const field of ["text", "translated_text"] as const) {
    const v = body[field];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.trim().length === 0 || v.length > MAX_LEN) {
      return json({ error: `Invalid ${field} (1~${MAX_LEN}자)` }, 400);
    }
    patch[field] = v.trim();
  }
  if (Object.keys(patch).length === 0) return json({ error: "text 또는 translated_text 필요" }, 400);

  const { data: sess } = await service
    .from("dub_sessions")
    .select("id, status, diarization_result_json, rooms(host_id)")
    .eq("id", body.dub_session_id)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);
  const room = sess.rooms as unknown as { host_id: string };
  if (room.host_id !== userId) return json({ error: "호스트만 대사를 수정할 수 있어요." }, 403);
  if (sess.status !== "ready" && sess.status !== "recording") {
    return json({ error: `현재 상태(${sess.status})에선 수정 불가` }, 409);
  }

  const segments: Segment[] = (sess.diarization_result_json?.segments ?? []);
  const seg = segments.find((s) => s.id === body.segment_id);
  if (!seg) return json({ error: "세그먼트를 찾을 수 없어요." }, 404);

  const updated = segments.map((s) => (s.id === body.segment_id ? { ...s, ...patch } : s));
  const newJson = { ...(sess.diarization_result_json ?? {}), segments: updated };
  const { error: uErr } = await service
    .from("dub_sessions").update({ diarization_result_json: newJson }).eq("id", sess.id);
  if (uErr) return json({ error: "저장 실패", detail: uErr.message }, 500);

  // 부 저장: 역할배정이 이미 됐으면 dub_tracks 에도 미러(start_time_ms 매칭)
  const trackPatch: Record<string, string> = {};
  if (patch.text !== undefined) trackPatch.transcript_text = patch.text;
  if (patch.translated_text !== undefined) trackPatch.translated_text = patch.translated_text;
  await service.from("dub_tracks").update(trackPatch)
    .eq("dub_session_id", sess.id).eq("start_time_ms", seg.start_ms);

  return json({ dub_session_id: sess.id, segment_id: body.segment_id }, 200);
});
