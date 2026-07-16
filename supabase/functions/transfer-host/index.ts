// transfer-host: 호스트가 방 운영권을 다른 배우에게 명시 이양한다 (HOST-06 후반, GOAL-room-gaps R1).
// 입력: { room_id, target_identity } — target = LiveKit identity(=auth uid), kick/mute 와 동형.
// 보안(성역): 호출자 == rooms.host_id 서버 검증(requireHostRoom) + 대상은 활성 배우 참가자만
//   (뷰어·강퇴자·퇴장자 제외). DB(rooms.host_id) 갱신 후 room-authority 'host_change' 서버 broadcast —
//   수신측(RoomPage)은 멤버 재조회로 hostId 재파생(isHost·왕관·콘솔 탭·vod publisher 전환).
//   자동 승계(leave-room)와 같은 진실 소스(rooms.host_id)라 두 경로가 충돌하지 않는다.
import { cors, json, getAppUser, isUuid, requireHostRoom } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; target_identity?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  if (!isUuid(body.target_identity)) return json({ error: "Invalid target_identity" }, 400);
  const roomId = body.room_id;
  const targetAuthId = body.target_identity;

  const gate = await requireHostRoom(service, roomId, userId);
  if (!gate.ok) return gate.res;

  // 대상 프로필(auth uid → users.id) — kick-participant 와 동형 매핑.
  const { data: target } = await service
    .from("users").select("id")
    .eq("auth_id", targetAuthId).is("deleted_at", null)
    .single();
  if (!target) return json({ error: "Target not found" }, 404);
  if (target.id === userId) return json({ error: "Already host" }, 400);

  // 대상은 활성 배우 참가자만 — 호스트 권한은 좌석 있는 배우에게만(isActiveParticipant 조건 + role 게이트).
  const { data: part } = await service
    .from("room_participants").select("id")
    .eq("room_id", roomId).eq("user_id", target.id)
    .neq("state", "left").not("is_disabled_by_host", "is", true)
    .neq("role", "viewer")
    .maybeSingle();
  if (!part) return json({ error: "Target not an active actor" }, 409);

  // eq(host_id, userId) 조건부 갱신 — 동시 이양/승계 경합 시 첫 승자만 반영(레이스 방어).
  const { error: upErr } = await service
    .from("rooms").update({ host_id: target.id })
    .eq("id", roomId).eq("host_id", userId);
  if (upErr) return json({ error: "Transfer failed" }, 500);

  // 전원 통지 — 수신측은 raiseHandRefetch 범프로 hostId 재조회(서버 진실 재파생).
  // DB 는 이미 이양됨 — broadcast 실패를 에러로 돌려주면 "실패로 보이는 성공"이 되므로 best-effort
  // (미수신 클라는 다음 멤버 변동 재조회에서 수렴, set-room-mode 의 502 계약과 의도적 편차).
  const payload = new TextEncoder().encode(JSON.stringify({
    type: "host_change",
    new_host_auth_id: targetAuthId,
    prev_host_user_id: userId,
    changed_at_ms: Date.now(),
  }));
  try {
    await broadcastData(String(roomId), payload, "room-authority");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true, new_host_id: target.id }, 200);
});
