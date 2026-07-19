// separate-dub-audio: fal.ai Demucs 로 기존 대사(vocals) 제거 → 비보컬 배경 스템 URL 반환.
// SSOT: docs/state-machines/DubSession.md, docs/contracts/DubCompositor.md, GAP G-280, GOAL-dub-showcase(S1).
// 입력: { dub_session_id }  출력: { dub_session_id, background_urls: string[], stem_count, cached? }
//
// 설계: 분리는 DB 상태 변경 없는 순수 컴퓨트. fal 결과 URL 을 클라가 다운로드→베드 재생/mixAndMux amix.
// S1 스템 버킷 캐시(재과금 소멸·마이그 0): 결과를 R2 `<room>/stems/<sessionId>/bg-N.*` 로 복사하고
//   manifest.json 에 키 목록 — 재호출은 매니페스트 히트 시 fal 스킵. 캐시 실패는 비치명(fal URL 폴백).
// 권한 2단: 호스트 = fal 호출 가능(크레딧 보호·레이트리밋은 캐시 미스에만 계수) /
//   활성 멤버 = 캐시-전용(있으면 반환·없으면 404 — 베드는 전원이 들어야 해서 읽기만 개방).
// 보안: FAL_KEY 는 Edge 런타임 시크릿(클라/VITE 노출 금지·성역).
// ponytail: 동기 호출(짧은 클립 전제) · 노래 보컬도 vocals 로 제거(Demucs 한계) → AudioShake 승급은
//   [[dub-audio-separation-anime]].

import { cors, json, getAppUser, isUuid, isActiveParticipant } from "../_shared/supa.ts";
import { presignGet, presignPut, r2Get } from "../_shared/r2.ts";

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

  let body: { dub_session_id?: unknown; cache_only?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isUuid(body.dub_session_id)) return json({ error: "Invalid dub_session_id" }, 400);
  const sessionId = body.dub_session_id;
  const cacheOnly = body.cache_only === true; // 자동 프로브용 — 미스여도 fal 비발화(호스트 포함)

  const apiKey = Deno.env.get("FAL_KEY");
  if (!apiKey) return json({ error: "음원분리 미설정(FAL_KEY)" }, 500);

  // 세션 + 권한 2단(호스트=fal 가능 / 활성 멤버=캐시-전용), 소스 존재 필수.
  const { data: sess } = await service
    .from("dub_sessions")
    .select("id, room_id, source_video_url, status, rooms(host_id)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);
  const room = sess.rooms as unknown as { host_id: string };
  const isHost = room.host_id === userId;
  if (!isHost && !(await isActiveParticipant(service, sess.room_id, userId))) {
    return json({ error: "방 멤버만 접근할 수 있어요." }, 403);
  }
  if (!sess.source_video_url) return json({ error: "소스가 없어요." }, 409);

  // S1 캐시 조회 — 매니페스트 히트면 fal·레이트리밋 없이 즉시 반환(재과금 0).
  const stemBase = `${sess.room_id}/stems/${sessionId}`;
  try {
    const mf = await r2Get(`${stemBase}/manifest.json`);
    if (mf.ok) {
      const { keys } = await mf.json() as { keys: string[] };
      if (Array.isArray(keys) && keys.length > 0) {
        const background_urls = await Promise.all(keys.map((k) => presignGet(k, 3600)));
        return json({ dub_session_id: sessionId, background_urls, stem_count: background_urls.length, cached: true }, 200);
      }
    }
  } catch { /* 캐시 조회 실패 = 미스로 진행 */ }
  if (!isHost || cacheOnly) return json({ error: "아직 음원분리 전이에요." }, 404); // 멤버·프로브는 캐시-전용

  // 비용 API 캡(SEC-4): 사용자별 20회/일 — 캐시 미스(실 fal 호출)에만 계수.
  const { data: rlOk } = await service.rpc("check_rate_limit", { p_key: `separate:${userId}`, p_max: 20, p_window_sec: 86400 });
  if (rlOk === false) return json({ error: "오늘 음원분리 한도를 초과했어요. 내일 다시 시도해주세요." }, 429);

  // 소스 presigned URL(fal 이 fetch). fal Demucs 는 mp4 도 직접 수용(실증).
  let sourceUrl: string;
  try {
    sourceUrl = await presignGet(sess.source_video_url, 600);
  } catch {
    return json({ error: "소스 URL 생성 실패" }, 500);
  }

  // fal Demucs 동기 호출(140s 타임아웃).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(FAL_URL, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: sourceUrl }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return json({ error: "음원분리 실패", detail: detail.slice(0, 300) }, 502);
    }
    const result = await resp.json() as Record<string, FalStem>;
    const falUrls = NON_VOCAL
      .map((k) => result[k]?.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    if (falUrls.length === 0) return json({ error: "배경 스템이 비어 있어요." }, 502);

    // S1 캐시 저장 — 스템을 우리 R2 로 복사 + manifest.json. 실패는 비치명(fal URL 폴백 반환).
    try {
      const keys: string[] = [];
      for (let i = 0; i < falUrls.length; i++) {
        const stem = await fetch(falUrls[i]);
        if (!stem.ok) throw new Error(`stem fetch ${stem.status}`);
        const ct = stem.headers.get("content-type") ?? "audio/mpeg";
        const ext = ct.includes("wav") ? "wav" : ct.includes("flac") ? "flac" : "mp3";
        const key = `${stemBase}/bg-${i}.${ext}`;
        const put = await fetch(await presignPut(key, 300), {
          method: "PUT",
          headers: { "Content-Type": ct },
          body: await stem.arrayBuffer(),
        });
        if (!put.ok) throw new Error(`stem put ${put.status}`);
        keys.push(key);
      }
      const mfPut = await fetch(await presignPut(`${stemBase}/manifest.json`, 300), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      if (!mfPut.ok) throw new Error(`manifest put ${mfPut.status}`);
      const background_urls = await Promise.all(keys.map((k) => presignGet(k, 3600)));
      return json({ dub_session_id: sessionId, background_urls, stem_count: background_urls.length, cached: false }, 200);
    } catch {
      return json({ dub_session_id: sessionId, background_urls: falUrls, stem_count: falUrls.length, cached: false }, 200);
    }
  } catch (e) {
    clearTimeout(timer);
    const reason = e instanceof Error && e.name === "AbortError" ? "demucs_timeout" : "demucs_exception";
    return json({ error: "음원분리 실패", reason }, 504);
  }
});
