---
name: supabase-slice-verify
description: ChatterBox Supabase 슬라이스(DB 마이그레이션 + Edge Function + 프론트)를 로컬/배포판에서 실측하는 검증 하네스 — 통합테스트(.mjs)와 헤드리스 브라우저 E2E. functions serve 재시작·키 파일화·node_modules 심링크·kong URL 재작성·헤드리스 CDN 인터셉트 등 매번 재발견하던 환경 함정을 고정. 배포판(BASE) 2탭 E2E·seed-and-drive(DB 시드→UI 액션→폴링→ffprobe) 템플릿 포함. "통합테스트/브라우저 E2E/슬라이스 실동작 검증/E2E 실증/배포판 테스트" 요청 시.
user_invocable: true
tags: [verification, supabase, e2e, testing]
trigger: "슬라이스 실동작 검증(통합테스트·브라우저 E2E·배포판 테스트)을 실행할 때"
version: 2
---

# supabase-slice-verify

DB-backed 슬라이스(DUB-04 녹음·DUB-05 합성·방 기능 등)를 **추측이 아니라 실측**으로 검증하는 하네스. 검증은 성역 — 이 스킬은 검증을 *싸게* 반복하게만 한다(낭비만 깎음). `evidence-review`가 "무엇을 돌렸고 판정이 뭔지 기록"이라면, 이 스킬은 "실제로 어떻게 돌리는가(실행 하네스)"다 — 상보적.

두 층:
1. **통합테스트** (Node `.mjs`, `templates/integration-test.mjs`) — Edge Function 계약(200/403/409/400)·상태전이·RLS를 admin/유저 클라이언트로 실측. HTTP+DB.
2. **브라우저 E2E** (헤드리스 Chrome + playwright-core) — 실 컴포넌트가 실 브라우저에서 동작하는지(MediaRecorder·ffmpeg.wasm·Storage 왕복) ground-truth. 템플릿 4종:
   - `browser-e2e.mjs` — 단일탭·로컬(kong/CDN 인터셉트)
   - `room-2tab-e2e.mjs` — 2탭 스켈레톤(단언부 비움)
   - `deployed-room-e2e.mjs` — **배포판**(`BASE`) 2탭·단언 채움(인증게이트·프레즌스·아바타·채팅·CDN·콘솔)
   - `seed-drive-composite-e2e.mjs` — **seed-and-drive**: DB 시드→[합성] 클릭→완료 폴링→산출물 ffprobe(전체 파이프라인 재구동 없이 특정 상태만 검증)

## Use When

- Edge Function/마이그레이션/DB-backed 프론트를 새로 만들었거나 고쳐 실동작을 확인해야 할 때
- "통합테스트", "브라우저 E2E", "실제 동작 테스트해봤나", "E2E 실증" 요청 시
- 외부 API(STT 등)를 우회하고 특정 레이어만 격리 검증하고 싶을 때

## 환경 함정 (매번 여기서 시간 날림 — 반드시)

