// _shared/roomLeave.ts — soft-leave + 호스트 승계 + 빈 방 종료의 단일 지점(GOAL-room-gaps R5).
// 진입점 2곳이 공유: leave-room(사용자 명시 퇴장) · livekit-webhook(participant_left — 탭닫기/크래시/
// 네트워크 사망 회수). 로직은 leave-room 원본에서 무수정 추출 — 응답 매핑만 호출부 소유.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type SoftLeaveResult =
  | { kind: "room_not_found" }
  | { kind: "already_left" }
  | { kind: "left"; newHostId: string | null };

export async function softLeaveRoom(
  service: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<SoftLeaveResult> {
  const { data: room, error: rErr } = await service
    .from("rooms")
    .select("id, host_id, status, authority_epoch, is_practice")
    .eq("id", roomId)
    .single();
  if (rErr || !room) return { kind: "room_not_found" };

  const { data: mine } = await service
    .from("room_participants")
    .select("id, token_version, role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .neq("state", "left")
    .maybeSingle();
  if (!mine) return { kind: "already_left" };

  // 퇴장 기록(soft) + 기발급 토큰 무효화 기반(token_version+1)
  await service
    .from("room_participants")
    .update({ state: "left", left_at: new Date().toISOString(), token_version: mine.token_version + 1 })
    .eq("id", mine.id);

  // 뷰어 퇴장(Phase 4): 좌석·정원 비점유라 방 상태에 아무 영향 없음 — 기록만 하고 끝.
  if (mine.role === "viewer") return { kind: "left", newHostId: null };

  // 남은 활성 배우 수 — 정원·승계·종료 판정은 배우 기준(뷰어는 무대를 유지할 수 없다).
  const { count } = await service
    .from("room_participants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .neq("state", "left")
    .neq("role", "viewer");
  const remaining = count ?? 0;

  if (remaining === 0) {
    // 연습 방(LOB-10)은 상시 유지 — 비어도 닫지 않는다(카운트만 0).
    if (room.is_practice) {
      await service.from("rooms").update({ current_participants: 0 }).eq("id", roomId);
      return { kind: "left", newHostId: null };
    }
    // 마지막 배우 → 방 종료(남은 뷰어의 토큰은 room ended 게이트가 무효화).
    await service
      .from("rooms")
      .update({ status: "ended", ended_at: new Date().toISOString(), current_participants: 0 })
      .eq("id", roomId);
    return { kind: "left", newHostId: null };
  }

  let newHostId: string | null = null;
  if (room.host_id === userId) {
    // 호스트 승계: 남은 배우 중 가장 먼저 들어온 사람(뷰어는 호스트가 될 수 없음).
    const { data: next } = await service
      .from("room_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .neq("state", "left")
      .neq("role", "viewer")
      .order("joined_at", { ascending: true })
      .limit(1)
      .single();
    newHostId = next?.user_id ?? null;
    await service
      .from("rooms")
      .update({
        host_id: newHostId,
        authority_epoch: room.authority_epoch + 1,
        current_participants: remaining,
      })
      .eq("id", roomId);
  } else {
    await service.from("rooms").update({ current_participants: remaining }).eq("id", roomId);
  }

  return { kind: "left", newHostId };
}
