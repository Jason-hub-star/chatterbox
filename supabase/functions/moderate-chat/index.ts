// supabase/functions/moderate-chat/index.ts
// HOST-11 채팅 숨김/클리어 — hard delete 금지(contracts/ChatPanel.md) → status='hidden' soft delete
// + audit_logs 기록(운영 숨김 감사 필수) + 'chat-mod' broadcast(전 클라 라이브 반영, 호스트 포함).
// broadcast 실패는 비치명(영속 진실=messages.status — 늦입장·새로고침 백필이 걸러줌) → ok:true 유지.
import { getAppUser, json, isUuid, cors, requireHostRoom } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; action?: unknown; message_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, action } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (action !== "hide" && action !== "clear") return json({ error: "Invalid action" }, 400);

  const gate = await requireHostRoom(user.service, room_id, user.userId);
  if (!gate.ok) return gate.res;

  let hiddenIds: string[] = [];
  if (action === "hide") {
    if (!isUuid(body.message_id)) return json({ error: "Invalid message_id" }, 400);
    const { data } = await user.service
      .from("messages")
      .update({ status: "hidden", hidden_reason: "host_hide", hidden_at: new Date().toISOString() })
      .eq("id", body.message_id).eq("room_id", room_id).eq("status", "visible")
      .select("id");
    if (!data || data.length === 0) return json({ error: "Message not found" }, 404);
    hiddenIds = data.map((r) => r.id as string);
  } else {
    const { data } = await user.service
      .from("messages")
      .update({ status: "hidden", hidden_reason: "host_clear", hidden_at: new Date().toISOString() })
      .eq("room_id", room_id).eq("status", "visible").eq("message_type", "chat")
      .select("id");
    hiddenIds = (data ?? []).map((r) => r.id as string);
  }

  // 운영 감사(ChatPanel.md:105) — service_role 전용 테이블(클라 정책 0).
  await user.service.from("audit_logs").insert({
    event_type: action === "hide" ? "chat_message_hidden" : "chat_cleared",
    actor_user_id: user.userId,
    room_id,
    target_id: action === "hide" ? String(body.message_id) : null,
    meta: { count: hiddenIds.length },
  });

  let broadcast = true;
  try {
    await broadcastData(
      String(room_id),
      new TextEncoder().encode(JSON.stringify(
        action === "clear" ? { type: "clear" } : { type: "hide", ids: hiddenIds },
      )),
      "chat-mod",
    );
  } catch (e) {
    broadcast = false;
    console.error("chat-mod broadcast failed:", e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true, hidden: hiddenIds.length, broadcast }, 200);
});