1. **functions serve는 새 함수 추가 시 재시작 필수** — `pkill -f "supabase functions serve"` 후 재기동 안 하면 신규 함수 404. (`scripts/setup-local.sh`가 처리.)
2. **키는 파일로만, 값 출력 금지** — `supabase status -o env > $SCRATCH/sb.env`. 절대 stdout으로 키 echo 안 함.
3. **`fn.env`에 `SUPABASE_*` 넣지 말 것** — serve가 자동주입하므로 충돌. `fn.env`엔 진짜 외부 시크릿만(예: `OPENAI_API_KEY`); 안 부르면 더미로 충분.
4. **scratch에 프로젝트 `node_modules` 심링크** — `.mjs`의 bare ESM import(`@supabase/supabase-js`) 해결: `ln -sfn <proj>/node_modules $SCRATCH/node_modules`. **주의: scratch에서 `npm i`(예: playwright-core) 하면 심링크가 실폴더로 덮여 모듈 분리(→ `ERR_MODULE_NOT_FOUND`).** playwright-core 는 scratch 말고 **프로젝트 node_modules**에 넣는다: `(cd <proj> && npm i playwright-core --no-save --no-package-lock)` → 심링크 복구 `rm -rf $SCRATCH/node_modules && ln -sfn <proj>/node_modules $SCRATCH/node_modules`. `node -e "require.resolve('@supabase/supabase-js'); require.resolve('playwright-core')"`로 둘 다 확인·`git status`로 package-lock 불변 확인.
5. **브라우저 서명 URL은 `kong:8000` 호스트** → 헤드리스 DNS 못 풂. Playwright route로 `http://kong:8000` → `http://127.0.0.1:54321` 재작성. (로컬 전용 — 배포는 정상 URL.)
6. **헤드리스 Chrome엔 외부 DNS 없음**(`ERR_NAME_NOT_RESOLVED`) — 외부 CDN 자원(예: ffmpeg.wasm 코어)은 bash(인터넷 됨)로 미리 받아 Playwright route로 로컬 파일 fulfill. **배포 코드는 CDN URL 그대로** 두고 테스트만 인터셉트 → 실 로직 검증됨.
7. **playwright-core는 `--no-save --no-package-lock`로 프로젝트 node_modules에 설치(scratch 아님·함정4), 검증 후 제거.** 시스템 Chrome은 `chromium.launch({ channel: 'chrome', headless: true })`(브라우저 다운로드 0). WebGL: `args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']`, 미디어: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.
8. **vite dev는 로컬 supabase로** — `VITE_SUPABASE_URL=$API_URL VITE_SUPABASE_ANON_KEY=$ANON_KEY npm run dev -- --port <p>`. 브라우저 부팅+작업이 bash 2분 기본을 넘으니 Bash `timeout`을 넉넉히.
9. **외부 API 우회 / 상태 시드** — 세션을 admin(service_role)으로 목표 상태(예: recording+synced)로 직접 시드 → 대상 레이어만 검증. `admin.storage.from(bucket).upload(path, buf)`로 실 파일 시드. 그 상태에서 실 UI 흐름을 이어가려면 `seed-drive-composite-e2e.mjs` 패턴(시드→클릭→폴링→ffprobe).
10. **미디어는 합법 합성으로** — `ffmpeg -f lavfi ...`·`say`. 저작권 자료 다운로드 금지.
11. **2탭 룸 E2E: StrictMode 조인 경쟁** — dev StrictMode가 조인 effect를 2번 발화 → fresh 조인이 slot 인서트 경쟁 → 한쪽 `409`로 입장 실패(A는 create-room으로 slot0 보유라 무경쟁). **두 계정을 서버측에서 미리 join**시켜 브라우저는 rejoin만 하게. (`templates/room-2tab-e2e.mjs`가 처리.)
12. **2탭은 페이지가 무거워 playwright 액션 타임아웃** — MediaPipe+아바타 2탭이라 `selectOption`/`click` 액션어빌리티가 30s 타임아웃. **DOM 직접(`page.evaluate`)** 으로 조작·판독(값 set + `change` dispatch, textContent 읽기).
13. **reliable DataChannel 첫 메시지 유실** — reliable 채널이 첫 `publishData`로 개설되며 그 메시지 유실(=모든 세션 첫 액션 유실). 앱이 연결/입장 시 현재 상태 **재브로드캐스트**하거나, 테스트는 첫 액션 전 2~3s warm-up + 넉넉한 timeout(~25s). LiveKit 클라우드 연결이라 배포된 백엔드 대상이 편함.
14. **배포판 E2E는 `BASE=<배포 URL>`로 로컬 dev 불필요** — 프로덕션 프론트+백엔드 실검증. 실 HTTPS·CDN 정상이라 kong 재작성(함정5)·CDN 인터셉트(함정6) **불요**. 백엔드가 프로덕션이므로 시드/정리도 프로덕션 DB에 함(테스트 방·객체는 반드시 `finally`에서 삭제). `templates/deployed-room-e2e.mjs`.
15. **supabase 쿼리빌더는 네이티브 Promise 아님** — `admin.from(t).delete().eq(...).catch(...)` 는 `catch is not a function`으로 터짐(정리 코드에서 자주 밟음). `await`로 받거나 `try/catch`로 감싼다.
16. **새 마이그레이션은 serve 재기동만으론 안 걸림** — `setup-local.sh`(함정1)는 functions serve만 재시작하지, 새 컬럼/테이블 마이그를 로컬 DB에 적용하진 않는다. 스키마를 바꿨으면 `supabase migration up` + **PostgREST 스키마 캐시 리로드**(`psql "$DB_URL" -c "NOTIFY pgrst, 'reload schema';"`) 필수. 안 하면 `Could not find the 'X' column of 'T' in the schema cache` 로 500(serve 재기동으론 안 낫는다). `DB_URL` 은 `sb.env` 에 있음.
17. **실 외부 LLM/API 왕복 검증은 `fn.env` 더미를 실키로 교체** — 함정3은 "안 부르면 더미로 충분"인데, 실제 번역/STT 응답을 검증하려면 `.env` 실키를 `fn.env` 에 써서(값 stdout 금지: `printf 'OPENAI_API_KEY=%s\n' "$KEY" > $SCRATCH/fn.env`) serve 재기동. **검증 끝나면 반드시 더미(`sk-dummy-not-used`)로 복구** — scratch 에 실키 잔존 금지(성역).

## Steps

1. **셋업:** `bash .claude/skills/supabase-slice-verify/scripts/setup-local.sh $SCRATCH` (스택 미기동이면 `supabase start` 먼저).
2. **통합테스트:** `templates/integration-test.mjs`를 scratch로 복사·수정(셋업/시드 + 200/403/409·상태전이·RLS 단언). 실행: `set -a; . $SCRATCH/sb.env; set +a; export SUPABASE_URL="$API_URL"; cd $SCRATCH && node <test>.mjs`.
3. **브라우저 E2E(필요 시):** playwright-core를 **프로젝트** node_modules에 `--no-save --no-package-lock` 설치(함정4·7); 로컬은 vite dev 기동, **배포판은 `BASE=<URL>`**(dev 불필요); 산출물은 `ffprobe`로 실측.
   - **단일 탭**(로컬 Storage·ffmpeg.wasm·미디어): `templates/browser-e2e.mjs`(kong 재작성·CDN 인터셉트).
   - **2탭 실시간 룸**(DataChannel 동기·참가자별 렌더·호스트 권한): `templates/room-2tab-e2e.mjs`(스켈레톤) 또는 `templates/deployed-room-e2e.mjs`(배포판·단언 채움, 함정 11~14).
   - **seed-and-drive**(이전 파이프라인 상태가 필요한 UI — 합성·완성본 등): `templates/seed-drive-composite-e2e.mjs`(시드→UI 액션→DB 폴링→ffprobe).
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
- 성공 사례: 슬라이스1(22/22+4/4)·슬라이스2(18/18+실브라우저 9/9)·슬라이스3a(20/20+실 ffmpeg E2E 10/10)·아바타선택(10/10)·**대본 텔레프롬프터 2탭 룸 E2E 12/12**·blendshape 멀티플레이어(B3)·**DUB-05 3b(배포 라이브 5/5)·배포판 2탭 E2E 14/14(3b 풀 클릭스루 seed-drive 5 포함)**·**DUB-06 대본 자동번역 통합 9/9(실 gpt-4o-mini JP→KR·마이그 up 후)**.
