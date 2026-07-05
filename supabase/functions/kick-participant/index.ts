// supabase/functions/kick-participant/index.ts
// 호스트가 참가자를 강퇴한다 (HOST-01). SSOT: contracts/HostConsole.md · state-machines/HostAuthority.md.
//
// 2계층 강제:
//   (1) room_participants.is_disabled_by_host=true + token_version+1  → 재입장 차단
//       (livekit-token 게이트가 이미 is_disabled_by_host 를 검사 → 새 토큰 발급 거부)
//   (2) LiveKit removeParticipant  → 현재 세션 즉시 절단
//
// 보안(성역): 호출자 == rooms.host_id 를 서버가 검증. 클라는 target_identity(=auth uid)만 넘긴다
//   — 클라가 가진 유일 식별자가 LiveKit identity(=auth uid)이므로(room_participants.id 는 클라 미보유).
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";
import { roomServiceClient } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; target_identity?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, target_identity } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (!isUuid(target_identity)) return json({ error: "Invalid target_identity" }, 400);
  if (target_identity === user.authId) return json({ error: "Cannot kick self" }, 400);

  // (1) 방 존재 + 호스트 검증
  const { data: room } = await user.service
    .from("rooms").select("id, host_id, status").eq("id", room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.host_id !== user.userId) return json({ error: "Not host" }, 403);

  // (2) target identity(auth uid) → users.id
  const { data: target } = await user.service
    .from("users").select("id, display_name").eq("auth_id", target_identity).is("deleted_at", null).single();
  if (!target) return json({ error: "Target not found" }, 404);

  // (3) 활성 참가자 행 → 강퇴 플래그 + 토큰 무효화
  const { data: part } = await user.service
    .from("room_participants")
    .select("id, token_version")
    .eq("room_id", room_id).eq("user_id", target.id).neq("state", "left")
    .maybeSingle();
  if (!part) return json({ error: "Participant not found" }, 404);

  const { error: updErr } = await user.service
    .from("room_participants")
    .update({
      is_disabled_by_host: true,
      token_version: part.token_version + 1,
      token_revoked_at: new Date().toISOString(),
    })
    .eq("id", part.id);
  if (updErr) return json({ error: "Update failed" }, 500);

  // (4) LiveKit 즉시 절단. 실패해도 DB 플래그로 재입장은 차단됨(기발급 토큰은 ≤10분 후 만료).
  try {
    await roomServiceClient().removeParticipant(room_id, String(target_identity));
  } catch (e) {
    console.error("removeParticipant failed:", e instanceof Error ? e.message : String(e));
  }

  return json({ ok: true, kicked_identity: target_identity, display_name: target.display_name ?? null }, 200);
});
