// revoke-room-invites: 호스트가 이 방의 살아있는 초대링크를 전부 폐기(FEAT-GAP-1).
// SSOT: contracts/LobbyPage.md §초대링크 · DATA-SCHEMA §1.2.2
//
// 왜 이 함수가 필요한가: `room_invites.revoked_at` 은 컬럼도 있고 검사도 두 곳에서 하는데
//   (verify-invite-code:36 → 410 "revoked", consume_room_invite:40 → status 'revoked')
//   **세팅하는 코드가 레포 전체에 없었다** — 즉 링크가 유출돼도 호스트가 막을 수단이 0이고
//   `revoked_at` 은 영원히 null 인 죽은 컬럼이었다. 소비측 게이트는 이미 완비라 여기만 채우면 닫힌다.
//
// 설계(ponytail): 개별 폐기가 아니라 **방 단위 일괄**. 개별 폐기는 "어떤 링크인지" 고르는 목록 UI가
//   전제인데(발급 응답 이후 원문 코드는 어디에도 없어 사용자가 링크를 식별할 방법이 없다), 유출 대응의
//   실제 요구는 "지금 당장 다 끊기"다. ceiling: 지명초대(LOB-08)도 함께 끊긴다 — 재발급이 즉시 가능해
//   감수. 목록 UI가 생기면 그때 invite_id 개별 폐기 + `created_by` SELECT 정책(마이그 :22 의 예고)을 추가.
//
// 마이그레이션 불요: 쓰기는 service_role 이라 room_invites 의 deny-all RLS 그대로 통과.
import { cors, json, getAppUser, isUuid, requireHostRoom } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);

  // 호스트 검증(성역) — 폐기는 방 권한이다. 404→409→403 분기는 requireHostRoom 이 소유.
  const gate = await requireHostRoom(service, body.room_id, userId);
  if (!gate.ok) return gate.res;

  // 이미 폐기된 행은 건드리지 않는다(`revoked_at is null`) — 최초 폐기 시각을 보존하고
  //   반환 개수가 "이번에 실제로 끊긴 링크 수"가 되게 한다(사용자에게 보여줄 숫자).
  // 만료분은 이미 죽었으므로 개수에서 뺀다(부풀면 "몇 개가 끊겼나"가 오해를 준다). 소진분(used_count
  //   >= max_uses)은 컬럼끼리 비교라 PostgREST 필터로 못 걸어 포함될 수 있다 — 개수만 조금 후하다.
  const nowIso = new Date().toISOString();
  const { data: revoked, error } = await service
    .from("room_invites")
    .update({ revoked_at: nowIso })
    .eq("room_id", body.room_id)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .select("id");
  if (error) return json({ error: "Revoke failed" }, 500);

  return json({ ok: true, revoked: revoked?.length ?? 0 }, 200);
});
