// 초대코드 공용(LOB-05): 형식 검증 + SHA-256 해시. DB엔 해시만 저장(SEC-INVITE-ENTROPY) —
// 코드 자체가 128-bit 난수라 솔트 없는 결정적 해시로 충분(역상 탐색 불가) + 해시 컬럼 직조회 가능.
export function isInviteCode(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{32}$/.test(v);
}

export async function inviteCodeHash(code: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
