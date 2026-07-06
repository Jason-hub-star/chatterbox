// supabase/functions/send-reaction/index.ts
// 리액션 서버 릴레이 — 클라가 직접 방송하지 않고 서버가 검증 후 방 전체에 broadcast.
// 왜: LiveKit datachannel 개설지연으로 클라 직접 방송은 첫 메시지 유실(2탭 prod E2E 실측 ~30%).
//   서버는 이미 안정연결이라 유실 0 + 발신자 identity 를 auth 로 확정 → 스푸핑 불가
//   (수신측은 participant=undefined 인 '서버발'만 수락, sender 는 payload 신뢰).
// SSOT: contracts/ReactionWheel.md · API-SURFACE (send-viewer-reaction 계열, actor/host 용).
// ponytail: 서버 rate-limit(토큰버킷/KV)는 후속 — 현재는 클라 5/s 쓰로틀. 검열/allowlist 도 후속.
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; emoji?: unknown; idempotency_key?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, emoji, idempotency_key } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (typeof emoji !== "string" || emoji.length < 1 || emoji.length > 20) {
    return json({ error: "Invalid emoji" }, 400);
  }
  // rid = 수신측 dedupe 키. 클라가 idempotency_key 로 넘기면 재사용, 없으면 서버 생성.
  const rid = typeof idempotency_key === "string" && idempotency_key.length > 0 && idempotency_key.length <= 64
    ? idempotency_key
    : crypto.randomUUID();

  // 방 존재 + 종료 아님
  const { data: room } = await user.service
    .from("rooms").select("id, status").eq("id", room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);

  // 멤버십: 호출자가 활성 참가자여야 broadcast 가능(URL 해킹·비참가자 차단)
  const { data: part } = await user.service
    .from("room_participants").select("id")
    .eq("room_id", room_id).eq("user_id", user.userId).neq("state", "left")
    .maybeSingle();
  if (!part) return json({ error: "Not a participant" }, 403);

  // 방 전체 broadcast(reliable). sender=auth uid(=LiveKit identity, 서버 확정) → 수신측 신뢰.
  // 발신자 본인도 수신 → 클라가 로컬 self-echo 를 rid 로 dedupe.
  const payload = new TextEncoder().encode(JSON.stringify({ emoji, rid, sender: user.authId }));
  try {
    await broadcastData(String(room_id), payload, "reaction");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    return json({ error: "Broadcast failed" }, 502);
  }
  return json({ ok: true }, 200);
});
