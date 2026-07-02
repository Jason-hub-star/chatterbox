// 방 Edge Function 공통 헬퍼.
// - 호출자 인증(anon 클라 + Authorization 헤더 → auth uid)
// - auth_id → app users.id 매핑
// - 쓰기용 service_role 클라(RLS 우회). service_role 키는 Edge 런타임에 플랫폼이 주입
//   (SUPABASE_SERVICE_ROLE_KEY) — 클라이언트/.env/VITE_ 에 노출되지 않음(보안 성역).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*", // ponytail: PoC '*'. 프로덕션은 앱 오리진으로 좁힌다.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export type AppUser = { authId: string; userId: string; email: string | null; service: SupabaseClient };

// 인증 + 프로필 매핑. 실패 시 {res} 로 즉시 응답.
export async function getAppUser(
  req: Request,
): Promise<{ ok: true; user: AppUser } | { ok: false; res: Response }> {
  const authHeader = req.headers.get("authorization") ?? "";
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await anon.auth.getUser();
  if (error || !user) return { ok: false, res: json({ error: "Unauthorized" }, 401) };

  const service = serviceClient();
  const { data: appUser, error: uErr } = await service
    .from("users")
    .select("id, email")
    .eq("auth_id", user.id)
    .is("deleted_at", null)
    .single();
  if (uErr || !appUser) return { ok: false, res: json({ error: "No profile" }, 403) };

  return { ok: true, user: { authId: user.id, userId: appUser.id, email: appUser.email, service } };
}

// 간단 UUID 형식 검증(입력 방어).
export function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
