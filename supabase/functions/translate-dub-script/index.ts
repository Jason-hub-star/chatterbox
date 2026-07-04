// translate-dub-script: STT 대본 세그먼트 JP/EN → KR 자동 번역(호스트 전용).
// SSOT: docs/API-SURFACE.md · docs/state-machines/DubSession.md
// 입력: { dub_session_id }  출력: { dub_session_id, translated_count, skipped_count, skipped? }
//
// 설계:
//  - 트리거: 호스트 수동, status='ready'(역할배정 전/후 무관). STT(start-dub-transcription)는 무수정 → 회귀 0.
//  - 원문 언어 = rooms.language(start-dub-transcription 과 동일 소스). 'ko' 면 스킵(번역 불필요).
//  - 엔진 gpt-4o-mini. 세그먼트 배열 1콜 JSON in/out. 파싱/개수 불일치 시 502(원문 유지 — 파이프라인 진행 가능).
//  - 저장(주): dub_sessions.diarization_result_json.segments[].translated_text.
//    저장(부): dub_tracks 이미 있으면 start_time_ms 매칭으로 translated_text 업데이트(역할배정 후 번역 케이스).
//  - 쓰기 service_role. OPENAI_API_KEY 서버 시크릿(클라 노출 금지·성역).

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

interface Segment { id: number; start_ms: number; end_ms: number; text: string; translated_text?: string }

async function translateBatch(texts: string[], sourceLang: string, apiKey: string): Promise<string[]> {
  const sys =
    `You are a professional video dubbing translator. Translate each line from ${sourceLang} into natural, concise Korean dubbing dialogue. ` +
    `Keep each translation close to the original length, preserve the tone (formal vs casual). ` +
    `Return ONLY a JSON object {"lines": ["...", ...]} with the SAME count and order as the input. No commentary.`;
  const user = JSON.stringify({ lines: texts });
  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });
  if (!resp.ok) throw new Error(`openai ${resp.status}`);
  const d = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = JSON.parse(d.choices?.[0]?.message?.content ?? "{}") as { lines?: unknown };
  const lines = Array.isArray(parsed.lines) ? parsed.lines.map(String) : [];
  if (lines.length !== texts.length) throw new Error(`count mismatch ${lines.length}/${texts.length}`);
  return lines;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_session_id?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isUuid(body.dub_session_id)) return json({ error: "Invalid dub_session_id" }, 400);
  const sessionId = body.dub_session_id;

  const { data: sess } = await service
    .from("dub_sessions")
    .select("id, status, diarization_result_json, rooms(host_id, language)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);
  const room = sess.rooms as unknown as { host_id: string; language: string | null };
  if (room.host_id !== userId) return json({ error: "호스트만 번역할 수 있어요." }, 403);
  if (sess.status !== "ready") return json({ error: `현재 상태(${sess.status})에선 번역 불가` }, 409);

  const segments: Segment[] = (sess.diarization_result_json?.segments ?? []);
  if (segments.length === 0) return json({ error: "번역할 대본이 없어요." }, 400);

  // 원문이 한국어면 스킵(번역 불필요, 무과금)
  const sourceLang = (room.language ?? "ko").toLowerCase();
  if (sourceLang === "ko") {
    return json({ dub_session_id: sessionId, translated_count: 0, skipped_count: segments.length, skipped: true }, 200);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "번역 미설정(OPENAI_API_KEY)" }, 500);

  let translations: string[];
  try {
    translations = await translateBatch(segments.map((s) => s.text), sourceLang, apiKey);
  } catch (e) {
    return json({ error: "번역 실패", detail: String(e).slice(0, 200) }, 502);
  }

  const translated = segments.map((s, i) => ({ ...s, translated_text: translations[i] }));

  // 주 저장: diarization_result_json.segments 갱신
  const newJson = { ...(sess.diarization_result_json ?? {}), segments: translated };
  const { error: uErr } = await service.from("dub_sessions").update({ diarization_result_json: newJson }).eq("id", sessionId);
  if (uErr) return json({ error: "저장 실패", detail: uErr.message }, 500);

  // 부 저장: 역할배정이 이미 됐으면 dub_tracks 에도 복사(start_time_ms 매칭)
  const { data: tracks } = await service.from("dub_tracks").select("id, start_time_ms").eq("dub_session_id", sessionId);
  if (tracks && tracks.length > 0) {
    const byStart = new Map(translated.map((s) => [s.start_ms, s.translated_text]));
    for (const t of tracks) {
      const tt = byStart.get(t.start_time_ms);
      if (tt !== undefined) await service.from("dub_tracks").update({ translated_text: tt }).eq("id", t.id);
    }
  }

  return json({ dub_session_id: sessionId, translated_count: translated.length, skipped_count: 0 }, 200);
});
