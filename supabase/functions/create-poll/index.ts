// supabase/functions/create-poll/index.ts
// 관객 투표 생성(ROOM-22) — 호스트 전용. polls INSERT(방당 활성 1개) 후 'poll' 토픽 poll_open 서버 broadcast.
// SSOT: DATA-SCHEMA §1.25 · MobileViewer §4.2 (질문 ≤200자·선택지 2~4개 각 ≤24자·중간 결과 비공개).
import { cors, getAppUser, isUuid, json, requireHostRoom } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; question?: unknown; options?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 1 || question.length > 200) return json({ error: "Invalid question" }, 400);
  if (!Array.isArray(body.options)) return json({ error: "Invalid options" }, 400);
  const options = body.options.map((o) => (typeof o === "string" ? o.trim() : ""));
  if (options.length < 2 || options.length > 4 || options.some((o) => o.length < 1 || o.length > 24)) {
    return json({ error: "Invalid options" }, 400);
  }

  const host = await requireHostRoom(user.service, room_id, user.userId);
  if (!host.ok) return host.res;

  const { data: poll, error: insErr } = await user.service
    .from("polls")
    .insert({ room_id, created_by: user.userId, question, options })
    .select("id")
    .single();
  if (insErr || !poll) {
    // 부분 unique 인덱스(polls_one_active_per_room) 위반 = 이미 활성 폴 존재.
    if (insErr?.code === "23505") return json({ error: "Poll already active" }, 409);
    console.error("poll insert failed:", insErr?.message);
    return json({ error: "Insert failed" }, 500);
  }

  // 라이브 동기가 기능의 본체 — broadcast 실패 시 반쪽 상태(생성됐는데 아무도 모름)를 남기지 않고
  // 롤백 후 502(호스트 재시도). 늦입장은 RLS fetch 로 수렴하지만 생성 순간의 전파는 릴레이가 유일.
  const payload = new TextEncoder().encode(JSON.stringify({
    type: "poll_open",
    poll: { id: poll.id, question, options },
  }));
  try {
    await broadcastData(String(room_id), payload, "poll");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    await user.service.from("polls").delete().eq("id", poll.id);
    return json({ error: "Broadcast failed" }, 502);
  }
  return json({ poll_id: poll.id }, 200);
});
