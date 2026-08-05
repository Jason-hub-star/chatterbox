// invite-to-stage: 호스트가 활성 관객(viewer)을 무대로 직접 초대한다(ROOM-21, G-154, SEC-1). 아직 승격 아님 —
// 대상 행에 stage_invited_at 영속(accept-stage-invite 게이트) + 수락 모달 room-authority stage_invite broadcast
// (대상 본인만 반응). 수락은 accept-stage-invite. SSOT: contracts/HostConsole.md §G-154.
// 승격 모델(2026-08-05): 호스트 직접 초대 — 손들기(raise_hand_at) 전제 제거(손들기 뷰어 버튼 폐기 유지).
// MUST NOT: 대상 동의 없이 강제 승격(승격은 대상이 accept-stage-invite 로 수락) · stage_invited_at 없이 승격.
import { getAppUser, json, isUuid, cors, requireHostRoom } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; target_user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, target_user_id } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (!isUuid(target_user_id)) return json({ error: "Invalid target_user_id" }, 400);

  // 호스트 검증(서버 확정)
  const gate = await requireHostRoom(user.service, room_id, user.userId);
  if (!gate.ok) return gate.res;

  // 대상 = 활성 viewer 여야 초대 가능(viewer 만 — 손들기 전제 없음). users.auth_id 는 수신측 본인 판별용.
  const { data: target } = await user.service
    .from("room_participants")
    .select("id, role, users(auth_id)")
    // SEC-KICK-3: 강퇴자 배제 — KICK-SEAT 이후 강퇴 행은 role='viewer' 라 이 조회에 걸리므로
    //   이 필터가 없으면 호스트가 강퇴한 사람을 무대로 되부르는 경로가 열린다.
    .eq("room_id", room_id).eq("user_id", target_user_id).neq("state", "left")
    .not("is_disabled_by_host", "is", true)
    .maybeSingle();
  if (!target) return json({ error: "Target not a participant" }, 404);
  if (target.role !== "viewer") return json({ error: "Already an actor" }, 409);

  // SEC-1 게이트 영속: 대상 행에 초대 시각 기록 → accept-stage-invite 가 이걸 검사(초대 없이 자가승격 차단).
  const { error: invErr } = await user.service
    .from("room_participants")
    .update({ stage_invited_at: new Date().toISOString() })
    .eq("id", target.id);
  if (invErr) return json({ error: "Invite failed", detail: invErr.message }, 500);

  const targetAuthId = (target.users as unknown as { auth_id: string }).auth_id;

  // 방 전체 broadcast — 대상(auth_id 일치) 본인만 수락 모달 표시(다른 참가자는 무시).
  const payload = new TextEncoder().encode(JSON.stringify({ type: "stage_invite", target_auth_id: targetAuthId }));
  try {
    await broadcastData(String(room_id), payload, "room-authority");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    return json({ error: "Broadcast failed" }, 502);
  }
  return json({ ok: true }, 200);
});
