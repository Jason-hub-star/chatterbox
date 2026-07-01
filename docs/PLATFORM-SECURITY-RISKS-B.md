---
tags: [guide]
---

<!--
  2026-06-26 - PLATFORM-ARCHITECTURE-B 스택의 개발 리스크·보안·취약점 동반 문서.
  수집: Haiku 서브에이전트 6종 병렬 웹조사. 판정·종합: Opus(메인).
  주의: CVE ID는 Haiku 수집 후 Opus가 NVD/GitHub Advisory로 4건 실재 검증함(§4, 2026-06-26). 버전·적용범위는 배포 시점 `npm audit`로 최종 확인.
-->

# PLATFORM-SECURITY-RISKS-B — Vite SPA 스택 리스크·보안 점검

> **짝 문서:** [[PLATFORM-ARCHITECTURE]] (스택 결정), [[PLATFORM-RESEARCH-SYNC]] (조사 SSOT).
> **대상 스택:** Vite 6 · React 19 · TS 5.7 · Tailwind 4 · motion v12 · LiveKit · MediaPipe(tasks-vision) · PixiJS v8 · Supabase · Cloudflare Pages.
> Updated: 2026-06-26

---

## 0. 결론 먼저 (BLUF) — 개발 전 못 박을 5개 지뢰

| # | 지뢰 | 한 줄 판정 | 어디서 터지나 |
|---|---|---|---|
| **L1** | **MediaPipe SharedArrayBuffer ↔ COOP/COEP ↔ 서드파티 충돌** | 교차격리(cross-origin isolation)를 켜면 LiveKit·Supabase·CDN·Google WASM 로딩이 깨질 수 있다. **"SAB가 정말 필요한가"를 Phase 1 PoC에서 먼저 판정**하라. 안 쓰면 이 지뢰 자체가 사라진다. | 배포 후 트래킹/실시간 동시 사용 시 |
| **L2** | **클라이언트 번들 = 전부 공개** | LiveKit `API_SECRET`, Supabase `service_role`은 **절대 번들에 넣지 말 것**. 토큰 발급은 Edge Function/Worker 서버측. Supabase `anon` 키는 공개돼도 되지만 **RLS가 켜져 있어야만** 안전. | 시크릿 유출·DB 전체 노출 |
| **L3** | **Supabase RLS 미설정** | Supabase 사고의 ~83%가 RLS 누락. anon 키로 테이블 전체 read/write 가능해진다(CVE-2025-48757, 170+ 앱 노출). **모든 테이블 RLS 활성 + SELECT 정책 명시**. | 가입 직후 전 유저 데이터 노출 |
| **L4** | **6인 동시 렌더 = WebGL 컨텍스트 한계** | Application 6개 = WebGL 컨텍스트 6개. 브라우저 한계 ~8(Firefox/Safari)~16(Chrome). **단일 Application + RenderTexture 6개** 구조로 가야 함. | 5~6인 방에서 컨텍스트 손실 |
| **L5** | **Vite dev 서버 임의 파일 읽기 CVE** | CVE-2025-30208/31125 등 — `--host`로 dev 서버를 네트워크에 노출하면 임의 파일 읽힘. **Vite 6.2.x+ 고정**, dev 서버 외부 노출 금지. 운영(정적 빌드)은 무관. | 개발 중 LAN 노출 시 |

---

## 1. 통합 보안 원칙 — "SPA는 비밀을 못 지킨다"

정적 SPA는 `dist/`에 들어간 모든 JS·env가 브라우저로 공개된다. 따라서:

- **공개돼도 되는 것** (번들 OK): Supabase `anon`(=publishable) 키, LiveKit **URL**, `VITE_` 접두 환경변수 전부. 단 보안은 키가 아니라 **RLS·토큰 권한(grant)**이 책임진다.
- **절대 번들 금지**: LiveKit `API_KEY`/`API_SECRET`, Supabase `service_role`(=secret) 키, OAuth client secret, 결제·관리 키. → **Cloudflare Worker 또는 Supabase Edge Function**에서만 사용.
- **흐름:** 클라이언트 → (Supabase JWT로 본인 인증) → Edge Function → LiveKit 토큰 서명(API_SECRET) → 클라이언트로 단기 토큰만 반환.

