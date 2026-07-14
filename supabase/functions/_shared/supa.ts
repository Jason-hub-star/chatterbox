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

export type HostRoom = { id: string; host_id: string; status: string } & Record<string, unknown>;

// 방 존재 + 호스트 검증 공통 체인(Room not found 404 → Room ended 409 → Not host 403).
// 호스트 게이트 함수는 인라인 복사 대신 반드시 이걸 쓴다 — 응답 계약(status·문구)의 단일 지점.
// extraCols: 함수별 추가 컬럼(예: "title"). 통과 시 room 행 반환, 실패 시 {res} 로 즉시 응답.
export async function requireHostRoom(
  service: SupabaseClient,
  roomId: string,
  userId: string,
  extraCols = "",
): Promise<{ ok: true; room: HostRoom } | { ok: false; res: Response }> {
  const cols = extraCols ? `id, host_id, status, ${extraCols}` : "id, host_id, status";
  const { data } = await service.from("rooms").select(cols).eq("id", roomId).single();
  const room = data as unknown as HostRoom | null;
  if (!room) return { ok: false, res: json({ error: "Room not found" }, 404) };
  if (room.status === "ended") return { ok: false, res: json({ error: "Room ended" }, 409) };
  if (room.host_id !== userId) return { ok: false, res: json({ error: "Not host" }, 403) };
  return { ok: true, room };
}

// 활성 참가자 여부 — state != 'left' AND 호스트 강퇴 아님. 강퇴자(is_disabled_by_host=true) 차단의 단일 지점.
// SEC-KICK-1/2: kick 은 livekit 재입장(livekit-token)뿐 아니라 discrete Edge 액션(chat·reaction·데이터
//   접근 등)도 막아야 모더레이션이 실효 — 멤버십을 보는 모든 호출처가 이 프리미티브를 쓴다.
//   is_disabled_by_host 는 nullable(default false) → `is not true` 로 null=활성 처리(정상 참가자 오탐 방지).
// 방 종료 여부는 보지 않음 — 종료된 방의 녹음/더빙 다운로드는 허용(getter 용). 종료 게이트가 필요한
//   mutation(chat 등)은 아래 requireActiveParticipant 를 쓴다.
export async function isActiveParticipant(
  service: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await service
    .from("room_participants").select("id")
    .eq("room_id", roomId).eq("user_id", userId)
    .neq("state", "left").not("is_disabled_by_host", "is", true)
    .maybeSingle();
  return !!data;
}

// 방 호스트 여부(rooms.host_id === userId) — 종료 여부 미검사(getter 용, 세션 후 합성 다운로드 허용).
// SEC-DUB-1: get-dub-recordings 처럼 호스트 전용이지만 종료방 다운로드는 살려야 하는 getter 에 쓴다.
//   종료 게이트가 필요한 host mutation 은 requireHostRoom(404→409→403) 을 쓴다.
export async function isRoomHost(
  service: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await service.from("rooms").select("host_id").eq("id", roomId).maybeSingle();
  return !!data && (data as { host_id: string }).host_id === userId;
}

// 활성 참가자 게이트(방 존재/미종료 + isActiveParticipant) — mutation(발언·리액션 등) 용.
// extraCols: 함수별 room 추가 컬럼(예: "chat_banned_words"). 통과 시 room 행 반환, 실패 시 {res} 즉시 응답.
export async function requireActiveParticipant(
  service: SupabaseClient,
  roomId: string,
  userId: string,
  extraCols = "",
): Promise<{ ok: true; room: HostRoom } | { ok: false; res: Response }> {
  const cols = extraCols ? `id, host_id, status, ${extraCols}` : "id, host_id, status";
  const { data } = await service.from("rooms").select(cols).eq("id", roomId).single();
  const room = data as unknown as HostRoom | null;
  if (!room) return { ok: false, res: json({ error: "Room not found" }, 404) };
  if (room.status === "ended") return { ok: false, res: json({ error: "Room ended" }, 409) };
  if (!(await isActiveParticipant(service, roomId, userId))) {
    return { ok: false, res: json({ error: "Not a participant" }, 403) };
  }
  return { ok: true, room };
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
