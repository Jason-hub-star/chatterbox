// confirm-dub-track: 호스트가 제출된 트랙을 확인해 'synced' 승격.
// SSOT: docs/state-machines/DubSession.md (submitted → 호스트 확인 → synced), DubRecorder.md §5
// 입력: { dub_track_id }  출력: { track_id, status, all_synced }
//
// 모든 트랙 synced 여부(all_synced)를 반환 → 합성(DUB-05) 시작 게이트 판단에 사용.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_track_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.dub_track_id)) return json({ error: "Invalid dub_track_id" }, 400);

  const { data: track } = await service
    .from("dub_tracks")
    .select("id, status, dub_session_id, dub_sessions(rooms(host_id))")
    .eq("id", body.dub_track_id)
    .maybeSingle();
  if (!track) return json({ error: "트랙을 찾을 수 없어요." }, 404);
  const host = ((track.dub_sessions as unknown as { rooms: { host_id: string } }).rooms).host_id;
  if (host !== userId) return json({ error: "호스트만 확인할 수 있어요." }, 403);
  if (track.status !== "submitted") return json({ error: `제출된 트랙만 확인 가능(${track.status})` }, 409);

  const { error } = await service.from("dub_tracks").update({ status: "synced" }).eq("id", track.id);
  if (error) return json({ error: "확인 실패", detail: error.message }, 500);

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

  return json({ track_id: track.id, status: "synced", all_synced: (total ?? 0) > 0 && total === synced }, 200);
});
