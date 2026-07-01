---
tags: [entry]
---

<!-- 프로젝트 루트 진입 문서. Claude Code가 이 레포에서 작업 시작 시 자동 로드. -->

# ChatterBox — 프로젝트 지도

PNG→VTuber + 실시간 연기 플랫폼. **현재 Phase 0 (코드 없음, 폴더 스캐폴딩만 존재)** — 설계는 100% SSOT 문서로 확정, 구현 착수 전 단계.

## 먼저 읽을 것

1. `docs/status/SCOUT.md` — 세션 인계 배턴 (state: SCOUT_READY/WORKING/DONE/BLOCKED)
2. `docs/INDEX.md` — 전체 문서 지도 (SSOT/설계/조사 분류)
3. `docs/GAP-MATRIX.md` — 구현 전 누락 스펙 감시판, 코딩 착수 전 P0 전부 DONE 확인 필수

## 폴더 구조 (SSOT: `docs/PLATFORM-ARCHITECTURE.md` §12)

```
ChatterBox/
├── public/{fonts,lotties,avatars}
├── src/
│   ├── app/            # 라우트 트리 + App.tsx
│   ├── pages/          # 라우트 최상위 컴포넌트
│   ├── features/       # avatar·chat·room·script·tracking·vgen·dub
│   ├── components/{ui,shared}
│   ├── stores/         # Zustand 슬라이스
│   ├── lib/{pixi,mediapipe}  # 외부 SDK 래퍼 (+ supabase.ts·livekit.ts·fal.ts)
│   ├── hooks/ types/ utils/
├── tests/{unit,integration,e2e}
├── docs/               # 전 계약서·스펙·상태머신 (docs/INDEX.md 참조)
└── scripts/            # docs:check·docs:health·docs:overview
```

**규칙 — 구조 변경은 문서가 먼저:**
- 새 최상위 폴더 추가/이동 전 `docs/PLATFORM-ARCHITECTURE.md` §12를 먼저 갱신한다. 코드가 문서보다 먼저 바뀌면 다음 세션이 구조를 못 찾는다.
- `features/*` 폴더는 컴포넌트 1~2개면 만들지 않는다 (§12.1) — `components/`에 직접 배치.
- `stores/index.ts` barrel export 금지 (circular import 위험, §12.3).
- import alias `@/` = `src/` (`vite.config.ts` 설정 예정, `docs/VITE-CONFIG.md` 참조).

## 검증 명령

```bash
npm run docs:check       # 계약서-코드 정합성
npm run docs:check:strict
npm run docs:health      # GAP 상태 카운트 + 건강도
npm run docs:overview    # platform-overview.html 갱신
```

## 관련 문서

- `docs/FEATURE-SPEC.md` — 기능 SSOT
- `docs/FEATURE-CONTRACT-MAP.md` — Feature ID → 계약서/상태머신/스키마 역색인
- `docs/CODING-CONVENTIONS.md` — 네이밍·store 패턴
- `docs/MILESTONES.md` — Phase 0 Acceptance Criteria
