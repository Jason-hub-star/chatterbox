---
name: 진단
description: 뭔가 안 될 때 증상을 넣으면 가장 가능성 높은 근본원인 1개 + 확인 명령을 짚어주는 ChatterBox 런북. E2E 실패·drift·게이트 레드·supabase 무소음 행업·스키마 체크 실패·아바타 오류배지 등 이 레포의 반복 함정에 앵커. "안 돼", "이거 왜 실패해", "진단", "고장", "/진단 <증상>" 요청 시.
user_invocable: true
tags: [meta, diagnose, runbook]
trigger: "게이트·E2E·배포·렌더가 실패하거나 막혔을 때 근본원인을 빠르게 좁힐 때."
version: 1
---

# 진단 — 증상 → 근본원인 런북 (공통 메타)

증상을 받아 **가장 가능성 높은 근본원인 1개**와 **확인 명령**을 짚는다(BLUF). 추측 금지 — 확인 명령으로 실측(성역).

| 증상 | 1순위 근본원인 | 확인/정정 |
|---|---|---|
| E2E shape 불일치·필드 누락 | 배포본이 소스보다 오래됨([[deployed-fn-drift]]) | `supabase functions list` 버전·갱신시각 → 재배포 |
| `docs:drift` STALE/REGRESSION | probe ↔ 코드 드리프트 | 해당 `<!-- probe -->` 파일 열어 실상태 확인(자동 `[x]` 금지) |
| 게이트 레드(tsc/lint/test) | 공유 함수 변경이 형제 호출처 깨뜨림 | 로그 직접 + 건드린 함수 **모든 호출처 grep** |
| `docs:check` 스키마 실패 | 모듈/legacy 스냅샷/manifest sha256 불일치 | 3종 동시 동기화([[schema-split-hub-gate]]) |
| supabase-js 무소음 행업 | 클라이언트 간헐 행업 | 중요 쓰기는 REST 직행([[avatar-forge-first-run]]) |
| 아바타 "오류" 배지 | 웹캠 트래킹 오류(렌더 아님) | `avatar.trackingError`·Chrome 완전 재시작([[chrome-codesign-webcam-tracking]]) |
| .env 값이 로그에 노출 | rtk가 grep 재작성 | grep 전면 금지·awk/cut만([[rtk-grep-secret-leak]]) |
| R2 fetch ERR_FAILED | 오리진 미허용(코드 회귀 오판 주의) | pages.dev·localhost:5173만 허용([[r2-cors-allowed-origins]]) |

증상이 표에 없으면: 관련 파일 원본 직접 열어 근본원인 추적(막힘 방치 금지). 정정은 티켓 경로만이 아니라 **공유 함수 한 곳**에서.