> `VITE_` 접두 환경변수는 **빌드 시 번들에 박제**된다. 시크릿을 `VITE_`로 넣으면 그대로 공개. (Cloudflare Pages env에서도 동일 — Worker secret과 빌드 var를 분리할 것.)

---

## 2. 치명적 교차 이슈 (L1 상세) — COOP/COEP × MediaPipe × 서드파티

이 스택에서 **유일하게 아키텍처를 바꿀 수 있는** 충돌이라 따로 뺀다.

### 2.1 인과 사슬

```
MediaPipe 멀티스레드/특정 WASM 빌드  →  SharedArrayBuffer 필요
SharedArrayBuffer  →  교차격리(cross-origin isolated) 문서여야 함 (Chrome 92+ 정책)
교차격리  →  COOP: same-origin  +  COEP: require-corp  헤더 필요
COEP: require-corp  →  CORP/CORS 헤더 없는 서드파티 리소스 전부 차단
   ↘ LiveKit, Supabase, CDN 비디오(R2), Google MediaPipe WASM/모델 로딩이 깨질 수 있음
```

### 2.2 판정 — 먼저 "SAB가 필요한가"를 검증하라 (가장 중요)

**미니멀 판단:** FaceLandmarker의 **GPU delegate는 WebGL(메인스레드)** 로 도는 경로라 SharedArrayBuffer 없이도 동작하는 경우가 많다. MediaPipe wasm은 **멀티스레드(SIMD+threads)·싱글스레드 변종을 자동 선택** — 교차격리가 없으면 싱글스레드로 폴백해 **느려질 뿐 동작은 한다(SAB는 성능 최적화이지 하드 요구가 아님).** [Opus 검증 2026-06-26] 즉 **교차격리 없이 30fps가 나오면 L1 지뢰 전체가 사라진다.** 격리는 fps가 모자랄 때만 켠다.

→ **Phase 1 PoC 필수 측정:** ① 교차격리 OFF 상태에서 GPU delegate FaceLandmarker fps, ② 그게 부족할 때만 교차격리 ON(+SAB) 검토. **교차격리는 비용(서드파티 깨짐)이 크므로 최후수단.**

### 2.3 SAB가 정말 필요하다면 — 완화책 (우선순위 순)

1. **COEP `credentialless`** 사용 (`require-corp` 대신). CORP 없는 공개 리소스도 로드되되 쿠키/인증정보가 제거됨. **Chromium·Firefox 지원, Safari 미지원(애플 구현계획 없음)** [Opus 검증 2026-06-26 — caniuse] → Safari 사용자에겐 교차격리 불가 → 트래킹 비활성(뷰어 모드)로 폴백.
2. 내가 통제하는 리소스(R2 CDN, 자체 호스팅 WASM)엔 `Cross-Origin-Resource-Policy: cross-origin` 헤더 부착.
3. MediaPipe `.wasm`/`.task` 모델을 **자체 호스팅**(Cloudflare에 동봉)해서 CORP 통제권 확보. (jsdelivr/googleapis 직접 로드보다 격리 환경에서 안전.)
4. `<script crossorigin="anonymous">` / `<img crossorigin>` 로 CORS 가능한 리소스 보정.

### 2.4 추가 주의 — "Worker에서 GPU delegate" 모순

ARCHITECTURE-B §5.2는 "MediaPipe를 Web Worker에서 실행"이라 적었지만, **WebGL(GPU delegate)은 메인스레드 전용**이다. Worker에서 돌리려면 CPU delegate(느림) 또는 OffscreenCanvas 경로를 써야 한다. → Phase 1에서 "메인스레드 GPU vs Worker CPU" 중 실측으로 택일.

