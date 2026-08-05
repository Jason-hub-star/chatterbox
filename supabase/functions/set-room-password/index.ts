// set-room-password: 호스트가 방 비밀번호를 설정/변경/해제한다 (HOST-06, 잠금방).
// SSOT: docs/specs/DATA-SCHEMA.md §1.2.1 (room_secrets) · docs/contracts/HostConsole.md
// 입력: { room_id, password }  — password "" 또는 공백만이면 잠금 해제. 그 외 4~64자.
// 보안(성역): 호출자 == rooms.host_id 서버 검증. 해시는 room_secrets(서버 전용)에만, 클라 미노출.
import { cors, json, getAppUser, isUuid, requireHostRoom } from "../_shared/supa.ts";
import { hashPassword } from "../_shared/password.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roomId = body.room_id;
  const password = typeof body.password === "string" ? body.password : "";

  // 방 존재 + 호스트 검증
  const gate = await requireHostRoom(service, roomId, userId);
  if (!gate.ok) return gate.res;

  // 잠금 해제(빈 비번). 원자성: is_locked=false 를 먼저 — 두 쓰기 사이 실패해도
  // "잠금 해제(입장 가능)" 쪽으로 안전 수렴. (역순이면 secret 삭제 후 is_locked=true 로 남아
  // join-room-with-password 가 해시 없음→거부 → 아무도 못 들어오는 방이 됨.)
  if (password.trim().length === 0) {
    await service.from("rooms").update({ is_locked: false }).eq("id", roomId);
    await service.from("room_secrets").delete().eq("room_id", roomId);
    return json({ ok: true, is_locked: false }, 200);
  }

  // SEC-PW-1: 최소 6자 + 숫자전용 금지. join-room-with-password 의 레이트리밋 키가
  //   `pwjoin:<user>:<room>` 이라 계정당 독립 카운터 → 계정을 늘리면 시도를 병렬화할 수 있다
  //   (4자리 숫자 = 1계정 6.9일이지만 100계정이면 100분). 방 단위 전역 카운터로 막으면 공격자가
  //   일부러 틀려 정상 유저를 잠그는 DoS 가 되므로, 방어를 탐색공간 쪽에 둔다(1만 → 수십억).
  //   ponytail ceiling: 기존 방의 약한 비번은 그대로 동작한다(재설정 시에만 새 정책 적용) —
  //   전수 강제 만료는 호스트 이탈 비용이 커 defer.
  if (password.length < 6 || password.length > 64) return json({ error: "Invalid password" }, 400);
  if (/^\d+$/.test(password)) return json({ error: "Numeric-only password" }, 400);

  const password_hash = await hashPassword(password);
  const { error: upErr } = await service
    .from("room_secrets")
    .upsert({ room_id: roomId, password_hash, updated_at: new Date().toISOString() }, { onConflict: "room_id" });
  if (upErr) return json({ error: "Set password failed" }, 500);

  await service.from("rooms").update({ is_locked: true }).eq("id", roomId);
  return json({ ok: true, is_locked: true }, 200);
});
