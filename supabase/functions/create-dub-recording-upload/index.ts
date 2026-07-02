// create-dub-recording-upload: 참가자 녹음 오디오 업로드용 signed upload URL(트랙 소유자 전용).
// SSOT: docs/contracts/DubRecorder.md §5 (Direct storage.upload 금지 — Edge 경유·소유자·프리픽스 강제)
// 입력: { dub_track_id }  출력: { path, token }
//
// ponytail: 청크/resume(ROOM-23)·quota·체크섬은 후속. MVP 는 단일 업로드.

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

  // 트랙 + 세션 조회, 소유자·녹음중 검증
  const { data: track } = await service
    .from("dub_tracks")
    .select("id, participant_id, dub_sessions(room_id, status)")
    .eq("id", body.dub_track_id)
    .maybeSingle();
  if (!track) return json({ error: "트랙을 찾을 수 없어요." }, 404);
  if (track.participant_id !== userId) return json({ error: "본인 트랙만 녹음할 수 있어요." }, 403);
  const sess = track.dub_sessions as unknown as { room_id: string; status: string };
  if (sess.status !== "recording") return json({ error: `현재 상태(${sess.status})에선 녹음 불가` }, 409);

  const path = `${sess.room_id}/recordings/${track.id}-${crypto.randomUUID()}.webm`;
  const { data: signed, error } = await service.storage
    .from("dub-assets")
    .createSignedUploadUrl(path);
  if (error || !signed) return json({ error: "업로드 URL 발급 실패", detail: error?.message }, 500);

  return json({ path: signed.path, token: signed.token }, 200);
});
