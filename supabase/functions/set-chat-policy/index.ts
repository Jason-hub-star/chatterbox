// supabase/functions/set-chat-policy/index.ts
// HOST-09 슬로우모드·HOST-10 금칙어 — rooms 정책 컬럼 UPDATE(호스트 전용). 강제는 send-chat 이 수행.
import { getAppUser, json, isUuid, cors, requireHostRoom } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; slow_mode_sec?: unknown; banned_words?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);

  const updates: Record<string, unknown> = {};
  if (body.slow_mode_sec !== undefined) {
    const v = body.slow_mode_sec;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 600) {
      return json({ error: "Invalid slow_mode_sec" }, 400);
    }
    updates.chat_slow_mode_sec = v;
  }
  if (body.banned_words !== undefined) {
    const w = body.banned_words;
    if (
      !Array.isArray(w) || w.length > 50 ||
      w.some((x) => typeof x !== "string" || x.trim().length === 0 || x.trim().length > 30)
    ) {
      return json({ error: "Invalid banned_words" }, 400);
    }
    updates.chat_banned_words = w.map((x) => (x as string).trim());
  }
  if (Object.keys(updates).length === 0) return json({ error: "No fields" }, 400);

  const gate = await requireHostRoom(user.service, room_id, user.userId);
  if (!gate.ok) return gate.res;

  const { data: updated, error } = await user.service
    .from("rooms").update(updates).eq("id", room_id)
    .select("chat_slow_mode_sec, chat_banned_words").single();
  if (error || !updated) return json({ error: "Update failed" }, 500);
  return json({
    ok: true,
    chat_slow_mode_sec: updated.chat_slow_mode_sec,
    chat_banned_words: updated.chat_banned_words,
  }, 200);
});
