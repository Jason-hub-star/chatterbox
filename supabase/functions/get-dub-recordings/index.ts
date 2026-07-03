// get-dub-recordings: 세션의 synced 트랙 녹음들 signed URL 일괄 발급(방 멤버 — 호스트가 합성용 다운로드).
// SSOT: docs/contracts/DubCompositor.md §3 (합성 입력), get-dub-source-url 패턴
// 입력: { dub_session_id }  출력: { recordings: [{ track_id, start_time_ms, url }] }

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { presignGet } from "../_shared/r2.ts";

const TTL_SEC = 3600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_session_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.dub_session_id)) return json({ error: "Invalid dub_session_id" }, 400);

  const { data: sess } = await service
    .from("dub_sessions")
    .select("room_id")
    .eq("id", body.dub_session_id)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);

  // 방 멤버만
  const { data: me } = await service
    .from("room_participants")
    .select("id")
    .eq("room_id", sess.room_id)
    .eq("user_id", userId)
    .neq("state", "left")
    .maybeSingle();
  if (!me) return json({ error: "방 참가자만 볼 수 있어요." }, 403);

  const { data: tracks } = await service
    .from("dub_tracks")
    .select("id, start_time_ms, recording_url, status")
    .eq("dub_session_id", body.dub_session_id)
    .eq("status", "synced")
    .order("start_time_ms", { ascending: true });

  const recordings: Array<{ track_id: string; start_time_ms: number; url: string }> = [];
  // presignGet 은 로컬 HMAC 계산이라 실패=전역 설정 문제 → skip(은폐) 대신 전파.
  // 부분 발급으로 합성 입력(트랙)이 조용히 누락되는 걸 막는다.
  for (const t of tracks ?? []) {
    if (!t.recording_url) continue;
    const url = await presignGet(t.recording_url, TTL_SEC);
    recordings.push({ track_id: t.id, start_time_ms: t.start_time_ms, url });
  }

  return json({ recordings }, 200);
});