참고: [web.dev COOP/COEP](https://web.dev/articles/coop-coep) · [why cross-origin isolation](https://web.dev/articles/why-coop-coep) · [MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)

---

## 3. 스택별 리스크

각 항목: **깨지는 지점 / 보안·CVE / 링크**. CVE는 §4 표에 모아 두고 여기선 영향만.

### 3.1 빌드·프론트 (Vite 6 / React 19 / TS 5.7 / Tailwind 4 / motion v12 / react-router 7)

**깨지는 지점 (마이그레이션):**
- **React 19:** `forwardRef` **deprecated(제거 아님 — 19에서 여전히 동작, 향후 버전서 제거 예정)** → 함수 컴포넌트가 `ref`를 prop으로 직접 받음. [Opus 검증 2026-06-26] 일부 구버전 라이브러리 비호환. 코드모드: `npx types-react-codemod@latest preset-19 ./src`. StrictMode 테스트 동작이 18과 다름.
- **Tailwind 4:** JS config → CSS `@theme` 블록, `@tailwind` 지시어 → `@import "tailwindcss"`. 업그레이드 도구 `npx @tailwindcss/upgrade`. **모던 브라우저 전용**(Safari 16.4+ 등) — 구형 지원 필요하면 4 금지.
- **Tailwind 4 + Vite 알려진 버그:** 첫 로드에서 스타일 누락 → 새로고침하면 나타남. HMR/소스 감지 이슈. Phase 0에서 반드시 재현 테스트.
- **motion v12:** import 경로만 `"framer-motion"` → `"motion/react"`. API 호환 양호(저위험).
- **react-router 7:** `useLoaderData` 타이핑 변경. (SSR 안 쓰는 SPA라 로더 타이밍 이슈는 대부분 회피됨.)
- **Vite top-level await:** 모듈 최상위 `await app.init()`가 일부 빌드에서 깨짐 → `async main(){...}; main()` 패턴으로.

**보안:** Vite **dev 서버** CVE 군집(2025) — `@fs` 경로 우회 임의 파일 읽기. esbuild dev 서버 CORS 취약점. **모두 dev 서버 노출 시에만** 위험, 운영 정적 빌드는 무관. → Vite 6.2.x+ 고정, `server.host` 외부 노출 금지.

링크: [Vite migration](https://vite.dev/guide/migration) · [React 19 upgrade](https://react.dev/blog/2024/04/25/react-19-upgrade-guide) · [Tailwind v4 upgrade](https://tailwindcss.com/docs/upgrade-guide) · [motion](https://motion.dev/docs/react)

### 3.2 LiveKit (`livekit-client`, `@livekit/components-react`)

**깨지는 지점:**
- **토큰은 100% 서버 발급** (HS256 JWT, `API_SECRET` 서명). grant(room/publish/admin)·TTL(권장 30~60분, 권한 변경 잦으면 5~10분) 포함. 클라이언트에 server SDK 넣지 말 것.
- **DataChannel 한계:** reliable ≈ 15 KiB/msg, lossy ≈ 1.3 KiB/msg. blendshape 52ch×4B = **208 B/frame, 30fps = 6.2 KB/s** → lossy로도 여유. **ARCHITECTURE-B의 lossy(unreliable) 선택이 옳다** — 최신 프레임 우선·head-of-line blocking 회피. 채팅/방권위만 reliable.
- **iOS Safari 오디오:** 자동재생 차단 → **사용자 제스처 안에서 `room.startAudio()`** 호출 필수. `RoomEvent.AudioPlaybackStatusChanged` 감지해 "탭하여 소리 켜기" UI. 백그라운드 탭에선 신규 트랙 음소거됨.
- **React 19 호환:** `@livekit/components-react`(현 2.9.x) peerDeps에서 React 19 명시 확인 필요. 미지원 시 `livekit-client` + 자체 훅으로 우회.

**보안/비용:** 공개 CVE는 현재 미발견(GitHub Advisory 모니터링). **2025년 가격 개편** — agent-session 분 중심, WebRTC 참가자 분은 저렴($0.0004~0.0005/분), **다운스트림** 대역폭만 과금. 셀프호스트(Hetzner)는 coturn/TURN·UDP 포트레인지·CPU(SFU DTLS/SRTP) 필요.

링크: [Tokens & grants](https://docs.livekit.io/home/get-started/authentication/) · [Data packets](https://docs.livekit.io/home/client/data/packets/) · [Pricing](https://livekit.com/pricing)

### 3.3 MediaPipe (`@mediapipe/tasks-vision` FaceLandmarker)

**깨지는 지점:**
- **L1(§2)** — SAB/교차격리 결정이 최우선.
- **iOS Safari 미지원** → 모바일 뷰어/채팅 전용(ARCHITECTURE-B §5.2 결정과 일치).
- **getUserMedia = 보안 컨텍스트(HTTPS) 필수.** http에선 `navigator.mediaDevices`가 `undefined`. 권한 요청은 사용자 제스처 안에서.
- **버전:** 현행 `0.10.35` 권장. NPM 릴리즈 지연 이력(0.10.21 이하 회피). 모델은 `storage.googleapis.com/.../face_landmarker.task`(CORS OK) 또는 자체 호스팅.
- **CSP:** WASM 로드에 `script-src 'wasm-unsafe-eval'` (≠ `unsafe-eval`, 더 안전).
- **성능:** GPU(WebGL) ~30fps, CPU 10~20fps. WebGPU는 아직 미지원(이슈 추적 중). 모델 로드 2~5초(스피너 필요).

**보안:** 공개 CVE 미발견. 카메라 프레임은 온디바이스 처리(전송 없음) — DevTools Network로 검증 가능.

링크: [Face Landmarker web](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) · [npm tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision)

### 3.4 PixiJS v8 (`pixi.js`)

**깨지는 지점:**
- **v7→v8 파괴 변경:** `new Application()` 후 **`await app.init()`** (비동기). Graphics API 역전(`beginFill`→`fill`, `drawRect`→`rect`). `DisplayObject` 제거 → **Container만 자식 보유**. `BaseTexture`→`TextureSource`, 텍스처 자가로드 폐지(Assets로 선로드).
- **L4 — 6인 동시 렌더:** Application 6개 = WebGL 컨텍스트 6개. 한계 ~8(FF/Safari)~16(Chrome). **단일 Application + RenderTexture 6개(아바타별 오프스크린) → 메인 캔버스에 합성** 구조 권장. Application 6개 직접 생성 금지.
- **컨텍스트 손실:** `webglcontextlost/restored` 처리. 모바일·탭 백그라운드·GPU 리셋 시 발생 → 복원 시 텍스처 재로드. (v8.13.x에 복원 후 Text 사라짐 이슈 보고.)
- **메모리 누수:** 아바타 생성/파괴 반복 시 `destroy({children:true, texture:true})` 명시 호출. GC 의존 금지, 풀링 권장. `textureGC*` 옵션 조정.
- **Vite:** top-level await 패턴(§3.1). `npm create pixi.js@latest -- --template bundler-vite` 스캐폴드가 ESM 설정 정리해 줌.

**보안:** 공개 CVE 미발견. `npm audit`로 전이 의존성만 점검.

링크: [v8 migration](https://pixijs.com/8.x/guides/migrations/v8) · [GC/memory](https://pixijs.com/8.x/guides/concepts/garbage-collection) · [performance](https://pixijs.com/8.x/guides/concepts/performance-tips)

### 3.5 Supabase (`@supabase/supabase-js`)

**깨지는 지점 / 보안(이 스택 최대 보안면):**
- **L3 — RLS가 실제 보안 경계.** 모든 테이블 RLS 활성 + 정책 명시. **UPDATE/DELETE 정책엔 대응 SELECT 정책도** 필요(없으면 조용히 실패). 역할 판정은 `user_metadata`(유저가 수정 가능) 말고 `raw_app_meta_data` 사용.
- **키 분리:** `anon`(=publishable, 공개 OK) vs `service_role`(=secret, 클라 절대 금지·Edge Function 전용·RLS 우회). 2025년 신 키모델(`sb_publishable_…`/`sb_secret_…`)로 회전 가능.
- **Storage:** private 버킷 + signed URL 기본. 공개 버킷 SELECT 정책이 **목록 열람(enumeration)** 까지 허용하지 않게 주의. rig JSON/PNG/대본/배경 버킷별 정책 분리.
- **Auth(SPA):** 세션이 localStorage 기본 → **XSS에 토큰 노출**되므로 CSP가 실질 방어선(§5). PKCE 기본(implicit 금지). OAuth redirect URL·Site URL 정확히 설정(와일드카드 금지). JWT 만료 1시간 권장.
- **Realtime:** RLS가 postgres_changes에 적용. broadcast/presence는 `realtime.messages` 정책으로 방 멤버 제한. 정책에 조인 남발 시 연결 지연.
- **Edge Function:** LiveKit 토큰 발급·service_role 보관처. 시크릿은 `supabase secrets set`.

**CVE(§4 참조 — 재확인 필수):** 인증 우회/경로순회/RLS 누락 계열. `@supabase/auth-js`·`supabase-js` 최신 고정.

링크: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) · [API keys](https://supabase.com/docs/guides/api/api-keys) · [Storage access](https://supabase.com/docs/guides/storage/security/access-control) · [Edge Function auth](https://supabase.com/docs/guides/functions/auth) · [Security 2025 retro](https://supabase.com/blog/supabase-security-2025-retro)

### 3.6 Cloudflare Pages / 배포

**깨지는 지점:**
- **SPA 폴백:** 클라 라우트(`/rooms/:id`) 404 방지. `_redirects`에 `/*  /index.html  200` 또는 Workers Assets `not_found_handling: "single-page-application"`.
- **헤더 주입:** `dist/_headers` 파일로 COOP/COEP·CSP·Permissions-Policy·HSTS 설정(§5). **단 Worker 생성 응답엔 `_headers`가 안 먹음** — 코드에서 직접.
- **env:** `VITE_` = 공개(번들 박제). 시크릿은 Pages env의 빌드 var가 아니라 Worker secret/Edge Function으로.
- **보안 컨텍스트:** Cloudflare는 자동 HTTPS → getUserMedia/WebRTC/SAB 충족. 로컬 dev만 `localhost`/https 필요.

링크: [Pages/Workers SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) · [_headers](https://developers.cloudflare.com/pages/configuration/headers/)

### 3.7 npm 공급망 (전 의존성 공통)

LiveKit·Pixi·MediaPipe·Supabase로 의존성 트리가 크다. 2025~26 실제 공격(Shai-Hulud 웜, PackageGate)으로 lifecycle script·git deps가 벡터.
- `package-lock.json` 커밋 + CI는 **`npm ci`**(락 불일치 시 실패, SRI 해시 검증).
- **정확 버전 핀**(`^`/`~` 회피), 신버전 7~14일 쿨다운.
- `npm audit --audit-level=high` 게이트. 가능하면 `ignore-scripts` + 신뢰 패키지만 예외.

링크: [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/) · [auditing deps](https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities/)

---

## 4. CVE 요약 (⚠️ 적용 전 NVD/GitHub Advisory/`npm audit`로 재확인)

> Haiku 수집 → **Opus가 NVD/GitHub Advisory로 실재 검증**(2026-06-26). 핵심은 ID 진위보다 **적용범위** — 검증해보니 Supabase CVE 2건 모두 **우리 구성(anon SPA + Google OAuth)엔 직접 영향이 적다.** 운영 ground truth는 `npm audit`.

| 대상 | CVE/Advisory | 영향 | 해결 | 우리에게의 적용범위 (검증됨) |
|---|---|---|---|---|
| Vite | CVE-2025-30208, -31125 | dev 서버 임의 파일 읽기(`@fs` 우회). 31125=30208 불완전패치 후속 | Vite ≥6.2.3 (/6.1.2/6.0.12/5.4.15/4.5.10) | ✅실재. **dev 서버 `--host` 노출 시만**, 운영 정적빌드 무관 |
| esbuild | GHSA(dev CORS) | dev 서버 응답 타 사이트 열람 | 최신 vite/esbuild | dev 전용 |
| Supabase 플랫폼 | CVE-2025-48757 | RLS 누락 170+ 앱 DB 노출 | 전 테이블 RLS 활성 | ✅실재. **설정 문제** — L3 그 자체. 우리가 RLS 켜면 무관 |
| @supabase/auth-js | CVE-2025-48370 (GHSA-8r88-6cj9-9fh5) | **admin 함수**(getUserById/deleteUser 등) UUID 미검증 경로순회 | auth-js ≥ 2.69.1 | ✅실재. **admin/service_role 경로만** → anon SPA 클라엔 무관, Edge Function admin 호출 시만 |
| Supabase Auth | CVE-2026-31813 (GHSA-v36f-qvww-8w8m) | OIDC **Apple/Azure** ID토큰 issuer 미검증 → 계정탈취 | Auth ≥ 2.185.0 | ✅실재. **Apple/Azure ID토큰 로그인 활성 시만** → 우리 Google OAuth라 무관. 호스티드는 플랫폼이 패치 |
| LiveKit / Pixi / MediaPipe | (현재 공개 CVE 미발견) | — | 버전 추적·`npm audit` | Advisory 구독 권장 |

---

## 5. 권장 `dist/_headers` + CSP 스타터

> **L1 결정 후** 적용. 교차격리 불필요로 판정되면 COOP/COEP 줄 제거. `connect-src`엔 실제 LiveKit/Supabase 도메인을 채울 것. 배포 전 `Content-Security-Policy-Report-Only`로 위반 로그 먼저 수집 → 정리 후 강제.

```
/*
  # (L1에서 SAB 필요로 판정된 경우에만) 교차격리
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
  Cross-Origin-Resource-Policy: cross-origin

  # CSP — WASM(MediaPipe) + WebGL(Pixi) + WebRTC(LiveKit) + blob worker
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' wss: https://<livekit-host> https://<project>.supabase.co https://storage.googleapis.com; worker-src 'self' blob:; media-src 'self' blob: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'

  # 카메라/마이크 게이트
  Permissions-Policy: camera=(self), microphone=(self)

  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
```

`_redirects` (SPA 폴백):
```
/*    /index.html   200
```

---

## 6. Phase별 보안 게이트 (ARCHITECTURE-B §9 로드맵에 결속)

| Phase | 게이트 (통과 못 하면 진행 금지) |
|---|---|
| **0 스캐폴드** | Vite 6.2.x+ 핀 · `npm ci`+lock 커밋 · Tailwind4+Vite 첫로드 스타일 재현 테스트 · `VITE_`에 시크릿 없음 확인 |
| **1 PoC(2인)** | **L1 판정**(교차격리 ON/OFF fps 실측) · LiveKit 토큰 Edge Function 발급(시크릿 번들 0) · getUserMedia HTTPS · 단일 Application+RenderTexture 렌더 검증 |
| **2 방운영** | **모든 테이블 RLS 활성 + 정책 리뷰** · Storage 버킷 정책 · OAuth redirect/Site URL · service_role 클라 부재 확인 |
| **3 묵대** | CDN(R2) CORP 헤더(격리 시) · 6인 컨텍스트 손실/복원 테스트 · 메모리 누수(아바타 생성·파괴 반복) 프로파일 |
| **4 정식화** | `_headers` CSP Report-Only→강제 전환 · `npm audit` 게이트 · iOS Safari 오디오 제스처/뷰어 폴백 QA · Permissions-Policy 검증 |

---

## 7. 액션 체크리스트

- [ ] LiveKit `API_SECRET`·Supabase `service_role` — Edge Function/Worker에만. 번들 grep으로 부재 확인.
- [ ] Supabase 전 테이블 RLS 활성 + SELECT/INSERT/UPDATE/DELETE 정책 명시, `raw_app_meta_data`로 역할 판정.
- [ ] **L1 PoC:** 교차격리 없이 FaceLandmarker 30fps 나오는지 실측 → 안 되면 `credentialless`+CORP 경로.
- [ ] Pixi: 단일 Application + RenderTexture 6개. `destroy({children,texture})` 명시. 컨텍스트 손실 핸들러.
- [ ] iOS: 트래킹 비활성(뷰어), 오디오 `room.startAudio()` 제스처.
- [ ] `dist/_headers`(CSP/Permissions-Policy/HSTS) + `_redirects` SPA 폴백.
- [ ] 버전 핀 + `npm ci` + `npm audit --audit-level=high` CI 게이트.
- [ ] CVE 표(§4) 각 ID를 NVD/Advisory에서 재확인 후 라이브러리 최신 고정.

---

## 8. 한줄정리

스택 자체보다 **경계(boundary)** 가 위험하다 — ① 번들에 시크릿 금지(LiveKit/Supabase 토큰은 서버측), ② Supabase는 RLS가 곧 보안, ③ MediaPipe SAB가 정말 필요한지부터 PoC로 판정해 COOP/COEP 서드파티 충돌을 회피, ④ 6인 렌더는 단일 Application+RenderTexture, ⑤ Vite CVE는 dev 전용이니 운영보단 버전 핀·`npm audit`로 막는다. CVE ID는 적용 전 원본 재확인.
