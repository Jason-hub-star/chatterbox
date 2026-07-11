// supabase/functions/create-report/index.ts
// V-2 신고(reporting-logging-feedback.md §16.1) — 운영 검토 큐 INSERT + audit_logs 'report_created'.
// 대상: reported_user_id 또는 message_id — 메시지 신고는 발신자·본문 스냅샷을 서버가 확정(30일 purge 대비).
// rate limit: 3/분 + 20/시(reporter 기준, 유효 요청만 계수).
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";

const REASONS = ["abuse", "sexual", "spam", "privacy", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: {
    room_id?: unknown; reported_user_id?: unknown; message_id?: unknown;
    reason?: unknown; description?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, reported_user_id, message_id, reason, description } = body;
  if (typeof reason !== "string" || !REASONS.includes(reason)) return json({ error: "Invalid reason" }, 400);
  if (description !== undefined && (typeof description !== "string" || description.length > 500)) {
    return json({ error: "Invalid description" }, 400);
  }
  if (room_id !== undefined && !isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (reported_user_id === undefined && message_id === undefined) return json({ error: "No target" }, 400);

  let targetUserId: string;
  let roomId: string | null = (room_id as string | undefined) ?? null;
  let messageText: string | null = null;
  if (message_id !== undefined) {
    if (!isUuid(message_id)) return json({ error: "Invalid message_id" }, 400);
    const { data: msg } = await user.service
      .from("messages").select("id, room_id, user_id, text").eq("id", message_id).maybeSingle();
    if (!msg) return json({ error: "Message not found" }, 404);
    targetUserId = msg.user_id as string;
    roomId = msg.room_id as string;
    messageText = msg.text as string;
  } else {
    if (!isUuid(reported_user_id)) return json({ error: "Invalid reported_user_id" }, 400);
    const { data: u } = await user.service.from("users").select("id").eq("id", reported_user_id).maybeSingle();
    if (!u) return json({ error: "User not found" }, 404);
    targetUserId = reported_user_id as string;
  }
  if (targetUserId === user.userId) return json({ error: "Cannot report yourself" }, 400);

  const { data: rl1 } = await user.service.rpc("check_rate_limit", { p_key: `report:${user.userId}`, p_max: 3, p_window_sec: 60 });
  if (rl1 === false) return json({ error: "Too many reports" }, 429);
  const { data: rl2 } = await user.service.rpc("check_rate_limit", { p_key: `report-h:${user.userId}`, p_max: 20, p_window_sec: 3600 });
  if (rl2 === false) return json({ error: "Too many reports" }, 429);

  const { data: row, error } = await user.service.from("moderation_reports").insert({
    reporter_user_id: user.userId,
    room_id: roomId,
    reported_user_id: targetUserId,
    message_id: (message_id as string | undefined) ?? null,
    message_text: messageText,
    reason,
    description: (description as string | undefined) ?? null,
  }).select("id").single();
  if (error || !row) return json({ error: "Insert failed" }, 500);

  await user.service.from("audit_logs").insert({
    event_type: "report_created",
    actor_user_id: user.userId,
    room_id: roomId,
    target_id: row.id,
    meta: { reason, reported_user_id: targetUserId, message_id: (message_id as string | undefined) ?? null },
  });
  return json({ ok: true, id: row.id }, 200);
});
