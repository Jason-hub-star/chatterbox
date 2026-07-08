// accept-invite: 초대 수락 = 소비(consume_room_invite, 원자) + 참가자 등록(join RPC 재사용). LOB-05.
// SSOT: contracts/LobbyPage.md §초대링크 — as-built 편차: 유효 초대는 잠금방(is_locked)도 비번 없이 입장.
//   128-bit 초대코드가 4자+ 비번보다 강한 자격이고 호스트가 명시 발급 — 우회가 아니라 상위 게이트.
// 순서는 소비→조인 — 역순이면 used_up 초대로도 입장이 성립해 사용횟수 상한이 무의미해진다.
//   조인이 full 로 지면 사용 1회 낭비 가능(ponytail: 환불 없음 — 재발급이 싸다).
import { cors, json, getAppUser } from "../_shared/supa.ts";
import { isInviteCode, inviteCodeHash } from "../_shared/inviteCode.ts";
import { joinAsParticipant } from "../_shared/roomJoin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { invite_code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isInviteCode(body.invite_code)) return json({ error: "invalid" }, 404);

  // verify 와 같은 버킷(user당 5회/5분) — 코드 탐색을 verify·accept 어느 문으로도 못 하게.
  const rlKey = `invite:${userId}`;
  const { data: allowed } = await service
    .rpc("check_rate_limit", { p_key: rlKey, p_max: 5, p_window_sec: 300 });
  if (allowed === false) {
    return json({ error: "시도가 너무 많아요. 잠시 후 다시 시도해주세요." }, 429);
  }

  const hash = await inviteCodeHash(body.invite_code);

  // 멱등 선체크: 이미 이 방의 활성 참가자면 소비 없이 재입장 — 새로고침/더블클릭이 사용횟수를 태우지 않게.
  const { data: pre } = await service
    .from("room_invites").select("room_id, rooms(status)").eq("invite_code_hash", hash).maybeSingle();
  if (!pre) return json({ error: "invalid" }, 404);
  const preRoom = (Array.isArray(pre.rooms) ? pre.rooms[0] : pre.rooms) as { status?: string } | undefined;
  if (preRoom?.status === "ended") return json({ error: "room_ended" }, 410);
  const { data: existing } = await service
    .from("room_participants").select("id")
    .eq("room_id", pre.room_id).eq("user_id", userId).neq("state", "left")
    .limit(1).maybeSingle();
  if (existing) return await joinAsParticipant(service, pre.room_id, userId); // → rejoined

  const { data: consumed, error: cErr } = await service
    .rpc("consume_room_invite", { p_code_hash: hash, p_user_id: userId });
  const row = (Array.isArray(consumed) ? consumed[0] : consumed) as
    | { status: string; room_id: string | null; invite_role: string | null }
    | undefined;
  if (cErr || !row) return json({ error: "invalid" }, 404);
  if (row.status !== "ok" || !row.room_id) {
    const gone = ["revoked", "expired", "used_up"].includes(row.status);
    return json({ error: row.status }, gone ? 410 : 404);
  }

  // 정상 수락이면 시도 카운터 리셋(pwjoin 과 동일 — 정상 유저의 연속 초대 사용이 스스로 잠기지 않게).
  await service.from("rate_limit_counters").delete().eq("bucket_key", rlKey);

  return await joinAsParticipant(service, row.room_id, userId);
});
