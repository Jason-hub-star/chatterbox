---
tags: [guide]
---

<!-- opencode: 2026-06-26 - Router stack comparison for Vite React SPA. Coded with OpenCode; high-cost model review recommended. -->

# STACK-COMPARE-ROUTER — Vite React SPA 라우터 대안 비교

## BLUF
Vite 기반 React SPA에서 라우팅 복잡도는 낮고, 핵심 불확실성은 아바타/실시간 기능에 집중되어 있다. `react-router-dom` 7은 이미 팀에 익숙하고 Vite SPA와 직접 결합할 수 있어 유지하는 것이 가장 저렴하다. TanStack Router는 URL 상태 스키마/타입 안전성이 제품 핵심이 될 때 강력하지만, 현재로선 마이그레이션 비용이 이득보다 크다. wouter은 극도의 번들 제약이 있을 때만 고려한다.

## 평가축

| 대안 | 기능/적합성 | 번들/성능 | DX/생태계 | 보안/라이선스 | 운영비용 | 리스크 |
|---|---|---|---|---|---|---|
| **react-router-dom 7 (현재 선택)** | Vite SPA에서 `<BrowserRouter>`/`<Routes>`로 충분. Data API(loader/action)는 framework mode에서만 원활; 라이브러리 모드에서는 기존 hooks 사용. | npm unpacked: wrapper 5.4KB, 핵심 `react-router` 2.7MB. 실제 런타임 번들은 사용하는 API에 비례(라이브러리 모드 시 수백 KB 수준 추정). | React 사실표준, Shopify/Open Governance, StackOverflow/채용 풍부. v8은 이미 출시됨(npm latest 8.0.x, 2026-06 확인); 마이그레이션 영향은 공식 가이드 확인. | MIT. 기여자/의존성 다수로 보안 감시는 충분하나 공급망 리스크는 공유됨. | 물론 물림. 서버비 없음. | framework mode로의 점진적 이전이 꼬일 수 있음; 하지만 현재 라이브러리 사용은 안정적. |
| **TanStack Router** | 100% inferred TypeScript, 파일/코드 기반 라우팅, 중첩 레이아웃, search param schema 검증(zod 등), 병렬 loader/SWR 캐싱 지원. | npm unpacked: 1.1MB. 번들은 tree-shaking으로 필요 기능만 가능. | TanStack 생태계, 꾸준한 성장, 문서 우수. 다만 React Router 대비 채용/커뮤니티 규모는 작음. | MIT. 의존성이 적고 최신 TS 중심. | 물론 물림. 서버비 없음. | 팀 학습비용, 파일 기반 라우팅 도입 시 빌드 설정 추가, search param 중심 상태가 아직 필요 없음. |
| **wouter** | `<Route>`, `<Link>`, `<Switch>`, nested routing, hash/base path, regex path 지원. loader/action 개념 없음. | ~2.1KB gzipped (README 기준). npm unpacked 75KB. 매우 작음. | 경량 생태계. React Three Fiber 등 일부 라이브러리 사용. 채용/예제 풀은 제한적. | MIT. 의존성 최소. | 물론 물림. 서버비 없음. | 팀이 추가 추상화를 직접 만들어야 함. 현재 복잡도에서는 오버엔지니어링 아님. |

## 상세 비교

### 1. react-router-dom 7
- **근거**: React Router 공식 문서는 "multi-strategy router"를 표방하며, v7은 Vite+React SPA의 라이브러리 모드에서 기존 `BrowserRouter`/`Routes`/`useNavigate` API를 그대로 사용할 수 있다. 또한 v8이 이미 출시됨(npm `react-router` latest = 8.0.x, 2026-06 확인); 업그레이드 영향(non-breaking 여부)은 공식 마이그레이션 가이드로 확인할 것.
- **출처**: https://reactrouter.com/ ("A user‑obsessed, standards‑focused, multi‑strategy router"), https://reactrouter.com/ (v8 non-breaking badge)
- **번들**: `npm view react-router-dom@7.18.0 dist.unpackedSize` = 5,397B, `npm view react-router@7.18.0 dist.unpackedSize` = 2,705,573B (2026-06-26). 이 수치는 압축 해제된 npm 패키지 크기이며, 실제 브라우저 번들은 라이브러리 모드에서 수백 KB 수준으로 tree-shaking된다.
- **단점**: framework mode(서버 loader, Form 등)를 도입하려면 Vite 프레임워크 플러그인 도입이 필요하고, 이는 현재 SPA 구조와 충돌할 수 있다. 현재 ARCHITECTURE-B는 SPA를 전제로 하므로 라이브러리 모드가 적절하다.

### 2. TanStack Router
- **근거**: 공식 overview에 따르면, 100% inferred TypeScript, typesafe navigation, search param schema validation, route loader + SWR caching, 파일/코드 기반 혼합 routing을 제공한다. 특히 "search params are the most powerful state manager"라는 철학은 필터/탭/페이지네이션 상태를 URL에 자연스럽게 담는 제품에 적합하다.
- **출처**: https://tanstack.com/router/latest/docs/overview
- **번들**: `npm view @tanstack/react-router@latest dist.unpackedSize` = 1,142,810B (2026-06-26).
- **단점**: route tree 생성, search param schema, loader 생명주기 등 학습 곡선이 있으며, 현재 제품은 라우팅보다는 캔버스/실시간 기능이 핵심이라 ROI가 낮다.

### 3. wouter
- **근거**: README에 따르면 2.1KB gzipped이며, React/Preact 호환, hooks 기반, nesting, base path, hash routing, regex path를 지원한다.
- **출처**: https://github.com/molefrog/wouter
- **단점**: loader/action, data fetching, type-safe search param 검증 등이 없어서 시간이 지나면 결국 react-router/TanStack으로 갈아타야 할 가능성이 크다.

## 결정

**ARCHITECTURE-B의 현재 선택(react-router-dom 7)을 바꿔야 하는가? NO.**

- URL 상태 스키마화, 타입 안전한 중첩 라우팅, 병렬 prefetch가 제품 핵심 요구사항으로 부상하면 TanStack Router로 재평가한다.
- 번들 예산이 극도로 제한적이고 라우팅이 5개 이내 단순 페이지라면 wouter을 스파이크한다.
- 그 외에는 react-router-dom 7을 유지하며, 향후 v8 non-breaking 업그레이드만 따라간다.
