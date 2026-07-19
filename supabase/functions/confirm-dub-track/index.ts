// confirm-dub-track: 호스트가 제출된 트랙을 확인해 'synced' 승격.
// SSOT: docs/state-machines/DubSession.md (submitted → 호스트 확인 → synced), DubRecorder.md §5
// 입력: { dub_track_id, undo? }  출력: { track_id, status, all_synced }
//
// 모든 트랙 synced 여부(all_synced)를 반환 → 합성(DUB-05) 시작 게이트 판단에 사용.
// undo=true(DUB-RETAKE): synced → submitted 로 확정 해제(호스트 전용) — 배우가 재녹음할 길을 연다.
//   세션이 recording 일 때만(합성 중/완료엔 해제 금지 — submit-dub-track 세션 게이트와 동형).

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_track_id?: unknown; undo?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.dub_track_id)) return json({ error: "Invalid dub_track_id" }, 400);
  const undo = body.undo === true;

  const { data: track } = await service
    .from("dub_tracks")
    .select("id, status, dub_session_id, dub_sessions(status, rooms(host_id))")
    .eq("id", body.dub_track_id)
    .maybeSingle();
  if (!track) return json({ error: "트랙을 찾을 수 없어요." }, 404);
  const sess = track.dub_sessions as unknown as { status: string; rooms: { host_id: string } };
  if (sess.rooms.host_id !== userId) return json({ error: "호스트만 확인할 수 있어요." }, 403);

  if (undo) {
    if (track.status !== "synced") return json({ error: `확정된 트랙만 해제 가능(${track.status})` }, 409);
    if (sess.status !== "recording") return json({ error: `현재 상태(${sess.status})에선 해제 불가` }, 409);
    const { error } = await service.from("dub_tracks").update({ status: "submitted" }).eq("id", track.id);
    if (error) return json({ error: "해제 실패", detail: error.message }, 500);
  } else {
    if (track.status !== "submitted") return json({ error: `제출된 트랙만 확인 가능(${track.status})` }, 409);
    const { error } = await service.from("dub_tracks").update({ status: "synced" }).eq("id", track.id);
    if (error) return json({ error: "확인 실패", detail: error.message }, 500);
  }

  // 세션 전체 synced 여부
  const { count: total } = await service
    .from("dub_tracks")
    .select("id", { count: "exact", head: true })
    .eq("dub_session_id", track.dub_session_id);
  const { count: synced } = await service
    .from("dub_tracks")
    .select("id", { count: "exact", head: true })
    .eq("dub_session_id", track.dub_session_id)
    .eq("status", "synced");

  return json({ track_id: track.id, status: undo ? "submitted" : "synced", all_synced: (total ?? 0) > 0 && total === synced }, 200);
});
