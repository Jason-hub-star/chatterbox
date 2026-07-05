// 활성 참가자로 등록하는 공통 로직. join-public-room / join-room-with-password 공유.
// 호출부가 room(존재·미종료·lock/password 게이트)을 먼저 통과시킨 뒤 호출한다.
//
// 원자성: 슬롯 배정·정원·current_participants 는 DB 함수 join_room_as_participant 가
//   rooms 행을 FOR UPDATE 로 잠근 채 처리한다(동시 조인 레이스 차단). 마이그
//   20260706120000_atomic_room_join. 여기선 그 RPC 를 한 번 호출하고 상태→HTTP 로 매핑만.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { json } from "./supa.ts";

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

  const row = (Array.isArray(data) ? data[0] : data) as
    | { status: string; participant_id: string; slot_index: number }
    | undefined;
  if (!row) return json({ error: "Join failed" }, 409);

  switch (row.status) {
    case "not_found":
      return json({ error: "Room not found" }, 404);
    case "full":
      return json({ error: "Room full" }, 409);
    case "rejoined":
      return json({ room_id: roomId, participant_id: row.participant_id, slot_index: row.slot_index, role: "actor", rejoined: true }, 200);
    case "joined":
      return json({ room_id: roomId, participant_id: row.participant_id, slot_index: row.slot_index, role: "actor" }, 201);
    default:
      return json({ error: "Join failed", detail: row.status }, 409);
  }
}
