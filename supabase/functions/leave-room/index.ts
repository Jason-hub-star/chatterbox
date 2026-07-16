// leave-room: 참가자 퇴장(soft) + 필요 시 호스트 승계 + 빈 방 종료.
// SSOT: docs/API-SURFACE.md, docs/state-machines/Room.md (Host Leaves / LIVE→ENDED)
// 입력: { room_id }  출력: { ok, new_host_id? }
//
// ponytail: 30초 grace 후 ended(emptied_at)·room-authority 브로드캐스트·webhook 은 후속 슬라이스.
//   여기선 마지막 참가자 퇴장 시 즉시 status='ended'. token_version 은 +1(재입장 방지 기반).

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // LOB-07: 익명 게스트 뷰어의 정상 퇴장 허용(뷰어 퇴장은 좌석·승계 무영향 — 아래 기존 분기).
  const auth = await getAppUser(req, { allowAnonymous: true });
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

  const { data: room, error: rErr } = await service
    .from("rooms")
    .select("id, host_id, status, authority_epoch, is_practice")
    .eq("id", roomId)
    .single();
  if (rErr || !room) return json({ error: "Room not found" }, 404);

  const { data: mine } = await service
    .from("room_participants")
    .select("id, token_version, role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .neq("state", "left")
    .maybeSingle();
  if (!mine) return json({ ok: true, already_left: true }, 200);

  // 퇴장 기록(soft) + 기발급 토큰 무효화 기반(token_version+1)
  await service
    .from("room_participants")
    .update({ state: "left", left_at: new Date().toISOString(), token_version: mine.token_version + 1 })
    .eq("id", mine.id);

  // 뷰어 퇴장(Phase 4): 좌석·정원 비점유라 방 상태에 아무 영향 없음 — 기록만 하고 끝.
  if (mine.role === "viewer") return json({ ok: true, new_host_id: null }, 200);

  // 남은 활성 배우 수 — 정원·승계·종료 판정은 배우 기준(뷰어는 무대를 유지할 수 없다).
  const { count } = await service
    .from("room_participants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .neq("state", "left")
    .neq("role", "viewer");
  const remaining = count ?? 0;

  let newHostId: string | null = null;

  if (remaining === 0) {
    // 연습 방(LOB-10)은 상시 유지 — 비어도 닫지 않는다(카운트만 0).
    if (room.is_practice) {
      await service.from("rooms").update({ current_participants: 0 }).eq("id", roomId);
      return json({ ok: true, new_host_id: null }, 200);
    }
    // 마지막 배우 → 방 종료(남은 뷰어의 토큰은 room ended 게이트가 무효화).
    await service
      .from("rooms")
      .update({ status: "ended", ended_at: new Date().toISOString(), current_participants: 0 })
      .eq("id", roomId);
    return json({ ok: true, new_host_id: null }, 200);
  }

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

  return json({ ok: true, new_host_id: newHostId }, 200);
});
