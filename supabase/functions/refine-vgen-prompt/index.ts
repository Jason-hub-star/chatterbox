// refine-vgen-prompt: 사용자 개떡 입력 → Seedance 2.0 최적 프롬프트로 LLM 정제(호스트·무과금·무DB).
// SSOT: docs/API-SURFACE.md §refine-vgen-prompt · docs/contracts/VgenPanel.md §AI 프롬프트 정제
// 입력: { room_id, rough_prompt, reference_asset_ids?, target_duration_sec? } → { refined_prompt }
//
// 안전: LLM 키(REFINE_LLM_KEY/OPENAI_API_KEY)는 Edge 런타임 시크릿 — 클라 노출 금지(성역).
//   정제결과는 사용자 미리보기용(자동생성 아님) → 최종 모더레이션은 trigger-vgen 이 생성 직전 수행.
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

const MAX_ROUGH = 1000;

// Seedance 2.0 공식 프롬프트 규칙(fal.ai/ByteDance) 인코딩. 이 시스템 프롬프트가 이 슬라이스의 핵심 자산.
// 출처: fal.ai/learn/tools/seedance-2-0-prompting-guide · github fal-ai/seedance-2.0-api · seed.bytedance.com
function systemPrompt(refCount: number, durationSec?: number): string {
  const lines = [
    "You are an expert prompt engineer for ByteDance's Seedance 2.0 video generation model.",
    "Rewrite the user's rough idea (often casual Korean) into ONE optimized English video prompt for Seedance 2.0.",
    "Output ONLY the final prompt text — no preamble, no explanation, no surrounding quotes, no markdown.",
    "",
    "Follow Seedance 2.0's official prompting conventions:",
    "- Structure: Subject -> Action -> Camera -> Scene/Lighting -> Style. Write 2-4 natural sentences, 50-150 words, as a single continuous shot.",
    "- Prioritize concrete verbs and physical motion (what moves and how). Avoid vague adjectives like \"epic\", \"beautiful\", \"cinematic\".",
    "- Camera: use standard cinematography terms (dolly, push-in, tracking shot, handheld, POV, crane, rack focus, locked-off). Describe camera movement separately from subject movement. Never use \"fast\" (it causes jitter) — describe speed concretely, e.g. \"slow push-in\".",
    "- Seedance does not support negative prompts. Express exclusions inline as \"no X\" (e.g. \"no text, no watermark\").",
    "- If the user wants spoken dialogue, wrap the line in double quotes and keep it short for lip-sync.",
    "- Do NOT write aspect ratio, resolution, or duration numbers into the prompt — those are separate API parameters.",
    "- Faithfully preserve the user's intent and subject. Do not invent unrelated content; fill only sensible gaps (framing, lighting) to make the shot concrete.",
  ];
  if (refCount > 0) {
    const tags = Array.from({ length: refCount }, (_, i) => `@Image${i + 1}`).join(", ");
    lines.push(`- ${refCount} reference image(s) are attached. Reference them inline as ${tags} to lock character/appearance consistency; treat them as hard constraints.`);
  }
  if (durationSec && durationSec > 0) {
    lines.push(`- Target clip length is about ${durationSec}s. If it needs distinct beats, use "Shot 1: ... cut to ... Shot 2: ..." with one action and one camera move per shot; otherwise keep a single continuous shot.`);
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; rough_prompt?: unknown; reference_asset_ids?: unknown; target_duration_sec?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roughPrompt = typeof body.rough_prompt === "string" ? body.rough_prompt.trim() : "";
  if (!roughPrompt || roughPrompt.length > MAX_ROUGH) return json({ error: `요청은 1~${MAX_ROUGH}자여야 해요.` }, 400);
  const refs = Array.isArray(body.reference_asset_ids) ? body.reference_asset_ids : [];
  if (refs.length > 9) return json({ error: "참조 이미지는 9장까지예요." }, 400);
  const durationSec = Number.isInteger(Number(body.target_duration_sec)) && Number(body.target_duration_sec) > 0
    ? Number(body.target_duration_sec) : undefined;

  // 호스트 전용(trigger-vgen 동형).
  const { data: room } = await service.from("rooms").select("id").eq("id", body.room_id).eq("host_id", userId).maybeSingle();
  if (!room) return json({ error: "호스트만 프롬프트를 다듬을 수 있어요." }, 403);

  // 비용 API 캡(SEC-4): 사용자별 50회/일(check_rate_limit RPC). 무제한 LLM 호출로 인한 비용-DoS 차단.
  const { data: rlOk } = await service.rpc("check_rate_limit", { p_key: `refine:${userId}`, p_max: 50, p_window_sec: 86400 });
  if (rlOk === false) return json({ error: "오늘 프롬프트 정제 한도를 초과했어요. 내일 다시 시도해주세요." }, 429);

  const llmKey = Deno.env.get("REFINE_LLM_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!llmKey) return json({ error: "프롬프트 정제 미설정" }, 500);
  const baseUrl = Deno.env.get("REFINE_LLM_BASE_URL") ?? "https://api.openai.com/v1";
  const model = Deno.env.get("REFINE_LLM_MODEL") ?? "gpt-4o-mini";

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${llmKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt(refs.length, durationSec) },
          { role: "user", content: roughPrompt },
        ],
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(JSON.stringify(data).slice(0, 200));
    const refined = String(data?.choices?.[0]?.message?.content ?? "").trim();
    if (!refined) throw new Error("empty completion");
    return json({ refined_prompt: refined }, 200);
  } catch (e) {
    return json({ error: "프롬프트 정제 실패", detail: String(e).slice(0, 200) }, 502);
  }
});
