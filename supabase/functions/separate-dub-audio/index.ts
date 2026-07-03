// separate-dub-audio: fal.ai Demucs 로 원어 대사(vocals) 제거 → 비보컬 배경 스템 URL 반환(호스트 전용).
// SSOT: docs/state-machines/DubSession.md, docs/contracts/DubCompositor.md, GAP G-280.
// 입력: { dub_session_id }  출력: { dub_session_id, background_urls: string[], stem_count }
//
// 설계: 분리는 합성의 중간 단계 — DB 상태 변경 없는 순수 컴퓨트. fal 결과 URL 을 클라가 즉시
//   다운로드→mixAndMux background 로 amix. 원본 vocals(원어 대사)는 드롭 → 이중음성 없음.
// 보안: FAL_KEY 는 Edge 런타임 시크릿(클라/VITE 노출 금지·성역). 호스트만 호출(크레딧 보호).
// ponytail: MVP 동기 호출(짧은 클립 전제). 긴 클립은 fal 큐/웹훅·스템 Storage 캐시(재과금 방지)가 후속.
//   노래 보컬도 vocals 로 제거됨(Demucs 한계) → 대사특화 AudioShake 승급은 [[dub-audio-separation-anime]].

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

const FAL_URL = "https://fal.run/fal-ai/demucs";
const TIMEOUT_MS = 140_000;
// htdemucs_6s 스템 중 vocals 를 제외한 전부(서로 disjoint → 합치면 배경음 원복).
const NON_VOCAL = ["drums", "bass", "other", "guitar", "piano"] as const;

interface FalStem { url?: string }

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

  const apiKey = Deno.env.get("FAL_KEY");
  if (!apiKey) return json({ error: "음원분리 미설정(FAL_KEY)" }, 500);

  // 세션 + 호스트 검증(크레딧 보호), 소스 존재 필수.
  const { data: sess } = await service
    .from("dub_sessions")
    .select("id, source_video_url, status, rooms(host_id)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);
  const room = sess.rooms as unknown as { host_id: string };
  if (room.host_id !== userId) return json({ error: "호스트만 음원분리를 할 수 있어요." }, 403);
  if (!sess.source_video_url) return json({ error: "소스가 없어요." }, 409);

  // 소스 signed URL(fal 이 fetch). fal Demucs 는 mp4 도 직접 수용(실증).
  const { data: signed, error: sErr } = await service.storage
    .from("dub-assets").createSignedUrl(sess.source_video_url, 600);
  if (sErr || !signed) return json({ error: "소스 URL 생성 실패" }, 500);

  // fal Demucs 동기 호출(140s 타임아웃).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(FAL_URL, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: signed.signedUrl }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return json({ error: "음원분리 실패", detail: detail.slice(0, 300) }, 502);
    }
    const result = await resp.json() as Record<string, FalStem>;
    const background_urls = NON_VOCAL
      .map((k) => result[k]?.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    if (background_urls.length === 0) return json({ error: "배경 스템이 비어 있어요." }, 502);

    return json({ dub_session_id: sessionId, background_urls, stem_count: background_urls.length }, 200);
  } catch (e) {
    clearTimeout(timer);
    const reason = e instanceof Error && e.name === "AbortError" ? "demucs_timeout" : "demucs_exception";
    return json({ error: "음원분리 실패", reason }, 504);
  }
});
