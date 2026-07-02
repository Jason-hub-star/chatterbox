// start-dub-recording: 동의 게이트 통과 시 녹음 시작 + 역할 잠금(호스트 전용).
// SSOT: docs/state-machines/DubSession.md (READY→RECORDING, consent 게이트 §11, 역할잠금 H12)
// 입력: { dub_session_id }  출력: { dub_session_id, status, role_version }
//
// 보안 성역: consent 게이트는 서버에서 강제한다(클라 버튼 disabled 는 게이트가 아님).
//   all_consented=true 아니면 RECORDING 진입 차단.

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
  const sessionId = body.dub_session_id;

  const { data: sess } = await service
    .from("dub_sessions")
    .select("id, status, role_version, consent_json, rooms(host_id)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);
  const room = sess.rooms as unknown as { host_id: string };
  if (room.host_id !== userId) return json({ error: "호스트만 녹음을 시작할 수 있어요." }, 403);
  if (sess.status !== "ready") return json({ error: `현재 상태(${sess.status})에선 녹음 시작 불가` }, 409);

  // consent 게이트(서버 강제, G-43)
  if (sess.consent_json?.all_consented !== true) {
    return json({ error: "모든 참가자의 동의가 필요해요." }, 412);
  }

  // 역할 배정 존재 확인
  const { count } = await service
    .from("dub_tracks")
    .select("id", { count: "exact", head: true })
    .eq("dub_session_id", sessionId);
  if (!count || count === 0) return json({ error: "역할 배정 후 녹음을 시작하세요." }, 409);

  // 역할 잠금(H12) + RECORDING 전이
  const newVersion = (sess.role_version ?? 1) + 1;
  const { error: uErr } = await service
    .from("dub_sessions")
    .update({
      status: "recording",
      roles_locked_at: new Date().toISOString(),
      roles_locked_by: userId,
      role_version: newVersion,
    })
    .eq("id", sessionId);
  if (uErr) return json({ error: "녹음 시작 실패", detail: uErr.message }, 500);

  return json({ dub_session_id: sessionId, status: "recording", role_version: newVersion }, 200);
});
