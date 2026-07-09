// raise-hand: 관객(뷰어)이 무대 서기 요청(손들기)을 토글한다 (ROOM-20). raise_hand_at 세팅/해제 후
// room-authority broadcast 로 호스트 큐를 실시간 갱신(호스트가 list-room-members 재조회). send-reaction 과 동형 릴레이.
// SSOT: contracts/HostConsole.md §G-154. 승격(viewer→actor)은 promote_viewer_to_actor(슬라이스 2).
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; raised?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, raised } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (typeof raised !== "boolean") return json({ error: "Invalid raised" }, 400);

  // 방 존재 + 종료 아님
  const { data: room } = await user.service
    .from("rooms").select("id, status").eq("id", room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);

  // 멤버십: 호출자 본인의 활성 참가자 행만 토글(타인 손 조작 불가·비참가자 차단)
  const { data: part } = await user.service
    .from("room_participants").select("id")
    .eq("room_id", room_id).eq("user_id", user.userId).neq("state", "left")
    .maybeSingle();
  if (!part) return json({ error: "Not a participant" }, 403);

  await user.service
    .from("room_participants")
    .update({ raise_hand_at: raised ? new Date().toISOString() : null })
    .eq("id", part.id);

  // 호스트 큐 실시간 갱신 트리거(방 전체 broadcast, 호스트만 반응해 재조회). reaction 과 동형.
  const payload = new TextEncoder().encode(JSON.stringify({ type: "raise_hand" }));
  try {
    await broadcastData(String(room_id), payload, "room-authority");
  } catch (e) {
    // broadcast 실패해도 raise_hand_at 은 이미 저장됨 — 호스트 다음 재조회 시 반영(치명적 아님).
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true, raised }, 200);
});
