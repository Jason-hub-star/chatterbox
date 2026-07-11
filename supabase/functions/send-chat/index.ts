// supabase/functions/send-chat/index.ts
// 채팅 서버 릴레이(contracts/ChatPanel.md · SecurityPolicies §6.4.2) — 클라 직발행 대신 서버가
// sanitize·멤버십·rate-limit 검증 후 messages 에 영속(INSERT) + 방 전체 broadcast.
// 왜(send-reaction 과 동일): 클라 직접 publishData 는 sender 스푸핑 가능 + datachannel 개설지연 첫 메시지 유실.
//   수신측은 participant=undefined 인 '서버발'만 수락, sender/sender_name 은 payload(서버 확정) 신뢰.
// slow mode(HOST-09)·금칙어(HOST-10)는 rooms 정책 컬럼(set-chat-policy)으로 여기서 강제. ponytail: note 영속(ROOM-17)은 후속.
// broadcast 실패 시 INSERT 를 보상 삭제 후 502 — "성공=영속+전달" 원자 유지(재시도해도 중복 행 없음).
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

const MAX_MESSAGE_LENGTH = 500;
const ALLOWED_URL_PROTOCOLS = ["https:", "mailto:"];

// 서버측 sanitize — 클라(src/lib/chatSanitize.ts)와 동일 규칙(§6.4.1). 클라는 UX용 1차, 여기가 진짜 게이트.
function sanitizeChatInput(raw: string): { ok: true; text: string } | { ok: false; reason: string } {
  if (raw.length === 0) return { ok: false, reason: "empty" };
  if (raw.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: "too_long" };
  // deno-lint-ignore no-control-regex
  const text = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  const found = text.match(/https?:\/\/[^\s]+/gi) ?? [];
  for (const url of found) {
    try {
      const parsed = new URL(url);
      if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
        return { ok: false, reason: `blocked_protocol:${parsed.protocol}` };
      }
    } catch {
      return { ok: false, reason: "invalid_url" };
    }
  }
  if (/<\s*(script|iframe|object|embed|form|input|button|svg|math)/i.test(text)) {
    return { ok: false, reason: "html_tag_blocked" };
  }
  if (text.trim().length === 0) return { ok: false, reason: "empty" };
  return { ok: true, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; text?: unknown; rid?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, text } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (typeof text !== "string") return json({ error: "Invalid text" }, 400);
  const check = sanitizeChatInput(text.trim());
  if (!check.ok) return json({ error: `Blocked: ${check.reason}` }, 400);
  // rid = 수신측 self-echo dedupe 키(reaction 과 동형). 클라가 넘기면 재사용, 없으면 서버 생성.
  const rid = typeof body.rid === "string" && body.rid.length > 0 && body.rid.length <= 64
    ? body.rid
    : crypto.randomUUID();

  // 방 존재 + 종료 아님
  const { data: room } = await user.service
    .from("rooms").select("id, status, host_id, chat_slow_mode_sec, chat_banned_words").eq("id", room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);

  // 멤버십: 활성 참가자(뷰어 포함)만 발언 가능(URL 해킹·비참가자 차단)
  const { data: part } = await user.service
    .from("room_participants").select("id")
    .eq("room_id", room_id).eq("user_id", user.userId).neq("state", "left")
    .maybeSingle();
  if (!part) return json({ error: "Not a participant" }, 403);

  // 금칙어(HOST-10): 방별 목록 — 대소문자 무시 부분일치. sanitize 통과 텍스트 기준.
  const banned = (room.chat_banned_words ?? []) as string[];
  if (banned.length > 0) {
    const lower = check.text.toLowerCase();
    if (banned.some((w) => w && lower.includes(w.toLowerCase()))) {
      return json({ error: "banned_word" }, 400);
    }
  }

  // 슬로우모드(HOST-09): 호스트 면제 — check_rate_limit 원자 재사용(slow 창에 1회).
  const slowSec = (room.chat_slow_mode_sec ?? 0) as number;
  if (slowSec > 0 && room.host_id !== user.userId) {
    const { data: slowOk } = await user.service.rpc("check_rate_limit", {
      p_key: `chat-slow:${room_id}:${user.userId}`,
      p_max: 1,
      p_window_sec: slowSec,
    });
    if (slowOk === false) return json({ error: "slow_mode" }, 429);
  }

  // 레이트리밋: 사용자당 20회/분 — 도배·봇 서버측 캡(클라 UX 쓰로틀과 별개 백스톱).
  const { data: rlOk } = await user.service.rpc("check_rate_limit", { p_key: `chat:${user.userId}`, p_max: 20, p_window_sec: 60 });
  if (rlOk === false) return json({ error: "메시지가 너무 빨라요." }, 429);

  // 발신 시점 표시명(비정규화 저장 + broadcast payload — 수신측이 participant 없이도 렌더).
  const { data: profile } = await user.service
    .from("users").select("display_name").eq("id", user.userId).single();
  const senderName = profile?.display_name ?? null;

  // 영속(늦입장 히스토리) → broadcast(라이브 전달). service_role INSERT — 클라 직접 INSERT 는 RLS deny.
  const { data: row, error: insErr } = await user.service
    .from("messages")
    .insert({
      room_id,
      user_id: user.userId,
      sender_auth_id: user.authId,
      sender_name: senderName,
      text: check.text,
    })
    .select("id, created_at")
    .single();
  if (insErr || !row) {
    console.error("messages insert failed:", insErr?.message);
    return json({ error: "Persist failed" }, 500);
  }

  const payload = new TextEncoder().encode(JSON.stringify({
    id: row.id,
    text: check.text,
    sender: user.authId,
    sender_name: senderName,
    ts: new Date(row.created_at).getTime(),
    rid,
  }));
  try {
    await broadcastData(String(room_id), payload, "chat");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    // 보상 삭제: 아무도 못 받은 메시지를 히스토리에 남기지 않는다 → 클라 재시도가 중복 행을 안 만든다.
    await user.service.from("messages").delete().eq("id", row.id);
    return json({ error: "Broadcast failed" }, 502);
  }
  return json({ ok: true, id: row.id }, 200);
});
