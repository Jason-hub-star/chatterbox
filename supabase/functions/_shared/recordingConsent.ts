// 녹화 동의 공용 헬퍼(G3·ROOM-13) — consent_json 은 계약 §11.2 구조.
// ip_hash: SHA256(x-forwarded-for + salt) — GDPR §5 동의 출처 증거. salt 는 전용 env 가 있으면
// 사용, 없으면 고정 문자열(ponytail: 목적이 원문 IP 은닉(무지개테이블 방지) 수준이라 충분 —
// 법무 요구 상향 시 IP_HASH_SALT 시크릿 발급으로 승급).

// deno-lint-ignore-file no-explicit-any
export interface RecordingConsent {
  participants: Record<string, {
    consented: boolean;
    consented_at: string;
    consent_type: "pre" | "post";
    ip_hash: string;
  }>;
  all_consented: boolean;
}

export async function hashIp(req: Request): Promise<string> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const salt = Deno.env.get("IP_HASH_SALT") ?? "cb-consent-v1";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + salt));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 활성 참가자 전원이 consented=true 인가(§11.1.1 시작 게이트). record-consent(더빙)와 동형.
export async function recomputeConsent(
  service: any,
  roomId: string,
  consent: RecordingConsent,
): Promise<boolean> {
  const { data: parts } = await service
    .from("room_participants")
    .select("user_id")
    .eq("room_id", roomId)
    .neq("state", "left");
  const list = (parts ?? []) as { user_id: string }[];
  return list.length > 0 &&
    list.every((p) => consent.participants[p.user_id]?.consented === true);
}
