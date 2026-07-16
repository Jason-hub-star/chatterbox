// livekit-webhook: LiveKit 서버 이벤트 수신(GOAL-room-gaps R5 근본) — participant_left →
// soft-leave + 호스트 승계(_shared/roomLeave.ts, leave-room 과 동일 로직).
// 탭닫기/브라우저 크래시/네트워크 사망처럼 클라가 leave-room 을 못 부른 경우를 서버가 회수한다.
//
// 인증(성역): WebhookReceiver 가 Authorization JWT 를 LIVEKIT_API_KEY/SECRET 으로 검증(위조 차단).
//   verify_jwt=false(config.toml) — 외부 서비스는 Supabase JWT 가 없다(vgen-webhook 동형).
// 오탐 방어: participant_left 는 재연결 유예 만료 후 발화하지만, 리로드(같은 identity 즉시 재접속)의
//   구 세션 몫으로도 올 수 있다 → listParticipants 로 현재 재실 여부를 대조해 재실 중이면 무시.
// 멱등: 명시 퇴장(leave-room)과 중복 도착해도 softLeaveRoom 이 already_left 로 무해.
// 라이브 연결은 배포 게이트: LiveKit 대시보드에 이 함수 URL 을 webhook 으로 등록해야 발화한다.
import { json, serviceClient, isUuid } from "../_shared/supa.ts";
import { softLeaveRoom } from "../_shared/roomLeave.ts";
import { roomServiceClient } from "../_shared/livekit.ts";
import { WebhookReceiver } from "npm:livekit-server-sdk@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.text();
  const authHeader = req.headers.get("authorization") ?? "";
  let event;
  try {
    const receiver = new WebhookReceiver(
      Deno.env.get("LIVEKIT_API_KEY")!,
      Deno.env.get("LIVEKIT_API_SECRET")!,
    );
    event = await receiver.receive(body, authHeader);
  } catch {
    return json({ error: "Invalid signature" }, 401);
  }

  // participant_left 만 처리 — 그 외 이벤트는 ack(구독 설정과 무관하게 방어적).
  const roomName = event.room?.name;
  const identity = event.participant?.identity;
  if (event.event !== "participant_left" || !isUuid(roomName) || typeof identity !== "string" || !identity) {
    return json({ ok: true, ignored: true }, 200);
  }

  // 재실 대조: 같은 identity 가 이미 재접속해 있으면(리로드·순단 복귀) 구 세션의 left 는 무시.
  try {
    const live = await roomServiceClient().listParticipants(roomName);
    if (live.some((p) => p.identity === identity)) return json({ ok: true, ignored: "still_present" }, 200);
  } catch {
    /* LiveKit 방이 이미 소멸(빈 방 GC) — 재실자 없음으로 간주하고 진행 */
  }

  const service = serviceClient();
  const { data: u } = await service
    .from("users").select("id")
    .eq("auth_id", identity).is("deleted_at", null)
    .maybeSingle();
  if (!u) return json({ ok: true, ignored: "unknown_identity" }, 200);

  const result = await softLeaveRoom(service, roomName, u.id);
  return json({ ok: true, result: result.kind }, 200);
});
