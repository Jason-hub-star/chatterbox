// get-dub-recordings: 세션의 트랙 녹음들 signed URL 일괄 발급(방 활성 멤버).
// 용도 2: 호스트 합성 다운로드(DubCompositor §3) + 누적 시사회(G9-P3 — 각 멤버가 자기 브라우저에서 스케줄 재생).
// 게이트: 호스트 전용 → 방 활성 멤버로 완화(주인님 승인 2026-07-17 — 더빙 멤버는 동의한 협업자,
//   대상도 synced → submitted+synced 포함해 제출 직후 트랙이 시사회에 바로 반영).
// SSOT: docs/contracts/DubCompositor.md §3, get-dub-source-url 패턴
// 입력: { dub_session_id }  출력: { recordings: [{ track_id, start_time_ms, calibration_offset_ms, url }] }

import { cors, json, getAppUser, isUuid, isActiveParticipant } from "../_shared/supa.ts";
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

  // 방 활성 멤버(강퇴자 제외) — 시사회는 방 구성원 전원의 경험, 합성 다운로드(호스트)도 포함 게이트.
  if (!(await isActiveParticipant(service, sess.room_id, userId))) {
    return json({ error: "더빙 방 참가자만 내려받을 수 있어요." }, 403);
  }

  const { data: tracks } = await service
    .from("dub_tracks")
    .select("id, start_time_ms, calibration_offset_ms, recording_url, status")
    .eq("dub_session_id", body.dub_session_id)
    .in("status", ["submitted", "synced"])
    .order("start_time_ms", { ascending: true });

  const recordings: Array<{ track_id: string; start_time_ms: number; calibration_offset_ms: number; url: string }> = [];
  // presignGet 은 로컬 HMAC 계산이라 실패=전역 설정 문제 → skip(은폐) 대신 전파.
  // 부분 발급으로 합성 입력(트랙)이 조용히 누락되는 걸 막는다.
  for (const t of tracks ?? []) {
    if (!t.recording_url) continue;
    const url = await presignGet(t.recording_url, TTL_SEC);
    recordings.push({
      track_id: t.id,
      start_time_ms: t.start_time_ms,
      calibration_offset_ms: (t.calibration_offset_ms as number | null) ?? 0,
      url,
    });
  }

  return json({ recordings }, 200);
});
