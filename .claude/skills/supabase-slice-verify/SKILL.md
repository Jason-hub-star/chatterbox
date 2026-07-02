---
name: supabase-slice-verify
description: ChatterBox 로컬 Supabase 슬라이스(DB 마이그레이션 + Edge Function + 프론트)를 실측하는 검증 하네스 — 통합테스트(.mjs)와 헤드리스 브라우저 E2E. functions serve 재시작·키 파일화·node_modules 심링크·kong URL 재작성·헤드리스 CDN 인터셉트 등 매번 재발견하던 환경 함정을 고정. "통합테스트/브라우저 E2E/슬라이스 실동작 검증/E2E 실증" 요청 시.
user_invocable: true
tags: [verification, supabase, e2e, testing]
trigger: "슬라이스 실동작 검증(통합테스트·브라우저 E2E)을 실행할 때"
version: 1
---

# supabase-slice-verify

DB-backed 슬라이스(DUB-04 녹음·DUB-05 합성·방 기능 등)를 **추측이 아니라 실측**으로 검증하는 하네스. 검증은 성역 — 이 스킬은 검증을 *싸게* 반복하게만 한다(낭비만 깎음). `evidence-review`가 "무엇을 돌렸고 판정이 뭔지 기록"이라면, 이 스킬은 "실제로 어떻게 돌리는가(실행 하네스)"다 — 상보적.

두 층:
1. **통합테스트** (Node `.mjs`, `templates/integration-test.mjs`) — Edge Function 계약(200/403/409/400)·상태전이·RLS를 admin/유저 클라이언트로 실측. HTTP+DB.
2. **브라우저 E2E** (헤드리스 Chrome + playwright-core, `templates/browser-e2e.mjs`) — 실 컴포넌트가 실 브라우저에서 동작하는지(MediaRecorder·ffmpeg.wasm·Storage 왕복) ground-truth.

## Use When

- Edge Function/마이그레이션/DB-backed 프론트를 새로 만들었거나 고쳐 실동작을 확인해야 할 때
- "통합테스트", "브라우저 E2E", "실제 동작 테스트해봤나", "E2E 실증" 요청 시
- 외부 API(STT 등)를 우회하고 특정 레이어만 격리 검증하고 싶을 때

## 환경 함정 (매번 여기서 시간 날림 — 반드시)

1. **functions serve는 새 함수 추가 시 재시작 필수** — `pkill -f "supabase functions serve"` 후 재기동 안 하면 신규 함수 404. (`scripts/setup-local.sh`가 처리.)
2. **키는 파일로만, 값 출력 금지** — `supabase status -o env > $SCRATCH/sb.env`. 절대 stdout으로 키 echo 안 함.
3. **`fn.env`에 `SUPABASE_*` 넣지 말 것** — serve가 자동주입하므로 충돌. `fn.env`엔 진짜 외부 시크릿만(예: `OPENAI_API_KEY`); 안 부르면 더미로 충분.
4. **scratch에 프로젝트 `node_modules` 심링크** — `.mjs`의 bare ESM import(`@supabase/supabase-js`) 해결: `ln -sfn <proj>/node_modules $SCRATCH/node_modules`.
5. **브라우저 서명 URL은 `kong:8000` 호스트** → 헤드리스 DNS 못 풂. Playwright route로 `http://kong:8000` → `http://127.0.0.1:54321` 재작성. (로컬 전용 — 배포는 정상 URL.)
6. **헤드리스 Chrome엔 외부 DNS 없음**(`ERR_NAME_NOT_RESOLVED`) — 외부 CDN 자원(예: ffmpeg.wasm 코어)은 bash(인터넷 됨)로 미리 받아 Playwright route로 로컬 파일 fulfill. **배포 코드는 CDN URL 그대로** 두고 테스트만 인터셉트 → 실 로직 검증됨.
7. **playwright-core는 `--no-save` 임시 설치, 검증 후 제거.** 시스템 Chrome을 `executablePath`로: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
8. **vite dev는 로컬 supabase로** — `VITE_SUPABASE_URL=$API_URL VITE_SUPABASE_ANON_KEY=$ANON_KEY npm run dev -- --port <p>`. 브라우저 부팅+작업이 bash 2분 기본을 넘으니 Bash `timeout`을 넉넉히.
9. **외부 API 우회** — 세션을 admin(service_role)으로 목표 상태(예: recording+synced)로 직접 시드 → 대상 레이어만 검증. `admin.storage.from(bucket).upload(path, buf)`로 실 파일 시드.
10. **미디어는 합법 합성으로** — `ffmpeg -f lavfi ...`·`say`. 저작권 자료 다운로드 금지.

## Steps

1. **셋업:** `bash .claude/skills/supabase-slice-verify/scripts/setup-local.sh $SCRATCH` (스택 미기동이면 `supabase start` 먼저).
2. **통합테스트:** `templates/integration-test.mjs`를 scratch로 복사·수정(셋업/시드 + 200/403/409·상태전이·RLS 단언). 실행: `set -a; . $SCRATCH/sb.env; set +a; export SUPABASE_URL="$API_URL"; cd $SCRATCH && node <test>.mjs`.
3. **브라우저 E2E(필요 시):** `npm install --no-save playwright-core`; vite dev 기동; `templates/browser-e2e.mjs` 복사·수정(kong 재작성 필수, 외부 CDN 쓰면 인터셉트 추가); 산출물은 `ffprobe` 등으로 실측.
4. **게이트:** `npm run type-check && npm run lint && npm run test && npm run build && npm run docs:check`.
5. **정리:** `pkill -f "supabase functions serve"; pkill -f vite`; `npm remove --no-save playwright-core`; 임시 자산 삭제. (로컬 스택은 남겨도 됨.) 결과는 `evidence-review`로 기록.

## Verify

- 각 검증 명령이 이번 세션에서 실제로 실행됐다(터미널 출력 근거). 안 돌린 걸 "통과"로 적지 않는다.
- PASS/FAIL 수를 사실로 보고하고, ground-truth 근거(ffprobe 출력·DB 상태·바이트 수)를 남긴다.
- `package.json`에 playwright가 남지 않았다(`--no-save` + 제거 확인).

## Failure / Fallback

- serve가 신규 함수를 404 → 재시작(함정 1) 안 한 것. pkill 후 재기동.
- 브라우저가 서명 URL/CDN에서 `ERR_NAME_NOT_RESOLVED` → 함정 5·6의 route 인터셉트 누락.
- `.mjs`가 `ERR_MODULE_NOT_FOUND` → node_modules 심링크(함정 4) 누락.
- 실동작 검증이 불가하면 완료 선언 대신 `evidence-review`에서 `not-ready`로 남긴다.

## 참고
- Edge Function 관례: `_shared/supa.ts`(`cors·json·getAppUser·isUuid·serviceClient`). 호스트 검증은 `dub_sessions → rooms(host_id)` 조인. 쓰기는 service_role 전용.
- 성공 사례: 슬라이스1(22/22+4/4)·슬라이스2(18/18+실브라우저 9/9)·슬라이스3a(20/20+실 ffmpeg E2E 10/10).
