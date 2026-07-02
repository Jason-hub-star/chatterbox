// start-dub-transcription: OpenAI Whisper STT 호출(호스트 전용).
// SSOT: docs/state-machines/DubSession.md (UPLOADED→TRANSCRIBING→READY/FAILED, C6 롤백),
//       docs/specs/MediaConfig.md §4
// 입력: { dub_session_id }  출력: { dub_session_id, status }
//
// 오푸스 검토 교정: whisper-1 은 화자분리(diarization) 불가 → segments 만 추출, speaker 필드 없음.
//   화자는 assign-dub-roles 에서 호스트가 수동 배정한다.
// 검토 교정: response_format='verbose_json'(구조화 segments). srt 는 tokens/타임코드 파싱 필요라 배제.
// ponytail: MVP 는 동기 호출(작은 파일 전제). 재시도(≤2)·pg_cron 자동타임아웃은 후속.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const TIMEOUT_MS = 120_000;

interface WhisperSegment { id: number; start: number; end: number; text: string }

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
  const sessionId = body.dub_session_id;

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "STT 미설정(OPENAI_API_KEY)" }, 500);

  // 세션 + 방 언어 조회, 호스트 전용, status='uploaded' 만 시작 가능
  const { data: sess } = await service
    .from("dub_sessions")
    .select("id, room_id, created_by, source_video_url, status, rooms(host_id, language)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);
  const room = sess.rooms as unknown as { host_id: string; language: string | null };
  if (room.host_id !== userId) return json({ error: "호스트만 STT 를 시작할 수 있어요." }, 403);
  if (sess.status !== "uploaded") return json({ error: `현재 상태(${sess.status})에선 STT 불가` }, 409);

  // TRANSCRIBING 진입
  await service.from("dub_sessions").update({ status: "transcribing", error_message: null }).eq("id", sessionId);

  // 소스 다운로드(service_role)
  const { data: blob, error: dErr } = await service.storage.from("dub-assets").download(sess.source_video_url);
  if (dErr || !blob) {
    await service.from("dub_sessions").update({ status: "failed", error_message: "source_download_error" }).eq("id", sessionId);
    return json({ error: "소스 다운로드 실패" }, 500);
  }

  // Whisper 호출(verbose_json, 120s 타임아웃)
  const fd = new FormData();
  fd.append("file", blob, sess.source_video_url.split("/").pop() ?? "audio.mp4");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("language", room.language ?? "ko");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      await service.from("dub_sessions").update({ status: "failed", error_message: "whisper_api_error" }).eq("id", sessionId);
      return json({ error: "STT 실패", detail: detail.slice(0, 300) }, 502);
    }
    const result = await resp.json() as { segments?: WhisperSegment[] };
    const segments = (result.segments ?? []).map((s) => ({
      id: s.id,
      start_ms: Math.round(s.start * 1000),
      end_ms: Math.round(s.end * 1000),
      text: s.text.trim(),
    }));

    await service
      .from("dub_sessions")
      .update({ status: "ready", diarization_result_json: { segments } })
      .eq("id", sessionId);

    return json({ dub_session_id: sessionId, status: "ready", segment_count: segments.length }, 200);
  } catch (e) {
    clearTimeout(timer);
    const reason = e instanceof Error && e.name === "AbortError" ? "whisper_timeout" : "whisper_exception";
    // C6 롤백: source_video_url 유지, diarization 미저장
    await service.from("dub_sessions").update({ status: "failed", error_message: reason }).eq("id", sessionId);
    return json({ error: "STT 실패", reason }, 504);
  }
});
