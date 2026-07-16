---
name: 마감
description: 세션/작업 마감을 한 명령으로 닫는 캡슐 — 게이트 일괄(check:all)→SCOUT 배턴 DONE(막히면 BLOCKED)→얇은 문서 갱신(백로그§0·GAP 진행로그)→session-handoff 캡슐→push(승인분). "세션 끝", "마감해줘", "배턴 넘기고 인계", "/마감", "정리하고 인계" 요청 시. 배포는 하지 않는다.
user_invocable: true
tags: [meta, close, handoff]
trigger: "세션 또는 한 작업을 끝낼 때 검증·배턴·문서·핸드오프를 한 번에 닫을 때."
version: 1
---

# 마감 — 세션 마감 캡슐 (쓰기 · 공통 메타)

목표: 세션 끝의 `게이트 → 배턴 → 문서 → 핸드오프` 이음새를 한 번에 닫는다. 검증은 성역 — 게이트 실패면 마감을 **멈추고 보고**(억지 DONE 금지).

## 순서
1. **게이트 (성역)** — `npm run check:all`. 실패 시 **여기서 정지**, 실패 항목 보고, 배턴 안 넘김.
2. **SCOUT 배턴 — 그 한 줄만** — `docs/status/SCOUT.md` 첫 `state:`를 `DONE`(막혔으면 `BLOCKED`). 다른 SSOT는 안 건드림. 첫 편집 때 훅이 이미 `WORKING`으로 바꿔놨을 것(scout-baton-working.sh).
3. **얇은 문서 — `thin-doc-update`** — 백로그 §0 상태 + `docs/GAP-MATRIX.md` 진행 로그 **1줄**. 자동 `[x]` 금지(probe 유지·실측 증거만).
4. **핸드오프 — `session-handoff`** — 진입점·블로커·미결정·**첫 검증 명령**을 `docs/status/AGENT-OPS.md`에. next entrypoint 는 구체 파일 경로.
5. **push (승인분)** — 커밋 파일은 **명시 목록**만([[jason-worktree-concurrent-sessions]]).

## 경계
- 배포는 이 스킬 밖. 라이브 반영 필요하면 `/배포`(마감 전). `.env` grep 금지·값은 awk([[rtk-grep-secret-leak]]).
