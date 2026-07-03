// create-dub-upload: 더빙 소스 영상 업로드용 R2 presigned PUT URL 발급(호스트 전용).
// SSOT: docs/contracts/DubSessionSelector.md, docs/specs/MediaConfig.md §4(Whisper ≤25MB)
// 입력: { room_id, file_name, size_bytes, mime_type }  출력: { path, uploadUrl }
//
// 흐름: 클라가 fetch(uploadUrl, {method:'PUT', body:file}) → create-dub-session 호출.
// 저장소: Cloudflare R2(egress $0). presign = _shared/r2.ts 자체 SigV4.
// ponytail: age 게이트(18+)는 테스트계정 age_band=null 로 데모 차단 → 후속 슬라이스에서 활성.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { presignPut } from "../_shared/r2.ts";

const MAX_BYTES = 25 * 1024 * 1024; // Whisper 입력 상한
const ALLOWED_MIME = ["video/mp4", "video/webm", "audio/mpeg", "audio/mp4", "audio/wav"];
const EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; file_name?: unknown; size_bytes?: unknown; mime_type?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roomId = body.room_id;

  const size = Number(body.size_bytes);
  if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) {
    return json({ error: "파일은 25MB 이하만 가능해요." }, 400);
  }
  const mime = typeof body.mime_type === "string" ? body.mime_type : "";
  if (!ALLOWED_MIME.includes(mime)) return json({ error: "지원하지 않는 형식이에요." }, 400);

  // 호스트 전용
  const { data: room } = await service
    .from("rooms")
    .select("id")
    .eq("id", roomId)
    .eq("host_id", userId)
    .maybeSingle();
  if (!room) return json({ error: "호스트만 더빙 영상을 올릴 수 있어요." }, 403);

  const key = `${roomId}/sources/${crypto.randomUUID()}.${EXT[mime]}`;
  let uploadUrl: string;
  try {
    uploadUrl = await presignPut(key);
  } catch (e) {
    return json({ error: "업로드 URL 발급 실패", detail: String(e) }, 500);
  }

  return json({ path: key, uploadUrl }, 200);
});
