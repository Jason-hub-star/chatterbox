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

// REC-CONSENT-N: 분자/분모를 같이 돌려준다. 예전엔 boolean 만 줘서 호스트 화면이 "⏳ 동의 대기중"
//   한 줄로 굳었고, 무응답자는 영구 침묵이라 "몇 명 남았나"를 알 길이 없었다(계속 기다릴지 취소할지
//   판단 근거 부재). 분모 규칙(SEC-KICK-3 강퇴자 제외)이 여기 한 곳에만 있어야 하므로
//   호출부에서 따로 세지 않고 이 함수가 tally 를 반환한다 — 규칙 복제가 곧 분모 불일치다.
export interface ConsentTally {
  all: boolean;       // §11.1.1 시작 게이트(기존 boolean 과 동의어)
  consented: number;  // 동의한 활성 참가자 수
  required: number;   // 분모(활성·미강퇴 참가자 수)
}

// 활성 참가자 전원이 consented=true 인가(§11.1.1 시작 게이트). record-consent(더빙)와 동형.
export async function recomputeConsent(
  service: any,
  roomId: string,
  consent: RecordingConsent,
): Promise<ConsentTally> {
  // SEC-KICK-3: 강퇴자를 분모에서 제외 — 강퇴자는 UI 밖으로 밀려나 동의를 낼 방법이 없는데
  //   분모에는 남아 all_consented 가 영구 미충족 = 녹화 시작이 봉쇄된다(record-consent 의
  //   뷰어 계수 결함 F1 과 동형의 기능 DoS).
  const { data: parts } = await service
    .from("room_participants")
    .select("user_id")
    .eq("room_id", roomId)
    .neq("state", "left")
    .not("is_disabled_by_host", "is", true);
  const list = (parts ?? []) as { user_id: string }[];
  const consented = list.filter((p) => consent.participants[p.user_id]?.consented === true).length;
  return { all: list.length > 0 && consented === list.length, consented, required: list.length };
}
