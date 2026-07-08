---
tags: [entry]
---

<!-- 프로젝트 루트 진입 문서. Claude Code가 이 레포에서 작업 시작 시 자동 로드. -->

# ChatterBox — 프로젝트 지도

PNG→VTuber + 실시간 연기 플랫폼. **구현 활발히 진행 중** — 코어 루프(인증·룸·6인 무대·네이티브 아바타·표정 트래킹·리액션·대본·채팅·더빙·영상생성)가 e2e 배선 완료(Edge 함수 33·마이그 14). MILESTONES Phase 0~3 대부분 충족, 현재는 **보안 하드닝 + UX seam**(도그푸딩 감사) 단계. 설계 SSOT는 `docs/`가 계속 원천.

## 먼저 읽을 것

1. `docs/status/SCOUT.md` — 세션 인계 배턴 (state: SCOUT_READY/WORKING/DONE/BLOCKED)
2. `docs/DOGFOOD-AUDIT-2026-07.md §0` — **현재 최우선 구현 백로그**(트랙 A 로직·보안 seam / 트랙 B UIUX). `/goal`이 이 §0을 우선순위로 민다.
3. `docs/INDEX.md` — 전체 문서 지도 (SSOT/설계/조사 분류)
4. `docs/GAP-MATRIX.md` — 스펙 갭 감시판 (신규 기능 착수 전 P0 DONE 확인)

## 폴더 구조 (SSOT: `docs/PLATFORM-ARCHITECTURE.md` §12)

```
ChatterBox/
├── public/{fonts,lotties,avatars}
├── src/
│   ├── app/            # 라우트 트리 + App.tsx
│   ├── pages/          # 라우트 최상위 컴포넌트
│   ├── features/       # avatar·chat·room·reaction·script·stage·tracking·vgen·dub
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
- `docs/MILESTONES.md` — Phase별 Acceptance Criteria (배포 게이트)
- `docs/DOGFOOD-AUDIT-2026-07.md` — 도그푸딩 감사 백로그 (현 최우선 · `/goal` 소스)
