// trigger-vgen: VGEN 생성 트리거 — 모더레이션·크레딧 원자차감·fal 제출(호스트 전용).
// SSOT: docs/reference/patterns/falai-vgen-pipeline.md §1 · docs/state-machines/Vgen.md · docs/DATA-SCHEMA.md §1.8
// 입력: { room_id, prompt_text, duration_sec }  출력: { job_id, status, credit_cost, cached? }
//
// 설계(Opus 검토):
//  - 오케스트레이션 = Edge 제출 + vgen-webhook 수신 + pg_cron(즉시 반환, durable 실행기 불필요).
//  - 크레딧 원자성 = deduct_credit RPC(FOR UPDATE). dedup 조회 → job INSERT → deduct → fal 제출 순.
//    모더레이션은 차감 前(거부 시 무과금). fal 제출 실패 = refund_credit 보상.
//  - dedup/idempotency = UNIQUE(room_id,prompt_hash)·idempotency_key → 충돌 시 기존 job 반환(재과금 0).
//  - 성역: FAL_KEY·OPENAI_API_KEY 는 Edge 런타임 시크릿(클라 노출 금지). VGEN_MODEL_ID 로 모델 외부화.
//  - 프레임 사후검사(FLAGGED)·협업 프롬프트는 slice2.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const MAX_PROMPT = 2000;

type Res = "480p" | "720p" | "1080p";
const ALLOWED_RES: Res[] = ["480p", "720p", "1080p"];
const DEFAULT_RES: Res = "720p";
// 해상도가중 크레딧(1크레딧=1초@720p 기준). ⚠️ fal Seedance 2.0 실단가 확정 전 보수적(과대) 추정 —
// VGEN_ENABLED=true 전 라이브 단가로 재검증(1080p 정확 배수 미표기). 4k 는 slice2(단가·reference 미확정).
const RES_CREDIT_WEIGHT: Record<Res, number> = { "480p": 0.5, "720p": 1, "1080p": 2.5 };
// USD/초(관측용 추정, fast tier·비디오입력 없음). 720p 확정($0.2419), 480p/1080p 추정.
const RES_USD_PER_SEC: Record<Res, number> = { "480p": 0.15, "720p": 0.2419, "1080p": 0.55 };

