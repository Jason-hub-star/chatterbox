---
name: cf-pages-deploy-verify
description: ChatterBox 프론트(Vite SPA)를 Cloudflare Pages 에 배포하고 실렌더로 검증하는 하네스 — 2계정 non-interactive 선택·프로젝트 선생성·account_id env 전용·번들 비밀키 감사·SPA폴백·헤드리스 React 마운트 확인 등 매번 재발견하던 CF 배포 함정을 고정. "CF 배포/프론트 배포/pages 배포/배포판 검증/재배포/ㄱ 배포" 요청 시.
user_invocable: true
tags: [deploy, cloudflare, pages, frontend, verification]
trigger: "Vite SPA 를 Cloudflare Pages 에 배포·검증할 때"
version: 1
---

# cf-pages-deploy-verify

Vite SPA(ChatterBox 앱)를 Cloudflare Pages 에 **추측 없이** 올리고 **실렌더로 검증**하는 하네스. `vercel-deploy-verify`의 CF판 — Vercel(랜딩)과 별개로 앱 SPA는 CF Pages 에 산다. SSOT: `docs/ops/DEPLOY-PLATFORM.md`.

백엔드(Supabase Edge·LiveKit)는 이미 프로덕션이므로, 프론트만 올리면 **완전 기능 동작**(앱은 `livekit-token` 응답 `server_url` 로 LiveKit 연결). 검증은 성역 — 이 스킬은 배포를 *싸게 안전하게* 반복하게만 한다.

## Use When

- 프론트(dist)를 CF Pages 에 처음/재배포할 때
- "배포판이 실제로 뜨는지" 실렌더 확인이 필요할 때
- Edge Function 배포 후 클라이언트를 갱신 배포할 때(순서: Edge → SPA)

## Preconditions (사람만 가능 — 1회)

- **wrangler 인증**: 사용자가 `! npx wrangler login`(OAuth, `~/.wrangler` 캐시). 에이전트가 대신 못 함.
- CF 계정. 값은 `.env` 아님 — OAuth 캐시.

## 고정된 함정 (매번 재발견하던 것)

1. **다계정 non-interactive 실패**: `wrangler`가 계정 2개면 non-interactive 에서 "unable to select" 에러. → **`CLOUDFLARE_ACCOUNT_ID` env 로 전달**. 에러 메시지가 `<name>: <id>` 목록을 뱉으니 사용자 이메일과 일치하는 id 선택. (ChatterBox: gmdqn2tp = `276b9380f073c8007ba2d3d41b2c6703`.)
2. **Pages 설정파일은 `account_id` 키 거부**: `wrangler.toml`에 `account_id` 넣으면 "Configuration file for Pages projects does not support account_id". → toml 엔 넣지 말고 **env 로만**.
3. **프로젝트 선생성 필수**: 첫 배포 전 `wrangler pages project create <name> --production-branch=main`. 없으면 deploy 가 "project does not exist"로 실패.
4. **dirty tree 프롬프트**: `--commit-dirty=true` 로 회피.
5. **VITE_ 변수는 빌드타임에 dist 로 구움** — pre-built dist 배포엔 CF env vars 불필요. `wrangler.toml` [vars] 도 불필요.
6. **SPA 폴백 자동** — CF Pages 는 `_redirects`/`_routes.json` 없이 딥링크→index.html 폴백(단 `functions/` 디렉토리 쓸 때만 `_routes.json` 필요, ChatterBox 해당없음).

## Steps

### 1. 빌드
```bash
npm run build   # → dist/
```

