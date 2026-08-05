// _shared/roomLeave.ts — soft-leave + 호스트 승계 + 빈 방 종료의 단일 지점(GOAL-room-gaps R5).
// 진입점 2곳이 공유: leave-room(사용자 명시 퇴장) · livekit-webhook(participant_left — 탭닫기/크래시/
// 네트워크 사망 회수). 로직은 leave-room 원본에서 무수정 추출 — 응답 매핑만 호출부 소유.
// UX-HOST-SUCCESSION/UX-ROOM-ENDED(사다리 D3): 승계·종료를 room-authority 로 전원 통지(전엔 무통보라
// 새 호스트는 조용히·남은 뷰어는 얼어붙은 화면). broadcast 는 best-effort(실패해도 DB 이탈은 커밋됨).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { broadcastData } from "./livekit.ts";

async function broadcastAuthority(roomId: string, msg: Record<string, unknown>): Promise<void> {
  try {
    await broadcastData(roomId, new TextEncoder().encode(JSON.stringify(msg)), "room-authority");
  } catch (e) {
    console.error("roomLeave broadcast failed:", e instanceof Error ? e.message : String(e));
  }
}

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
    // 유료 더빙 보존(DUB-PERSIST): 진행 중 더빙 세션이 있으면 방을 닫지 않는다 — 닫으면
    // join-public-room 이 재입장을 막아 STT/번역 비용이 든 더빙이 고립된다. 방을 waiting 으로
    // 유지하면 재입장 시 fetchActiveDubSession 이 그대로 복원한다(is_practice 유지 예외와 동형).
    const { data: activeDub } = await service
      .from("dub_sessions")
      .select("id")
      .eq("room_id", roomId)
      .not("status", "in", "(completed,failed)")
      .limit(1);
    if (activeDub && activeDub.length > 0) {
      await service.from("rooms").update({ current_participants: 0 }).eq("id", roomId);
      return { kind: "left", newHostId: null };
    }
    // 마지막 배우 → 방 종료(남은 뷰어의 토큰은 room ended 게이트가 무효화).
    await service
      .from("rooms")
      .update({ status: "ended", ended_at: new Date().toISOString(), current_participants: 0 })
      .eq("id", roomId);
    // UX-ROOM-ENDED: 남은 뷰어에게 방종료 통지 → 클라가 RM-DEADROOM 모달 표시(얼어붙은 화면 대신).
    await broadcastAuthority(roomId, { type: "room_ended" });
    return { kind: "left", newHostId: null };
  }

  let newHostId: string | null = null;
  if (room.host_id === userId) {
    // 호스트 승계: 남은 배우 중 가장 먼저 들어온 사람(뷰어는 호스트가 될 수 없음).
    // SEC-KICK-3: 강퇴자 제외 — kick 은 is_disabled_by_host 만 세팅하고 state 는 그대로 두므로
    //   이 필터가 없으면 강퇴당한 최선참 배우가 호스트 퇴장 시 host_id 를 물려받는다(권한상승:
    //   requireHostRoom 은 host_id 만 비교 → kick/mute/moderate-chat/transfer-host 전권 획득).
    //   transfer-host(:41-46)는 이미 같은 필터를 쓴다 — 승계 경로만 누락이었다.
    // 후보가 전무하면(남은 배우가 전부 강퇴자) newHostId=null — 무주공산이 강퇴자 장악보다 안전.
    const { data: next } = await service
      .from("room_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .neq("state", "left")
      .not("is_disabled_by_host", "is", true)
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
    // UX-HOST-SUCCESSION: 자동 승계를 전원 통지(transfer-host 와 동일 host_change payload) — 새 호스트는
    // toast + 즉시 재조회, 나머지는 hostId 재파생. 무통보로 콘솔 탭만 조용히 생기던 것 해소.
    if (newHostId) {
      const { data: nh } = await service.from("users").select("auth_id").eq("id", newHostId).maybeSingle();
      await broadcastAuthority(roomId, {
        type: "host_change",
        new_host_auth_id: nh?.auth_id ?? null,
        prev_host_user_id: userId,
        changed_at_ms: Date.now(),
      });
    }
  } else {
    await service.from("rooms").update({ current_participants: remaining }).eq("id", roomId);
  }

  return { kind: "left", newHostId };
}