async function sha256hex(s: string): Promise<string> {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function getFlag<T>(service: SupabaseClient, key: string, def: T): Promise<T> {
  const { data } = await service.from("app_config").select("value").eq("key", key).maybeSingle();
  const v = (data?.value as { value?: T } | null)?.value;
  return v === undefined || v === null ? def : v;
}

// OpenAI omni-moderation(무료). fail-open: 모더레이션 장애 시 통과(프레임 사후검사가 slice2 2차 방어).
async function moderate(text: string, apiKey: string): Promise<{ flagged: boolean; categories: string[] }> {
  const r = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input: text }),
  });
  if (!r.ok) throw new Error(`moderation ${r.status}`);
  const d = await r.json() as { results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }> };
  const res = d.results?.[0];
  const cats = res?.categories ? Object.entries(res.categories).filter(([, v]) => v).map(([k]) => k) : [];
  return { flagged: !!res?.flagged, categories: cats };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; prompt_text?: unknown; duration_sec?: unknown; resolution?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roomId = body.room_id;
  const promptText = typeof body.prompt_text === "string" ? body.prompt_text.trim() : "";
  if (!promptText || promptText.length > MAX_PROMPT) {
    return json({ error: `프롬프트는 1~${MAX_PROMPT}자여야 해요.` }, 400);
  }
  const duration = Number(body.duration_sec);
  if (!Number.isInteger(duration) || duration <= 0) return json({ error: "Invalid duration_sec" }, 400);
  // 해상도는 사용자 선택(기본 720p). 허용집합 밖이면 기본값으로 폴백.
  const resolution: Res = typeof body.resolution === "string" && (ALLOWED_RES as string[]).includes(body.resolution)
    ? body.resolution as Res : DEFAULT_RES;

  // 기능 플래그 + 길이 상한
  const enabled = await getFlag(service, "VGEN_ENABLED", false);
  if (!enabled) return json({ error: "영상 생성 기능이 아직 비활성화 상태예요." }, 403);
  const maxSec = await getFlag(service, "VGEN_MAX_SEC", 10);
  if (duration > maxSec) return json({ error: `최대 ${maxSec}초까지만 가능해요.` }, 400);

  // 호스트 전용
  const { data: room } = await service.from("rooms").select("id").eq("id", roomId).eq("host_id", userId).maybeSingle();
  if (!room) return json({ error: "호스트만 영상을 생성할 수 있어요." }, 403);

  // 연령 게이트(slice1: 18+만). ponytail: 보호자 흐름 전까지 age_band!=18_plus 차단.
  const { data: me } = await service.from("users").select("age_band").eq("id", userId).maybeSingle();
  if (me?.age_band !== "18_plus") return json({ error: "성인 인증이 필요한 기능이에요." }, 403);

  // 일일 한도
  const dailyLimit = await getFlag(service, "VGEN_DAILY_LIMIT", 3);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await service.from("vgen_jobs").select("id", { count: "exact", head: true })
    .eq("triggered_by", userId).gte("created_at", since);
  if ((count ?? 0) >= dailyLimit) return json({ error: `하루 ${dailyLimit}회까지만 생성할 수 있어요.` }, 429);

  const modelId = Deno.env.get("VGEN_MODEL_ID") ?? "bytedance/seedance-2.0/fast/text-to-video";
  const promptHash = await sha256hex(`${promptText}|${modelId}|${duration}|${resolution}`);

  // dedup: 같은 방 같은 프롬프트가 이미 완료면 재사용(무과금)
  const { data: hit } = await service.from("vgen_jobs")
    .select("id, status, credit_cost")
    .eq("room_id", roomId).eq("prompt_hash", promptHash)
    .eq("status", "done").eq("validation_status", "passed").maybeSingle();
  if (hit) return json({ job_id: hit.id, status: "done", credit_cost: 0, cached: true }, 200);

  // 모더레이션(차감 前)
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    try {
      const mod = await moderate(promptText, openaiKey);
      if (mod.flagged) return json({ error: "생성할 수 없는 내용이에요.", code: "MODERATION_REJECTED", categories: mod.categories }, 400);
    } catch (e) {
      console.error("moderation skipped:", String(e)); // fail-open
    }
  }

  const cost = Math.ceil(duration * RES_CREDIT_WEIGHT[resolution]); // 해상도가중 크레딧(1크레딧=1초@720p)
  const bucket = Math.floor(Date.now() / 10000) * 10000;
  const idempotencyKey = await sha256hex(`${promptHash}|${userId}|${roomId}|${bucket}`);

  // job INSERT(pending). UNIQUE 충돌(dedup/idempotency) → 기존 반환(재과금 0).
  const { data: job, error: insErr } = await service.from("vgen_jobs").insert({
    room_id: roomId,
    triggered_by: userId,
    prompt_text: promptText,
    prompt_hash: promptHash,
    prompt_snapshot: promptText,
    status: "pending",
    provider: "seedance",
    model_id: modelId,
    duration_sec: duration,
    estimated_cost_usd: (duration * RES_USD_PER_SEC[resolution]).toFixed(4),
    visibility: "members_only",
    idempotency_key: idempotencyKey,
  }).select("id").single();

  if (insErr) {
    if (insErr.code === "23505") {
      const { data: existing } = await service.from("vgen_jobs")
        .select("id, status, credit_cost").eq("room_id", roomId).eq("prompt_hash", promptHash).maybeSingle();
      if (existing) return json({ job_id: existing.id, status: existing.status, credit_cost: existing.credit_cost, cached: true }, 200);
      return json({ error: "중복 요청이에요." }, 409);
    }
    return json({ error: "생성 요청 생성 실패", detail: insErr.message }, 500);
  }

  // 크레딧 원자 차감(RPC: FOR UPDATE). 부족 시 job 정리 + 402.
  const { error: dErr } = await service.rpc("deduct_credit", { p_user_id: userId, p_amount: cost, p_job_id: job.id });
  if (dErr) {
    const insufficient = dErr.message.includes("CREDIT_INSUFFICIENT");
    await service.from("vgen_jobs").update({ status: "failed", failure_reason: insufficient ? "credit_insufficient" : "credit_error" }).eq("id", job.id);
    return json({ error: insufficient ? "크레딧이 부족해요." : "크레딧 차감 실패" }, insufficient ? 402 : 500);
  }

  // fal 제출(트리거 시점 과금). 실패 = 환불 보상.
  const falKey = Deno.env.get("FAL_KEY");
  if (!falKey) {
    await service.rpc("refund_credit", { p_job_id: job.id });
    await service.from("vgen_jobs").update({ status: "failed", failure_reason: "provider_error" }).eq("id", job.id);
    return json({ error: "영상 생성 미설정(FAL_KEY)" }, 500);
  }
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/vgen-webhook?job_id=${job.id}`;
  try {
    const resp = await fetch("https://queue.fal.ai/run/async", {
      method: "POST",
      headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        input: { prompt: promptText, duration, resolution, generate_audio: true },
        webhook_url: webhookUrl,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(JSON.stringify(data).slice(0, 200));
    await service.from("vgen_jobs").update({ status: "generating", provider_job_id: data.request_id ?? null }).eq("id", job.id);
    return json({ job_id: job.id, status: "generating", credit_cost: cost }, 200);
  } catch (e) {
    await service.rpc("refund_credit", { p_job_id: job.id });
    await service.from("vgen_jobs").update({ status: "failed", failure_reason: "provider_error" }).eq("id", job.id);
    return json({ error: "영상 생성 요청 실패", detail: String(e).slice(0, 200) }, 502);
  }
});
