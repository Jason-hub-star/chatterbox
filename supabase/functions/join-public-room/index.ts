// join-public-room: 인증 사용자가 공개 방에 입장(초대·비밀번호 없음).
// SSOT: docs/API-SURFACE.md, docs/state-machines/Room.md
// 입력: { room_id }  출력: { room_id, participant_id, slot_index, role }
//
// ponytail: 이번 슬라이스는 role='actor' 고정(2인 연기 데모는 전원 발행 필요).
//   viewer(무대/객석 분리)·초대(accept-invite)·비밀번호(room_secrets)는 후속 슬라이스.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

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

  const { data: room, error: rErr } = await service
    .from("rooms")
    .select("id, status, max_participants, is_locked")
    .eq("id", roomId)
    .single();
  if (rErr || !room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.is_locked) return json({ error: "Room is locked" }, 403); // 초대/비번은 후속

  // 활성 참가자(슬롯·본인 여부·정원)
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

  if (active.length >= room.max_participants) return json({ error: "Room full" }, 409);

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
});
