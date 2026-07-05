// LiveKit 서버 API 클라이언트(RoomServiceClient) — 방 제어(kick=removeParticipant, mute 등)용.
// 시크릿(LIVEKIT_API_*)은 Edge 런타임에서만 사용(보안 성역). RoomServiceClient 는 SERVER_URL 의
// https 호스트로 Twirp(HTTP) 호출 — 클라이언트용 wss:// 를 https:// 로 변환해 넘긴다.
import { RoomServiceClient } from "npm:livekit-server-sdk@2";

export function roomServiceClient(): RoomServiceClient {
  const wsUrl = Deno.env.get("LIVEKIT_SERVER_URL") ?? "";
  const httpUrl = wsUrl.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
  return new RoomServiceClient(
    httpUrl,
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!,
  );
}