### 2. 🔒 번들 비밀키 감사 (릴리스 블로커 — 성역)
`dist/`에 서버 전용 키가 새면 **배포 중단**. 값은 출력하지 말고 파일존재만.
```bash
val(){ grep "^$1=" .env | head -1 | sed "s/^$1=//; s/^['\"]//; s/['\"]\$//" | tr -d '\r'; }
for v in SUPABASE_SERVICE_ROLE_KEY FAL_KEY OPENAI_API_KEY SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD LIVEKIT_API_SECRET; do
  x=$(val "$v"); [ -z "$x" ] && continue
  grep -rlF "$x" dist/ >/dev/null 2>&1 && echo "❌ LEAK: $v" || echo "✅ clean: $v"
done
grep -rl 'service_role' dist/ >/dev/null 2>&1 && echo "❌ service_role 문자열" || echo "✅ service_role 없음"
# anon key + supabase url 은 있어야 정상(공개키).
```
`VITE_` 접두사 아닌 서버키가 하나라도 dist 에 있으면 STOP → 코드에서 `import.meta.env.VITE_*` 오용 추적.

### 3. Edge Functions 먼저 (API 선행)
```bash
export SUPABASE_ACCESS_TOKEN=$(val SUPABASE_ACCESS_TOKEN)
supabase functions deploy <fn> --project-ref owfcrolbvikkqrotmleq   # 필요 함수만
```

### 4. SPA 배포
```bash
export CLOUDFLARE_ACCOUNT_ID=276b9380f073c8007ba2d3d41b2c6703   # gmdqn2tp
# 최초 1회만:
npx wrangler pages project create chatterbox --production-branch=main
# 매 배포:
npx wrangler pages deploy dist --project-name chatterbox --commit-dirty=true
# → https://chatterbox-7r8.pages.dev (프로덕션 별칭) + <hash>.chatterbox-7r8.pages.dev
```

### 5. ✅ 검증 (실렌더 게이트)
**A. 서빙 구조**(curl):
```bash
U=https://chatterbox-7r8.pages.dev
curl -sS -o /dev/null -w "root=%{http_code}\n" "$U/"                      # 200
html=$(curl -sS "$U/"); echo "$html" | grep -oE '<div id="root">|/assets/[^"]+\.(js|css)' | head
asset=$(echo "$html" | grep -oE '/assets/[^"]+\.js' | head -1); curl -sS -o /dev/null -w "asset=%{http_code}\n" "$U$asset"  # 200
curl -sS -o /dev/null -w "deep=%{http_code}\n" "$U/rooms/x-nonexistent"   # 200 (SPA 폴백)
```
**B. 실 부팅**(헤드리스 시스템 Chrome — `templates/render-check.mjs`): React 마운트(`#root` 자식>0)·**콘솔에러 0**·랜딩 렌더·스크린샷 육안. `chromium.launch({channel:'chrome', headless:true})`.

## Verify (완료 체크)

- [ ] `npm run build` 성공
- [ ] 번들 비밀키 감사: 서버키 0, anon+url 만
- [ ] deploy 성공 + URL 반환
- [ ] curl: root/asset/deep 전부 200
- [ ] 헤드리스: React 마운트·콘솔에러 0·스크린샷 확인
- [ ] (선택) 2탭 룸 E2E(`supabase-slice-verify` 의 `room-2tab-e2e.mjs` 를 `BASE=<배포URL>`로) — 로그인·입장·DataChannel·아바타

## Failure / Fallback

- "unable to select account" → `CLOUDFLARE_ACCOUNT_ID` env (함정1).
- "does not support account_id" → toml 에서 제거 (함정2).
- "project does not exist" → `pages project create` (함정3).
- 헤드리스 콘솔에러/흰화면 → 프로덕션 빌드 특이(env 미주입·base 경로·모듈). dev 는 되는데 prod 만 깨지면 `import.meta.env` 미정의 변수부터.
- 진짜 자물쇠(로그인 게이트) 필요 → Cloudflare Access(무료 Zero Trust), 별도.

## 관련

- `docs/ops/DEPLOY-PLATFORM.md` — 배포 SSOT(릴리스 블로커·CI/CD Actions)
- `supabase-slice-verify` — 2탭 룸 E2E 템플릿·Edge Function 통합테스트(상보)
- 메모리 `frontend-cf-pages-deploy` — URL·계정·재배포 명령
