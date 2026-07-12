// supabase/functions/submit-viewer-poll/index.ts
// 관객 투표 제출(ROOM-22) — 활성 참가자 전 롤(viewer 포함, "viewer 도 참여"가 스펙 취지).
// upsert(poll_id,user_id PK) = 1인 1표 멱등 + open 동안 선택 변경 허용. idempotency_key 는 계약상
// 받되 PK 가 이미 멱등을 보장하므로 미사용. 'poll' 토픽으로 총계만 broadcast(선택지별 중간 결과
// 비공개 — percent 는 호스트 reveal 시에만, MobileViewer §4.2).
// SSOT: API-SURFACE Mobile Viewer APIs · DATA-SCHEMA §1.25.
import { cors, getAppUser, isUuid, json } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; poll_id?: unknown; choice_index?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, poll_id, choice_index } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (!isUuid(poll_id)) return json({ error: "Invalid poll_id" }, 400);
  if (typeof choice_index !== "number" || !Number.isInteger(choice_index) || choice_index < 0 || choice_index > 3) {
    return json({ error: "Invalid choice_index" }, 400);
  }

  // 방 존재 + 종료 아님 + 활성 참가자(send-reaction 동형 — viewer 도 room_participants 행 보유)
  const { data: room } = await user.service
    .from("rooms").select("id, status").eq("id", room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  const { data: part } = await user.service
    .from("room_participants").select("id")
    .eq("room_id", room_id).eq("user_id", user.userId).neq("state", "left")
    .maybeSingle();
  if (!part) return json({ error: "Not a participant" }, 403);

  const { data: poll } = await user.service
    .from("polls")
    .select("id, status, options")
    .eq("id", poll_id)
    .eq("room_id", room_id)
    .maybeSingle();
  if (!poll) return json({ error: "Poll not found" }, 404);
  if (poll.status !== "open") return json({ error: "Poll not open" }, 409);
  if (choice_index >= (poll.options as unknown[]).length) return json({ error: "Invalid choice_index" }, 400);

  // 레이트리밋: 10/분 — 선택 변경(재제출)은 허용하되 broadcast 폭탄은 차단.
  const { data: rlOk } = await user.service.rpc("check_rate_limit", {
    p_key: `poll:${user.userId}`,
    p_max: 10,
    p_window_sec: 60,
  });
  if (rlOk === false) return json({ error: "Too many votes" }, 429);

  const { error: upErr } = await user.service
    .from("poll_responses")
    .upsert({ poll_id, user_id: user.userId, choice_index }, { onConflict: "poll_id,user_id" });
  if (upErr) {
    console.error("poll_responses upsert failed:", upErr.message);
    return json({ error: "Vote failed" }, 500);
  }

  const { count } = await user.service
    .from("poll_responses")
    .select("*", { count: "exact", head: true })
    .eq("poll_id", poll_id);
  const totalVotes = count ?? 0;

  // 총계 broadcast 는 부가 정보 — 실패해도 표는 저장됐으므로 200(다음 표/reveal 에서 수렴).
  const payload = new TextEncoder().encode(JSON.stringify({
    type: "poll_vote",
    poll_id,
    total_votes: totalVotes,
  }));
  try {
    await broadcastData(String(room_id), payload, "poll");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true, total_votes: totalVotes }, 200);
});
