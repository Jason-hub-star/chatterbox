// 활성 참가자로 등록하는 공통 로직. join-public-room / join-room-with-password / accept-invite 공유.
// 호출부가 room(존재·미종료·lock/password 게이트)을 먼저 통과시킨 뒤 호출한다.
//
// 원자성: 슬롯 배정·정원·current_participants 는 DB 함수 join_room_as_participant 가
//   rooms 행을 FOR UPDATE 로 잠근 채 처리한다(동시 조인 레이스 차단). 마이그
//   20260706120000_atomic_room_join(+20260708130000 v2: 뷰어 제외 정원·role 반환).
// role 은 RPC 가 돌려주는 실값 — 뷰어가 재입장(rejoined)해도 actor 로 위장되지 않는다.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { json } from "./supa.ts";

type JoinRow = { status: string; participant_id: string; slot_index: number | null; role: string };

export async function joinAsParticipant(
  service: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<Response> {
  const { data, error } = await service.rpc("join_room_as_participant", {
    p_room_id: roomId,
    p_user_id: userId,
  });
  if (error) return json({ error: "Join failed", detail: error.message }, 409);

  const row = (Array.isArray(data) ? data[0] : data) as JoinRow | undefined;
  if (!row) return json({ error: "Join failed" }, 409);

  switch (row.status) {
    case "not_found":
      return json({ error: "Room not found" }, 404);
    case "full":
      return json({ error: "Room full" }, 409);
    case "rejoined":
      return json({ room_id: roomId, participant_id: row.participant_id, slot_index: row.slot_index, role: row.role ?? "actor", rejoined: true }, 200);
    case "joined":
      return json({ room_id: roomId, participant_id: row.participant_id, slot_index: row.slot_index, role: row.role ?? "actor" }, 201);
    default:
      return json({ error: "Join failed", detail: row.status }, 409);
  }
}

// 뷰어 등록(좌석·정원 비점유, 멱등). 잠금·ended 게이트는 호출부가 먼저 통과시킨다.
export async function joinAsViewer(
  service: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<Response> {
  const { data, error } = await service.rpc("join_room_as_viewer", {
    p_room_id: roomId,
    p_user_id: userId,
  });
  if (error) return json({ error: "Join failed", detail: error.message }, 409);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { status: string; participant_id: string; role: string }
    | undefined;
  if (!row) return json({ error: "Join failed" }, 409);
  if (row.status === "not_found") return json({ error: "Room not found" }, 404);
  const rejoined = row.status === "rejoined";
  return json(
    { room_id: roomId, participant_id: row.participant_id, slot_index: null, role: row.role ?? "viewer", ...(rejoined ? { rejoined: true } : {}) },
    rejoined ? 200 : 201,
  );
}
