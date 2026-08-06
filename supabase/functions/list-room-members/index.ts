// list-room-members: 방 참가자 명단(users.id + 표시이름) 조회(방 멤버 전용).
// SSOT: docs/contracts/DubRoleAssigner.md (역할배정에 참가자 목록 필요)
// 입력: { room_id }  출력: { members: [{ user_id, auth_id, display_name, avatar_url, slot_index, role }] }
// auth_id·avatar_url: 방 아바타 렌더용 — LiveKit identity(=auth uid)로 참가자별 아바타를 찾는다.
//
// users RLS 는 타인 프로필 조회를 막고 LiveKit identity 는 auth uid 라 users.id 와 다르다.
// 역할배정(dub_tracks.participant_id = users.id)에 필요한 매핑을 service_role 로 제공.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // RM-GUEST-CRASH: 익명 관전자도 명단 조회 허용 — 아래 "활성 참가자" 게이트가 접근 통제를 유지한다
  // (비참가자는 익명·정회원 무관 403). 게스트는 join-as-viewer 로 참가자 행을 이미 가진다.
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

  // RL-GAP: 폭주 가드(프라이버시 게이트가 아니다 — 그건 아래 활성 참가자 검사와 join-as-viewer 캡이 한다).
  //   정상 사용이 참가자 변동마다 + 30초 주기로 몰아치므로(useRoomMembers.ts:83) 캡은 넉넉해야 한다:
  //   초당 1회 평균이면 6인 방의 입퇴장 폭주도 안 걸리고, 무한루프 클라 하나가 DB를 물어뜯는 건 막는다.
  const { data: rlOk } = await service.rpc("check_rate_limit", {
    p_key: `members-list:${userId}`,
    p_max: 300,
    p_window_sec: 300,
  });
  if (rlOk === false) return json({ error: "Too many requests" }, 429);

  // 호출자가 방의 활성 참가자여야 명단을 볼 수 있다.
  // SEC-2: 강퇴자(is_disabled_by_host)는 앱 세션이 살아있어도 명단 조회 불가 — isActiveParticipant 와 동일 게이트.
  const { data: me } = await service
    .from("room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .neq("state", "left")
    .not("is_disabled_by_host", "is", true)
    .maybeSingle();
  if (!me) return json({ error: "방 참가자만 명단을 볼 수 있어요." }, 403);

  const { data: rows, error } = await service
    .from("room_participants")
    .select("slot_index, role, muted_by_host, muted_until, raise_hand_at, users(id, auth_id, display_name, avatar_url)")
    .eq("room_id", roomId)
    .neq("state", "left")
    .order("slot_index", { ascending: true });
  if (error) return json({ error: "명단 조회 실패", detail: error.message }, 500);

  const members = (rows ?? []).map((r) => {
    const u = r.users as unknown as {
      id: string; auth_id: string; display_name: string | null; avatar_url: string | null;
    };
    // R4 시간제 음소거: 만료 파생을 서버 단일 지점에서 — 소비처(배지·mutedByHost 동기)는 무변경.
    const mutedActive = r.muted_by_host &&
      (!r.muted_until || new Date(r.muted_until as string).getTime() > Date.now());
    return {
      user_id: u.id,
      auth_id: u.auth_id,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      slot_index: r.slot_index,
      role: r.role,
      muted_by_host: mutedActive,       // mute 마운트 로드(A-FUNC-3): 새로고침 후 desync 방지
      muted_until: mutedActive ? r.muted_until : null, // 잔여 표시용(무기한·만료는 null)
      raise_hand_at: r.raise_hand_at,   // ROOM-20 손들기 큐(호스트 승인 대기). null = 손 안 듦
    };
  });
  return json({ members }, 200);
});
