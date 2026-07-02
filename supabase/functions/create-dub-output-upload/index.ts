// create-dub-output-upload: 합성 결과 mp4 업로드용 signed upload URL(호스트 전용·전 트랙 synced).
// SSOT: docs/contracts/DubCompositor.md (원본 재더빙 코어), docs/state-machines/DubSession.md (RECORDING→COMPOSITING)
// 입력: { dub_session_id }  출력: { output_id, path, token }
//
// dub_outputs 는 클라 write 정책 없음(SELECT만) → service_role 로만 생성. 합성은 브라우저 ffmpeg.wasm.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_session_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.dub_session_id)) return json({ error: "Invalid dub_session_id" }, 400);

  // 세션 + 호스트 검증 (start-dub-recording 과 동일: rooms.host_id)
  const { data: sess } = await service
    .from("dub_sessions")
    .select("id, room_id, status, rooms(host_id)")
    .eq("id", body.dub_session_id)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);
  const room = sess.rooms as unknown as { host_id: string };
  if (room.host_id !== userId) return json({ error: "호스트만 합성할 수 있어요." }, 403);
  if (sess.status !== "recording" && sess.status !== "compositing") {
    return json({ error: `현재 상태(${sess.status})에선 합성 불가` }, 409);
  }

  // 전 트랙 synced 확인
  const { data: tracks } = await service
    .from("dub_tracks")
    .select("status")
    .eq("dub_session_id", sess.id);
  if (!tracks || tracks.length === 0) return json({ error: "녹음 트랙이 없어요." }, 409);
  if (!tracks.every((t) => t.status === "synced")) {
    return json({ error: "모든 트랙이 완료(synced)돼야 합성할 수 있어요." }, 409);
  }

  // dub_outputs 행 생성(compositing)
  const { data: output, error: insErr } = await service
    .from("dub_outputs")
    .insert({ dub_session_id: sess.id, status: "compositing" })
    .select("id")
    .single();
  if (insErr || !output) return json({ error: "출력 생성 실패", detail: insErr?.message }, 500);

  const path = `${sess.room_id}/outputs/${sess.id}-${crypto.randomUUID()}.mp4`;
  const { data: signed, error } = await service.storage
    .from("dub-assets")
    .createSignedUploadUrl(path);
  if (error || !signed) return json({ error: "업로드 URL 발급 실패", detail: error?.message }, 500);

  // 세션 compositing 전이(게스트 UI가 "합성 중" 표시)
  await service.from("dub_sessions").update({ status: "compositing" }).eq("id", sess.id);

  return json({ output_id: output.id, path: signed.path, token: signed.token }, 200);
});
