// vgen-webhook: fal.ai 완료 콜백 수신 — 서명검증·R2 이관·3-way DONE 게이트·실패 환불.
// SSOT: docs/reference/patterns/falai-vgen-pipeline.md §3 · docs/DATA-SCHEMA.md §1.8
// 입력(query): ?job_id=<uuid>   본문: fal webhook payload   출력: { ok }
//
// 설계(Opus 검토):
//  - 배포: JWT-public(--no-verify-jwt) — fal 은 Supabase JWT 를 안 보냄. 인증은 ED25519 서명 단독.
//  - 멱등: job.status 가 이미 done/failed 면 no-op(시간창 아님). fal 은 같은 request_id 를 10회까지 재전송.
//  - 3-way DONE 게이트: validation_status='passed' AND result_url NOT NULL AND credit_deducted_at NOT NULL.
//    하나라도 불만족 → failed + refund_credit(멱등).
//  - 저장: fal 임시 URL → 바이트 다운로드 → R2 presignPut PUT → result_object_key(durable)·result_url(단기).
//  - Realtime 브로드캐스트는 별도 emit 불필요 — vgen_jobs UPDATE 가 postgres_changes 로 자동 방송.
//  - ⚠️ fal 서명 헤더/포맷은 라이브 검증 시 실제값으로 확정(현재 fal 공개 스펙 기준 구현).

import { serviceClient } from "../_shared/supa.ts";
import { presignGet, presignPut } from "../_shared/r2.ts";

const enc = new TextEncoder();

async function sha256hex(s: string): Promise<string> {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(h: string): Uint8Array {
  const u = new Uint8Array(h.length / 2);
  for (let i = 0; i < u.length; i++) u[i] = parseInt(h.substr(i * 2, 2), 16);
  return u;
}
function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

let jwksCache: Array<{ x: string }> | null = null;
let jwksAt = 0;
async function getFalKeys(): Promise<Array<{ x: string }>> {
  if (jwksCache && Date.now() - jwksAt < 3_600_000) return jwksCache;
  const r = await fetch("https://rest.fal.ai/.well-known/jwks.json");
  const d = await r.json() as { keys?: Array<{ kty: string; crv: string; x: string }> };
  jwksCache = (d.keys ?? []).filter((k) => k.kty === "OKP" && k.crv === "Ed25519");
  jwksAt = Date.now();
  return jwksCache;
}

// fal ED25519 서명검증. message = requestId\nuserId\ntimestamp\nsha256hex(body).
async function verifyFal(req: Request, rawBody: string): Promise<boolean> {
  const reqId = req.headers.get("x-fal-webhook-request-id");
  const userId = req.headers.get("x-fal-webhook-user-id");
  const ts = req.headers.get("x-fal-webhook-timestamp");
  const sigHex = req.headers.get("x-fal-webhook-signature");
  if (!reqId || !userId || !ts || !sigHex) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false; // ±5분 재생방지
  const message = enc.encode(`${reqId}\n${userId}\n${ts}\n${await sha256hex(rawBody)}`);
  const sig = hexToBytes(sigHex);
  for (const k of await getFalKeys()) {
    try {
      const pub = await crypto.subtle.importKey("raw", b64urlToBytes(k.x) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
      if (await crypto.subtle.verify("Ed25519", pub, sig as BufferSource, message as BufferSource)) return true;
    } catch { /* 다음 키 */ }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const jobId = new URL(req.url).searchParams.get("job_id");
  const rawBody = await req.text();

  if (!(await verifyFal(req, rawBody))) {
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }
  if (!jobId) return new Response(JSON.stringify({ error: "missing job_id" }), { status: 400 });

  let payload: { request_id?: string; status?: string; payload?: { video?: { url?: string } }; error?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
  }

  const service = serviceClient();
  const { data: job } = await service.from("vgen_jobs")
    .select("id, room_id, status, credit_deducted_at").eq("id", jobId).maybeSingle();
  if (!job) return new Response(JSON.stringify({ ok: true }), { status: 200 }); // 알 수 없는 job → 무시
  if (job.status === "done" || job.status === "failed") {
    return new Response(JSON.stringify({ ok: true }), { status: 200 }); // 멱등: 이미 종료
  }

  const ok = payload.status === "OK" || payload.status === "COMPLETED";
  const videoUrl = payload.payload?.video?.url;

  if (ok && videoUrl) {
    try {
      const dl = await fetch(videoUrl);
      if (!dl.ok) throw new Error(`download ${dl.status}`);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const passed = bytes.byteLength > 0; // 경량 무결성(Edge 는 ffprobe 불가). 심층검증은 slice2.

      const key = `${job.room_id}/vgen/${jobId}.mp4`;
      const putUrl = await presignPut(key, 300);
      const put = await fetch(putUrl, { method: "PUT", body: bytes, headers: { "Content-Type": "video/mp4" } });
      if (!put.ok) throw new Error(`r2 put ${put.status}`);

      // 3-way DONE 게이트
      if (passed && job.credit_deducted_at) {
        await service.from("vgen_jobs").update({
          status: "done",
          validation_status: "passed",
          result_object_key: key,
          result_url: await presignGet(key, 3600),
          provider_job_id: payload.request_id ?? null,
          completed_at: new Date().toISOString(),
        }).eq("id", jobId);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error("gate_failed");
    } catch (e) {
      await service.from("vgen_jobs").update({ status: "failed", failure_reason: "validation_failed", validation_status: "failed", completed_at: new Date().toISOString() }).eq("id", jobId);
      await service.rpc("refund_credit", { p_job_id: jobId });
      console.error("vgen-webhook finalize error:", String(e));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  }

  // 실패(fal ERROR/FAILED)
  await service.from("vgen_jobs").update({
    status: "failed",
    failure_reason: (payload.error ?? "provider_error").slice(0, 100),
    completed_at: new Date().toISOString(),
  }).eq("id", jobId);
  await service.rpc("refund_credit", { p_job_id: jobId });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
