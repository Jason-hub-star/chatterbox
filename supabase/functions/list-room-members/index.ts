// list-room-members: 방 참가자 명단(users.id + 표시이름) 조회(방 멤버 전용).
// SSOT: docs/contracts/DubRoleAssigner.md (역할배정에 참가자 목록 필요)
// 입력: { room_id }  출력: { members: [{ user_id, display_name, slot_index, role }] }
//
// users RLS 는 타인 프로필 조회를 막고 LiveKit identity 는 auth uid 라 users.id 와 다르다.
// 역할배정(dub_tracks.participant_id = users.id)에 필요한 매핑을 service_role 로 제공.

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

  // 호출자가 방의 활성 참가자여야 명단을 볼 수 있다
  const { data: me } = await service
    .from("room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .neq("state", "left")
    .maybeSingle();
  if (!me) return json({ error: "방 참가자만 명단을 볼 수 있어요." }, 403);

  const { data: rows, error } = await service
    .from("room_participants")
    .select("slot_index, role, users(id, display_name)")
    .eq("room_id", roomId)
    .neq("state", "left")
    .order("slot_index", { ascending: true });
  if (error) return json({ error: "명단 조회 실패", detail: error.message }, 500);

  const members = (rows ?? []).map((r) => {
    const u = r.users as unknown as { id: string; display_name: string | null };
    return { user_id: u.id, display_name: u.display_name, slot_index: r.slot_index, role: r.role };
  });
  return json({ members }, 200);
});
