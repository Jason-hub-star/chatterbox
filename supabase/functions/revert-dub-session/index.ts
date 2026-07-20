// revert-dub-session: 녹음 단계 → 역할·대본 단계 되돌림(호스트 전용, F5 DUB-STEP-BACK).
// SSOT: docs/state-machines/DubSession.md (RECORDING→READY 역전이) · docs/goals/GOAL-dub-polish.md F5
// 입력: { dub_session_id }  출력: { dub_session_id, status }
//
// 보존 성역: 트랙·기녹음(recording_path/synced)·동의는 그대로 둔다 — 역할 재배정(assign-dub-roles 멱등
//   upsert)과 재시작(start-dub-recording 이 role_version++ 재잠금)이 기존 경로로 다시 성립한다.
//   삭제·리셋은 없다(유료 작업물 보존 원칙, protect-paid-api-work).

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
    .select("id, status, rooms(host_id)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);
  const room = sess.rooms as unknown as { host_id: string };
  if (room.host_id !== userId) return json({ error: "호스트만 단계를 되돌릴 수 있어요." }, 403);
  if (sess.status !== "recording") {
    return json({ error: `현재 상태(${sess.status})에선 되돌릴 수 없어요.` }, 409);
  }

  // READY 역전이 + 역할 잠금 해제(H12 해제 — role_version 은 다음 잠금 때 증가)
  const { error: uErr } = await service
    .from("dub_sessions")
    .update({ status: "ready", roles_locked_at: null, roles_locked_by: null })
    .eq("id", sessionId)
    .eq("status", "recording");
  if (uErr) return json({ error: "되돌리기 실패", detail: uErr.message }, 500);

  return json({ dub_session_id: sessionId, status: "ready" }, 200);
});
