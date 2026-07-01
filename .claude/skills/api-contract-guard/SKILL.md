---
name: api-contract-guard
description: 외부 API(fal.ai, Supabase, LiveKit)·DB 컬럼명·모델명을 코드에 직접 박기 전에 계약과 런타임을 검증하는 스킬. ChatterBox 외부 의존성에 맞춰 커스터마이징됨.
user_invocable: true
tags: [contract, schema, api, validation, safety]
trigger: "외부 계약값을 하드코딩하려 할 때"
version: 2
---

<!-- jason-agent-harness-template의 api-contract-guard 스킬을 ChatterBox의 실제 외부 의존성(fal.ai/Supabase/LiveKit)에 맞춰 이식. -->

# API Contract Guard

## Use When

- fal.ai VGEN 응답 필드·모델명(예: Seedance 버전 문자열)을 문자열로 직접 쓰려 할 때
- Supabase DB 컬럼/테이블명을 코드에서 추정으로 쓰려 할 때 (`docs/DATA-SCHEMA.md §0 Naming SSOT` 확인 없이)
- LiveKit SDK 필드명, DataChannel payload 키를 추정으로 넣으려 할 때
- Edge Function endpoint, env key를 추정으로 넣으려 할 때

## Rules

1. 문서와 런타임 확인이 먼저다 — `docs/DATA-SCHEMA.md`, `docs/specs/livekit-edge-fn.md`, `docs/specs/SecurityPolicies.md`가 SSOT.
2. 상수는 한 곳에 모은다 (코드 생긴 후: `src/lib/constants.ts` 또는 `src/config/*.ts`).
3. 버전 의존 로직(fal.ai 모델 버전 등)은 이유와 재검토 시점을 남긴다.
4. 계약값은 SSOT 문서와 정확히 같은 이름을 쓴다 — `credit_balance`(금지, `credits.balance`가 맞음), `dubbing`(금지, `dub`가 맞음) 같은 레거시 표기 재사용 금지(`npm run docs:check`가 자동 검출).

## Steps

### Step 1: 외부 의존 목록 적기

- fal.ai 모델명/API 필드명
- Supabase 테이블/컬럼명
- LiveKit DataChannel payload 필드
- env key

### Step 2: 런타임 또는 공식 계약으로 확인

- `docs/DATA-SCHEMA.md`의 `CREATE TABLE` 정의 확인
- `docs/specs/livekit-edge-fn.md`, 관련 `docs/contracts/*.md` 확인
- fal.ai는 공식 문서 또는 실제 API 응답 확인

### Step 3: 중앙화

- DB/API row → boundary mapper(`mapRoomRow` 등, `docs/CODING-CONVENTIONS.md §2` 참조)에서만 변환
- 상수는 `src/lib/constants.ts` / `src/config/*.ts`

### Step 4: 버전 주석

fal.ai 모델 버전, LiveKit SDK 버전 의존 로직에는 버전/이유/향후 재검토 지점을 주석으로 남긴다.

## Verify

- [ ] 하드코딩 전 `docs/DATA-SCHEMA.md` 또는 관련 spec으로 실제 계약을 확인했다
- [ ] 상수가 중앙화됐다
- [ ] 버전 의존성 이유가 남아 있다
- [ ] `npm run docs:check`의 forbidden alias 검출(0건)과 일치한다

## Failure / Fallback

- 런타임 확인이 당장 안 되면: 최소 `docs/DATA-SCHEMA.md`/공식 문서를 근거로 남긴다
- 계약 자체가 문서에 없으면: TODO로 두지 말고 `docs/GAP-MATRIX.md`에 신규 G-ID로 등록 후 `gap-find`로 채운다
