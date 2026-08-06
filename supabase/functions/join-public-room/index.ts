// join-public-room: 인증 사용자가 공개 방에 입장(초대·비밀번호 없음).
// SSOT: docs/specs/API-SURFACE.md, docs/state-machines/Room.md
// 입력: { room_id }  출력: { room_id, participant_id, slot_index, role }
//
// ponytail: 이번 슬라이스는 role='actor' 고정(2인 연기 데모는 전원 발행 필요).
//   viewer(무대/객석 분리)·초대(accept-invite)·비밀번호(room_secrets)는 후속 슬라이스.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { joinAsParticipant } from "../_shared/roomJoin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roomId = body.room_id;

  // RL-GAP: 배우 입장은 좌석 점유라 무제한이면 방마다 자리를 잡아 도는 게 공짜다(정원 6 → 피해 즉시 체감).
  //   join-as-viewer 와 동일 규칙으로 **새 방만** 센다 — 이 함수도 페이지 로드마다 호출되므로(멱등)
  //   무조건 세면 새로고침이 정상 유저를 잠근다. 캡의 의미 = "시간당 새로 들어간 방 수".
  const { data: existing } = await service
    .from("room_participants").select("id")
    .eq("room_id", roomId).eq("user_id", userId).neq("state", "left")
    .maybeSingle();
  if (!existing) {
    const { data: rlOk } = await service.rpc("check_rate_limit", {
      p_key: `room-join:${userId}`,
      p_max: 30,
      p_window_sec: 3600,
    });
    if (rlOk === false) return json({ error: "입장이 너무 잦아요. 잠시 후 다시 시도해주세요." }, 429);
  }

  const { data: room, error: rErr } = await service
    .from("rooms")
    .select("id, status, is_locked")
    .eq("id", roomId)
    .single();
  if (rErr || !room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.is_locked) return json({ error: "Room is locked" }, 403); // 잠금방은 join-room-with-password 로

  return await joinAsParticipant(service, room.id, userId);
});
