// set-participant-mute: 호스트가 참가자 마이크를 강제 음소거/해제한다 (HOST-08).
// SSOT: docs/contracts/HostConsole.md · state-machines/HostAuthority.md
//
// 2계층 강제(kick 과 동형):
//   (1) room_participants.muted_by_host = muted  → 재연결 시 반영(livekit-token 이 canPublish 로 게이트)
//   (2) LiveKit updateParticipant(canPublish=!muted) → 현재 세션 오디오 즉시 언퍼블리시 + 재발행 차단
//       (mutePublishedTrack 은 트랙 sid 가 필요 — canPublish 토글이 더 적은 코드로 재발행까지 막는다)
//
// 보안(성역): 호출자 == rooms.host_id 서버 검증. 클라는 target_identity(=auth uid)만 넘긴다.
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";
import { roomServiceClient } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; target_identity?: unknown; muted?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, target_identity, muted } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (!isUuid(target_identity)) return json({ error: "Invalid target_identity" }, 400);
  if (typeof muted !== "boolean") return json({ error: "Invalid muted" }, 400);
  if (target_identity === user.authId) return json({ error: "Cannot mute self" }, 400);

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

  // (3) 활성 참가자 행 → mute 플래그(DB 권위)
  const { data: part } = await user.service
    .from("room_participants")
    .select("id")
    .eq("room_id", room_id).eq("user_id", target.id).neq("state", "left")
    .maybeSingle();
  if (!part) return json({ error: "Participant not found" }, 404);

  const { error: updErr } = await user.service
    .from("room_participants")
    .update({ muted_by_host: muted })
    .eq("id", part.id);
  if (updErr) return json({ error: "Update failed" }, 500);

  // (4) LiveKit 실시간 강제. 실패해도 DB 플래그로 재연결 시 반영됨.
  try {
    await roomServiceClient().updateParticipant(room_id, String(target_identity), {
      permission: { canPublish: !muted, canSubscribe: true, canPublishData: true },
    });
  } catch (e) {
    console.error("updateParticipant failed:", e instanceof Error ? e.message : String(e));
  }

  return json({ ok: true, muted, target_identity, display_name: target.display_name ?? null }, 200);
});
