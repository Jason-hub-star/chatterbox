// 활성 참가자로 등록하는 공통 로직(멱등·최저 빈 슬롯·정원). join-public-room / join-room-with-password 공유.
// 호출부가 room(존재·미종료·lock/password 게이트)을 먼저 통과시킨 뒤 호출한다 — 슬롯 배정만 한 곳에서.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { json } from "./supa.ts";

export async function joinAsParticipant(
  service: SupabaseClient,
  roomId: string,
  maxParticipants: number,
  userId: string,
): Promise<Response> {
  const { data: parts } = await service
    .from("room_participants")
    .select("id, slot_index, user_id, state")
    .eq("room_id", roomId)
    .neq("state", "left");
  const active = parts ?? [];

  // 이미 참가 중이면 기존 행 반환(멱등 — 새로고침/중복 호출 안전)
  const mine = active.find((p) => p.user_id === userId);
  if (mine) {
    return json({ room_id: roomId, participant_id: mine.id, slot_index: mine.slot_index, role: "actor", rejoined: true }, 200);
  }

  if (active.length >= maxParticipants) return json({ error: "Room full" }, 409);

  // 가장 낮은 빈 슬롯
  const used = new Set(active.map((p) => p.slot_index));
  let slot = 0;
  while (used.has(slot)) slot++;

  const { data: part, error: pErr } = await service
    .from("room_participants")
    .insert({ room_id: roomId, user_id: userId, slot_index: slot, role: "actor", state: "connected" })
    .select("id, slot_index")
    .single();
  if (pErr || !part) {
    // UNIQUE(room_id,user_id) 경합 또는 슬롯 충돌 → 클라 재시도 유도
    return json({ error: "Join failed", detail: pErr?.message }, 409);
  }

  await service.from("rooms").update({ current_participants: active.length + 1 }).eq("id", roomId);
  return json({ room_id: roomId, participant_id: part.id, slot_index: part.slot_index, role: "actor" }, 201);
}
