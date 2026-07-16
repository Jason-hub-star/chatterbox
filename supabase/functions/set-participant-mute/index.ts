// set-participant-mute: 호스트가 참가자 마이크를 강제 음소거/해제한다 (HOST-08).
// SSOT: docs/contracts/HostConsole.md · state-machines/HostAuthority.md
//
// 2계층 강제(kick 과 동형):
//   (1) room_participants.muted_by_host = muted  → 재연결 시 반영(livekit-token 이 canPublish 로 게이트)
//   (2) LiveKit updateParticipant(canPublish=!muted) → 현재 세션 오디오 즉시 언퍼블리시 + 재발행 차단
//       (mutePublishedTrack 은 트랙 sid 가 필요 — canPublish 토글이 더 적은 코드로 재발행까지 막는다)
//
// 보안(성역): 호출자 == rooms.host_id 서버 검증. 클라는 target_identity(=auth uid)만 넘긴다.
//
// R4 시간제 음소거(muted_until, GOAL-room-gaps): duration_sec(10~86400, 선택)이 오면 그 시각까지.
//   만료 판정은 판독측 파생 3점(livekit-token canPublish · list-room-members · 아래 자가해제)이라 cron 불요.
//   자가해제: 대상 본인이 muted=false 로 호출하면 서버 시계로 만료를 검증 후 해제(호스트 불요·클라 시계 불신).
import { getAppUser, json, isUuid, cors, requireHostRoom } from "../_shared/supa.ts";
import { roomServiceClient } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; target_identity?: unknown; muted?: unknown; duration_sec?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, target_identity, muted, duration_sec } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (!isUuid(target_identity)) return json({ error: "Invalid target_identity" }, 400);
  if (typeof muted !== "boolean") return json({ error: "Invalid muted" }, 400);
  let durationSec: number | null = null;
  if (duration_sec !== undefined) {
    if (!muted || !Number.isInteger(duration_sec) || (duration_sec as number) < 10 || (duration_sec as number) > 86400) {
      return json({ error: "Invalid duration_sec" }, 400);
    }
    durationSec = duration_sec as number;
  }

  // R4 자가해제: 시간제 만료 후 본인 해제만 허용(서버 시계 검증) — 그 외 self 조작은 기존대로 금지.
  if (target_identity === user.authId) {
    if (muted) return json({ error: "Cannot mute self" }, 400);
    const { data: mine } = await user.service
      .from("room_participants")
      .select("id, role, muted_by_host, muted_until")
      .eq("room_id", room_id).eq("user_id", user.userId).neq("state", "left")
      .maybeSingle();
    if (!mine) return json({ error: "Participant not found" }, 404);
    const expired = mine.muted_by_host && mine.muted_until &&
      new Date(mine.muted_until as string).getTime() <= Date.now();
    if (!expired) return json({ error: "Not host" }, 403);
    const { error: selfErr } = await user.service
      .from("room_participants")
      .update({ muted_by_host: false, muted_until: null })
      .eq("id", mine.id);
    if (selfErr) return json({ error: "Update failed" }, 500);
    try {
      await roomServiceClient().updateParticipant(String(room_id), user.authId, {
        permission: { canPublish: mine.role !== "viewer", canSubscribe: true, canPublishData: mine.role !== "viewer" },
      });
    } catch (e) {
      console.error("updateParticipant failed:", e instanceof Error ? e.message : String(e));
    }
    return json({ ok: true, muted: false, muted_until: null, target_identity, display_name: null }, 200);
  }

  // (1) 방 존재 + 호스트 검증
  const gate = await requireHostRoom(user.service, room_id, user.userId);
  if (!gate.ok) return gate.res;

  // (2) target identity(auth uid) → users.id
  const { data: target } = await user.service
    .from("users").select("id, display_name").eq("auth_id", target_identity).is("deleted_at", null).single();
  if (!target) return json({ error: "Target not found" }, 404);

  // (3) 활성 참가자 행 → mute 플래그(DB 권위). muted_until = 시간제 만료 시각(무기한·해제는 null).
  const { data: part } = await user.service
    .from("room_participants")
    .select("id, role")
    .eq("room_id", room_id).eq("user_id", target.id).neq("state", "left")
    .maybeSingle();
  if (!part) return json({ error: "Participant not found" }, 404);

  const mutedUntil = muted && durationSec
    ? new Date(Date.now() + durationSec * 1000).toISOString()
    : null;
  const { error: updErr } = await user.service
    .from("room_participants")
    .update({ muted_by_host: muted, muted_until: mutedUntil })
    .eq("id", part.id);
  if (updErr) return json({ error: "Update failed" }, 500);

  // (4) LiveKit 실시간 강제. 실패해도 DB 플래그로 재연결 시 반영됨.
  //     unmute 의 canPublish 는 role 파생(viewer 에게 발행권을 실수로 부여하지 않게 — livekit-token 과 동형).
  try {
    await roomServiceClient().updateParticipant(room_id, String(target_identity), {
      permission: { canPublish: !muted && part.role !== "viewer", canSubscribe: true, canPublishData: part.role !== "viewer" },
    });
  } catch (e) {
    console.error("updateParticipant failed:", e instanceof Error ? e.message : String(e));
  }

  return json({ ok: true, muted, muted_until: mutedUntil, target_identity, display_name: target.display_name ?? null }, 200);
});
