/**
 * YouTube OAuth2 Setup — refresh token 발급 + .env.local 저장 + 연결 테스트.
 *
 * 사용법:
 *   npm run youtube:setup
 *
 * 사전 조건 (주인님이 직접):
 *   1. Google Cloud Console → 프로젝트 생성
 *   2. YouTube Data API v3 활성화
 *   3. OAuth 2.0 Client ID 생성 (Desktop app)
 *   4. Client ID + Client Secret 복사
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../../../");
const ENV_LOCAL_PATH = path.join(PROJECT_ROOT, ".env.local");

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

const REDIRECT_PORT = 8976;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function openBrowser(url: string) {
  const platform = process.platform;
  try {
    if (platform === "darwin") execSync(`open "${url}"`);
    else if (platform === "win32") execSync(`start "" "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch {
    console.log(`\n브라우저에서 직접 열어주세요:\n${url}\n`);
  }
}

function appendToEnvLocal(key: string, value: string) {
  let content = "";
  if (existsSync(ENV_LOCAL_PATH)) {
    content = readFileSync(ENV_LOCAL_PATH, "utf-8");
  }

  // 기존 값 교체 또는 추가
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }

  writeFileSync(ENV_LOCAL_PATH, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`
═══════════════════════════════════════════════════
  YouTube OAuth2 Setup
═══════════════════════════════════════════════════
`);

// CLI 인자: JSON 파일 경로 또는 --client-id / --client-secret
const cliArgs = process.argv.slice(2);
let clientId = "";
let clientSecret = "";

// 1) JSON 파일 경로가 주어진 경우 (Google Cloud 다운로드 파일)
const jsonArg = cliArgs.find((a) => a.endsWith(".json"));
if (jsonArg) {
  try {
    const raw = JSON.parse(readFileSync(jsonArg, "utf-8")) as {
      installed?: { client_id?: string; client_secret?: string };
      web?: { client_id?: string; client_secret?: string };
    };
    const creds = raw.installed ?? raw.web;
    clientId = creds?.client_id ?? "";
    clientSecret = creds?.client_secret ?? "";
    console.log(`📄 JSON에서 credentials 로드: ${jsonArg}`);
  } catch (err) {
    console.error(`JSON 파일 읽기 실패: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

// 2) 인터랙티브 입력 (JSON 없을 때)
if (!clientId) {
  console.log("사전 조건:");
  console.log("  1. Google Cloud Console → YouTube Data API v3 활성화");
  console.log("  2. OAuth 2.0 Client ID 생성 (Desktop app)");
  console.log("  3. Client ID + Client Secret 준비\n");
  clientId = await ask("🔑 YouTube Client ID: ");
}
if (!clientSecret) {
  clientSecret = await ask("🔒 YouTube Client Secret: ");
}

if (!clientId || !clientSecret) {
  console.error("Client ID와 Client Secret이 모두 필요합니다.");
  console.error("사용법: npm run youtube:setup -- /path/to/client_secret.json");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 1: 브라우저로 인증 페이지 열기 + 콜백 서버 시작
// ---------------------------------------------------------------------------

console.log("\n📡 로컬 콜백 서버 시작...");

const authCode = await new Promise<string>((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>❌ 인증 실패</h1><p>${error}</p><p>이 탭을 닫아주세요.</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>✅ 인증 성공!</h1><p>이 탭을 닫고 터미널로 돌아가주세요.</p>`);
        server.close();
        resolve(code);
        return;
      }
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(REDIRECT_PORT, () => {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
      }).toString();

    console.log("\n🌐 브라우저에서 Google 로그인 페이지를 엽니다...\n");
    openBrowser(authUrl);
  });

  // 2분 타임아웃
  setTimeout(() => {
    server.close();
    reject(new Error("인증 타임아웃 (2분). 다시 실행해주세요."));
  }, 120_000);
});

console.log("\n✅ Auth code 수신 완료. Token 교환 중...");

// ---------------------------------------------------------------------------
// Step 2: Auth code → refresh token 교환
// ---------------------------------------------------------------------------

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: authCode,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  }),
});

if (!tokenResponse.ok) {
  const text = await tokenResponse.text();
  console.error(`\n❌ Token 교환 실패 (${tokenResponse.status}): ${text}`);
  process.exit(1);
}

const tokenData = (await tokenResponse.json()) as {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
};

if (!tokenData.refresh_token) {
  console.error("\n❌ refresh_token이 반환되지 않았습니다.");
  console.error("   → Google Cloud Console에서 해당 앱의 접근 권한을 해제한 후 다시 시도해주세요:");
  console.error("     https://myaccount.google.com/permissions");
  process.exit(1);
}

console.log("\n✅ Token 교환 성공!");

// ---------------------------------------------------------------------------
// Step 3: .env.local에 저장
// ---------------------------------------------------------------------------

appendToEnvLocal("YOUTUBE_CLIENT_ID", clientId);
appendToEnvLocal("YOUTUBE_CLIENT_SECRET", clientSecret);
appendToEnvLocal("YOUTUBE_REFRESH_TOKEN", tokenData.refresh_token);

console.log(`\n💾 .env.local에 저장 완료: ${ENV_LOCAL_PATH}`);
console.log("   YOUTUBE_CLIENT_ID=***");
console.log("   YOUTUBE_CLIENT_SECRET=***");
console.log("   YOUTUBE_REFRESH_TOKEN=***");

// ---------------------------------------------------------------------------
// Step 4: 연결 테스트 (채널 정보 조회)
// ---------------------------------------------------------------------------

console.log("\n🧪 연결 테스트 — YouTube 채널 정보 조회...");

const testResponse = await fetch(
  `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`,
  {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  },
);

if (testResponse.ok) {
  const data = (await testResponse.json()) as {
    items?: Array<{ snippet: { title: string; customUrl?: string } }>;
  };
  const channel = data.items?.[0]?.snippet;
  if (channel) {
    console.log(`\n✅ 연결 확인!`);
    console.log(`   채널명: ${channel.title}`);
    if (channel.customUrl) console.log(`   URL: youtube.com/${channel.customUrl}`);
  } else {
    console.log("\n⚠️ 채널 정보를 찾을 수 없습니다. 토큰은 유효합니다.");
  }
} else {
  const text = await testResponse.text();
  console.warn(`\n⚠️ 테스트 실패 (${testResponse.status}): ${text}`);
  console.log("   토큰 저장은 완료됐습니다. API가 활성화됐는지 확인해주세요.");
}

console.log(`
═══════════════════════════════════════════════════
  설정 완료!
═══════════════════════════════════════════════════

다음 단계:
  1. npm run publish:channels <brief-slug>
     → YouTube에 비공개(private)로 자동 업로드됩니다
  2. YouTube Studio에서 내용 확인 후 "공개" 전환
  3. 끝! (Telegram 경유 불필요)

테스트:
  npm run publish:channels <brief-slug> --dry-run
`);
