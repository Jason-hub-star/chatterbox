// supabase/functions/set-poll-status/index.ts
// 관객 투표 전이(ROOM-22) — 호스트 전용. reveal: poll_responses 집계를 polls.counts 로 스냅샷 후
// poll_reveal broadcast(그때만 percent 공개, MobileViewer §4.2) / close: poll_close broadcast.
// FSM: open→revealed→closed, open→closed 직행 허용. 같은 상태 재요청은 200 멱등(더블클릭 무해).
// broadcast 실패는 로그만 — DB 가 진실이고 늦입장/재입장 RLS fetch 로 수렴(create-poll 과 달리 롤백이
// 더 위험: reveal 롤백은 이미 본 사람과 desync).
import { cors, getAppUser, isUuid, json, requireHostRoom } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; poll_id?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, poll_id, status } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (!isUuid(poll_id)) return json({ error: "Invalid poll_id" }, 400);
  if (status !== "revealed" && status !== "closed") return json({ error: "Invalid status" }, 400);

  const host = await requireHostRoom(user.service, room_id, user.userId);
  if (!host.ok) return host.res;

  const { data: poll } = await user.service
    .from("polls")
    .select("id, status, options")
    .eq("id", poll_id)
    .eq("room_id", room_id)
    .maybeSingle();
  if (!poll) return json({ error: "Poll not found" }, 404);
  if (poll.status === status) return json({ ok: true }, 200);
  if (poll.status === "closed") return json({ error: "Poll closed" }, 409);
  // revealed → revealed 는 위 멱등 분기, revealed → closed 만 남음. open → 둘 다 허용.
  if (poll.status === "revealed" && status !== "closed") return json({ error: "Invalid transition" }, 409);

  if (status === "revealed") {
    const { data: rows, error: aggErr } = await user.service
      .from("poll_responses")
      .select("choice_index")
      .eq("poll_id", poll_id);
    if (aggErr) return json({ error: "Aggregate failed" }, 500);
    const counts = (poll.options as unknown[]).map(() => 0);
    for (const r of rows ?? []) {
      if (typeof r.choice_index === "number" && r.choice_index >= 0 && r.choice_index < counts.length) {
        counts[r.choice_index] += 1;
      }
    }
    const totalVotes = rows?.length ?? 0;
    const { error: upErr } = await user.service
      .from("polls")
      .update({ status: "revealed", counts })
      .eq("id", poll_id)
      .eq("status", "open"); // 경쟁 시(더블 reveal) 한쪽만 적용 — 나머진 무해(같은 스냅샷)
    if (upErr) return json({ error: "Update failed" }, 500);

    const payload = new TextEncoder().encode(JSON.stringify({
      type: "poll_reveal",
      poll_id,
      counts,
      total_votes: totalVotes,
    }));
    try {
      await broadcastData(String(room_id), payload, "poll");
    } catch (e) {
      console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    }
    return json({ ok: true, counts, total_votes: totalVotes }, 200);
  }

  const { error: closeErr } = await user.service
    .from("polls")
    .update({ status: "closed" })
    .eq("id", poll_id);
  if (closeErr) return json({ error: "Update failed" }, 500);
  const payload = new TextEncoder().encode(JSON.stringify({ type: "poll_close", poll_id }));
  try {
    await broadcastData(String(room_id), payload, "poll");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true }, 200);
});
