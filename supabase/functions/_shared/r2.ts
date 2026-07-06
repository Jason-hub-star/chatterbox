// _shared/r2.ts — Cloudflare R2 프리사인(S3 SigV4 자체구현). Supabase Storage(dub-assets) 대체.
// 왜 R2: egress $0 — 다운로드가 본질인 더빙/영상 결과물의 대역폭 지뢰를 구조적으로 봉쇄
//        (COST-ESTIMATE.md §현행 as-built). Supabase Storage 는 egress $0.09/GB.
// 왜 자체구현: 외부 CDN(esm.sh/npm) 의존은 배포 빌드가 CDN 장애(522)에 깨진다 — Deno 내장
//        Web Crypto 만으로 SigV4 presigned URL 을 만들어 런타임/빌드 의존을 0 으로.
// 보안(성역): R2_* 는 Edge 런타임 시크릿 전용. 클라/.env/VITE_ 노출 금지 = 릴리스 블로커
//        (SUPABASE_SERVICE_ROLE_KEY·FAL_KEY 와 동급). 프리사인 URL 만 클라로 나간다.
//
// 인터페이스(기존 Supabase Storage → R2, 배선 코드 무변경):
//   createSignedUploadUrl(path) → presignPut(key)      // 업로드: 클라가 fetch(url, PUT, body)
//   createSignedUrl(key, ttl)   → presignGet(key, ttl)  // 다운로드: 반환 {url} 동형
//   storage.download(key)       → r2Get(key)           // 서버가 직접 바이트 fetch

const enc = new TextEncoder();

// R2 시크릿 누락 시 undefined 가 서명에 coerce 되어 조용히 잘못된 URL 을 만드는 걸 막는다(명시 실패).
function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`R2 설정 누락: ${name}`);
  return v;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256hex(msg: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(msg))));
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

// AWS 는 RFC3986 인코딩(encodeURIComponent 가 안 건드리는 !*'() 도 이스케이프).
function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

// key(슬래시 경로)를 세그먼트별 인코딩 — '/' 는 보존.
function encodeKey(key: string): string {
  return key.split("/").map(rfc3986).join("/");
}

// SigV4 presigned URL (query 서명, UNSIGNED-PAYLOAD). method = "PUT" | "GET".
async function presign(method: string, key: string, expiresSec: number): Promise<string> {
  const account = env("R2_ACCOUNT_ID");
  const bucket = env("R2_BUCKET");
  const accessKey = env("R2_ACCESS_KEY_ID");
  const secretKey = env("R2_SECRET_ACCESS_KEY");
  const host = `${account}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${bucket}/${encodeKey(key)}`;

  const query: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKey}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSec)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = query
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(enc.encode("AWS4" + secretKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// 업로드용 presigned PUT URL. 클라가 fetch(url,{method:'PUT',body,headers:{'Content-Type':...}}).
export function presignPut(key: string, expiresSec = 300): Promise<string> {
  return presign("PUT", key, expiresSec);
}

// 다운로드용 presigned GET URL(짧은 TTL). 클라/외부(fal 등)가 직접 GET.
export function presignGet(key: string, expiresSec = 3600): Promise<string> {
  return presign("GET", key, expiresSec);
}

// 서버가 직접 오브젝트 바이트를 가져온다(start-dub-transcription: R2→Whisper 파일 업로드용).
export async function r2Get(key: string): Promise<Response> {
  return fetch(await presign("GET", key, 300));
}

// SSRF 방지(SEC-3): image_urls 는 create-vgen-reference-upload 가 발급한 우리 R2 presigned GET 만 허용.
// host=우리 R2 계정, 경로=/<bucket>/vgen-refs/<roomId>/... 아니면 거부 → 사설IP·메타데이터·외부호스트·타방 참조 차단.
// 검증 필터이므로 fail-closed(모든 예외=거부). roomId 는 호출부에서 isUuid 검증된 값.
export function isOwnR2RefUrl(rawUrl: unknown, roomId: string): boolean {
  if (typeof rawUrl !== "string") return false;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    if (u.hostname !== `${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`) return false;
    if (u.pathname.includes("..")) return false;
    return u.pathname.startsWith(`/${env("R2_BUCKET")}/vgen-refs/${roomId}/`);
  } catch {
    return false;
  }
}
