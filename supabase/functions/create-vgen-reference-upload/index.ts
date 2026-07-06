// create-vgen-reference-upload: reference-to-video 참조 이미지용 R2 presigned PUT + GET (호스트 전용).
// SSOT: docs/API-SURFACE.md · docs/contracts/VgenPanel.md §참조 이미지
// 흐름: 클라가 아바타 렌더(또는 사용자 이미지) → PUT(upload_url) → get_url 을 trigger-vgen image_urls 로 전달.
//   fal 이 get_url 을 fetch(≤1h TTL). R2_* 는 Edge 시크릿(클라 노출 금지·성역) — presigned URL 만 반환.
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { presignPut, presignGet } from "../_shared/r2.ts";

const CT_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; content_type?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const contentType = typeof body.content_type === "string" ? body.content_type : "image/png";
  const ext = CT_EXT[contentType];
  if (!ext) return json({ error: "이미지(png/jpeg/webp)만 업로드할 수 있어요." }, 400);

  // 호스트 전용(trigger-vgen·refine 동형).
  const { data: room } = await service.from("rooms").select("id").eq("id", body.room_id).eq("host_id", userId).maybeSingle();
  if (!room) return json({ error: "호스트만 참조를 업로드할 수 있어요." }, 403);

  const key = `vgen-refs/${body.room_id}/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = await presignPut(key, 300);   // 5분(업로드 창)
  const getUrl = await presignGet(key, 3600);      // 1시간(fal fetch 여유)
  return json({ key, upload_url: uploadUrl, get_url: getUrl, content_type: contentType }, 200);
});
