// supabase/functions/create-feedback/index.ts
// 인앱 피드백/문의 접수(ISS-04 창구) — feedback INSERT + audit_logs 'feedback_created'.
// diag(진단 번들)는 opt-in 이며 서버가 화이트리스트 키만 재구성해 저장한다 — 클라가 보낸
// 임의 구조를 그대로 담지 않는다(개인정보 최소수집: 업로드 원본 이미지·이메일 등 미포함).
// rate limit: 2/분 + 10/시(작성자 기준).
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";

const CATEGORIES = ["avatar", "room", "audio", "other"];
const STR = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { category?: unknown; description?: unknown; diag?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { category, description, diag } = body;
  if (typeof category !== "string" || !CATEGORIES.includes(category)) return json({ error: "Invalid category" }, 400);
  if (typeof description !== "string" || description.trim().length < 1 || description.length > 1000) {
    return json({ error: "Invalid description" }, 400);
  }

  // diag 화이트리스트 재구성 — 허용 키 외 전부 폐기.
  let diagRow: Record<string, unknown> | null = null;
  if (diag !== undefined && diag !== null) {
    if (typeof diag !== "object" || Array.isArray(diag)) return json({ error: "Invalid diag" }, 400);
    const d = diag as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (d.avatar_job_id !== undefined) {
      if (!isUuid(d.avatar_job_id)) return json({ error: "Invalid diag.avatar_job_id" }, 400);
      out.avatar_job_id = d.avatar_job_id;
    }
    const avatarUrl = STR(d.avatar_url, 300);
    if (avatarUrl) out.avatar_url = avatarUrl;
    const userAgent = STR(d.user_agent, 300);
    if (userAgent) out.user_agent = userAgent;
    const appUrl = STR(d.app_url, 300);
    if (appUrl) out.app_url = appUrl;
    if (Object.keys(out).length > 0) diagRow = out;
  }

  const { data: rl1 } = await user.service.rpc("check_rate_limit", { p_key: `feedback:${user.userId}`, p_max: 2, p_window_sec: 60 });
  if (rl1 === false) return json({ error: "Too many requests" }, 429);
  const { data: rl2 } = await user.service.rpc("check_rate_limit", { p_key: `feedback-h:${user.userId}`, p_max: 10, p_window_sec: 3600 });
  if (rl2 === false) return json({ error: "Too many requests" }, 429);

  const { data: row, error } = await user.service.from("feedback").insert({
    user_id: user.userId,
    category,
    description: description.trim(),
    diag: diagRow,
  }).select("id").single();
  if (error || !row) return json({ error: "Insert failed" }, 500);

  await user.service.from("audit_logs").insert({
    event_type: "feedback_created",
    actor_user_id: user.userId,
    target_id: row.id,
    meta: { category, has_diag: diagRow !== null },
  });
  return json({ ok: true, id: row.id }, 200);
});
