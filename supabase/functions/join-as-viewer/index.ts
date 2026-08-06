// join-as-viewer: 관전 입장(LOB-07·ViewerGate MVP). 좌석·정원 비점유, canPublish=false 는
// livekit-token 이 role 로 강제. 잠금방은 공개 관전 불가(사적 공간) — 뷰어 초대(accept-invite)로만.
// SSOT: docs/contracts/ViewerGate.md — as-built: 로그인 뷰어부터(익명은 대시보드 anonymous sign-in 후속).
import { clientIp, cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { joinAsViewer } from "../_shared/roomJoin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // LOB-07: 익명 게스트 관전 허용 — read-only 는 role=viewer + livekit-token(canPublish/Data=false)이 강제.
  const auth = await getAppUser(req, { allowAnonymous: true });
  if (!auth.ok) return auth.res;
  const { userId, service, isAnonymous } = auth.user;

  let body: { room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);

  // STK-1: 관전 입장 = "누가 어느 방에 있나" 전수 스캔의 길목이다. 스캐너는 방마다 이 함수를 한 번
  //   통과해야 list-room-members 로 명단을 뜰 수 있으므로, 여기서 **방 개수**를 조이는 게 명단 조회를
  //   조이는 것보다 정확하다(명단 조회는 정상 사용이 참가자 변동마다 몰아쳐 캡을 못 조인다).
  // 재입장은 세지 않는다: 이 함수는 페이지 로드마다 호출되므로(멱등), 무조건 세면 새로고침 20번에
  //   정상 관전자가 잠긴다. 기존 참가행이 있으면 새 방이 아니다 = 스캔이 아니다.
  // 익명은 IP 키 — 익명 신원은 무료라(재가입 즉시) user 키가 사실상 무제한이 된다. 정회원은 user 키:
  //   IP 를 쓰면 공용 와이파이·회사망에서 정상 유저끼리 서로를 잠근다.
  const { data: existing } = await service
    .from("room_participants").select("id")
    .eq("room_id", body.room_id).eq("user_id", userId).neq("state", "left")
    .maybeSingle();
  if (!existing) {
    // 시간당 새 방 20개: 정상 관전자는 한 자릿수, 스캐너는 첫 20방에서 멈춘다.
    const { data: rlOk } = await service.rpc("check_rate_limit", {
      p_key: isAnonymous ? `viewer-join-ip:${clientIp(req)}` : `viewer-join:${userId}`,
      p_max: 20,
      p_window_sec: 3600,
    });
    if (rlOk === false) return json({ error: "관전 입장이 너무 잦아요. 잠시 후 다시 시도해주세요." }, 429);
  }

  const { data: room } = await service
    .from("rooms").select("id, status, is_locked").eq("id", body.room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.is_locked) return json({ error: "Room is locked" }, 403);

  return await joinAsViewer(service, room.id, userId);
});
