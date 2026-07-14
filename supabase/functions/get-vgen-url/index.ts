// get-vgen-url: 완성된 VGEN 영상 재생용 R2 presigned GET URL(접근제어).
// SSOT: docs/DATA-SCHEMA.md §1.8 (visibility 게이트) · get-dub-output-url 패턴
// 입력: { job_id }  출력: { url }
//
// 접근제어(RLS 와 동형, Edge=service_role 이라 수동 확인): public | 본인(triggered_by) | members_only+방멤버.

import { cors, json, getAppUser, isUuid, isActiveParticipant } from "../_shared/supa.ts";
import { presignGet } from "../_shared/r2.ts";

const TTL_SEC = 3600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { job_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.job_id)) return json({ error: "Invalid job_id" }, 400);

  const { data: job } = await service.from("vgen_jobs")
    .select("room_id, result_object_key, visibility, triggered_by")
    .eq("id", body.job_id).maybeSingle();
  if (!job) return json({ error: "영상을 찾을 수 없어요." }, 404);

  let allowed = job.visibility === "public" || job.triggered_by === userId;
  if (!allowed && job.visibility === "members_only") {
    // 강퇴자 차단 포함(SEC-KICK-2)
    allowed = await isActiveParticipant(service, job.room_id, userId);
  }
  if (!allowed) return json({ error: "볼 수 있는 권한이 없어요." }, 403);
  if (!job.result_object_key) return json({ error: "아직 완성되지 않았어요." }, 404);

  let url: string;
  try {
    url = await presignGet(job.result_object_key, TTL_SEC);
  } catch (e) {
    return json({ error: "URL 발급 실패", detail: String(e) }, 500);
  }
  return json({ url }, 200);
});
