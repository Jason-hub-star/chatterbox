// 방 Edge Function 공통 헬퍼.
// - 호출자 인증(anon 클라 + Authorization 헤더 → auth uid)
// - auth_id → app users.id 매핑
// - 쓰기용 service_role 클라(RLS 우회). service_role 키는 Edge 런타임에 플랫폼이 주입
//   (SUPABASE_SERVICE_ROLE_KEY) — 클라이언트/.env/VITE_ 에 노출되지 않음(보안 성역).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  // 기본 '*': 개발 루프(localhost → 프로드 백엔드)가 상시라 지금 좁히면 일상 개발이 깨짐 + Bearer 토큰
  // API 라 ambient credential 없음(실위험 Low). 공개 런칭 시 secrets 로 ALLOWED_ORIGIN=<앱 오리진> 설정해
  // 전 함수 일괄로 좁힌다(cold start 평가·재배포 필요). ponytail ceiling: localhost 병행까지 필요한
  // 다오리진은 요청 origin echo — json() 이 req 를 받는 전 함수 call-site 승급이 필요해 defer.
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
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

// 스토리지 오브젝트 키 안전 검증(경로 조작 방지, SEC-2): `<roomId>/<subdir>/<파일명>` 정확히.
// 여분 '/'·'..'·선행 '.' 금지 → 프리픽스만 맞추는 startsWith 의 traversal 우회를 차단한다.
// roomId 는 isUuid 로 검증된 UUID, subdirs 는 서버 고정 리터럴만 넘긴다(정규식 주입 없음).
export function isSafeObjectKey(key: unknown, roomId: string, subdirs: string[]): key is string {
  if (typeof key !== "string" || key.includes("..")) return false;
  return new RegExp(`^${roomId}/(?:${subdirs.join("|")})/[A-Za-z0-9][A-Za-z0-9._-]*$`).test(key);
}
