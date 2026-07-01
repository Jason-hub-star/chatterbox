---
name: doc-health-audit
description: 프로젝트 문서 건강성을 진단하고 선택적으로 고치는 스킬. "문서건강성체크", "문서 건강성 체크해줘", "문서 건강성 점검", "doc health", "문서 정리 상태 봐줘", "진입 문서 토큰 너무 큰지 확인" 같은 요청에 발동. 3대 기준(① 인덱싱성: 첫 진입에 필요 정보를 바로 찾아 들어갈 수 있는가·죽은 링크 ② 파일크기/토큰: always-read 진입 문서가 비대해 매 세션 토큰을 낭비하는가 ③ 폴더/정리: 폴더 경계·중복·스테일·방치·README 없는 폴더)으로 등급 판정 후 저가 모델 위임 편집(이관만/git mv)까지 닫는다.
user_invocable: true
tags: [doc-health, indexing, token-budget, ssot, drift, organization]
trigger: "문서 건강성 체크 / 진입 문서가 비대해진 것 같을 때 / docs 폴더 정리 상태 점검 / 주 1회 문서 위생 점검"
version: 1
---

<!-- doc-health-audit/SKILL.md · harnesses/doc-health-audit.md 의 페어 스킬. frontmatter는 반드시 첫 줄(헤더주석 룰 예외). -->

# Doc Health Audit

문서가 "첫 진입에 빠르게 인덱싱되고, 매 세션 토큰을 낭비하지 않고, 폴더별로 잘 정리됐는가"를 진단하고, 승인 시 편집까지 닫는다. 전체 패턴은 `harnesses/doc-health-audit.md` 참조.

`claude-code-health`(에이전트 컨텍스트/도구 건강)의 **문서판 자매**. `change-class-doc-sync`(변경 후 무슨 문서 고칠지)와 구분되는 **정기 위생 점검**이다.

## Use When

- "문서건강성체크해줘" 류 요청 (1차 트리거)
- always-read 진입 문서가 커져 매 세션 토큰이 아까울 때
- "1페이지 캡슐"이 수백 줄로 불었을 때
- 새 폴더/문서가 늘어 경계가 의심될 때
- 주 1회 또는 큰 마일스톤 직후

## 3대 기준

| 기준 | 본다 | 적신호 |
|---|---|---|
| **① 인덱싱성** | 진입 경로(entry→status→decision→tech-index)가 실제로 라우팅되나, 죽은 링크 없나 | 실제와 어긋난 진입 안내, 깨진 상호참조 |
| **② 파일크기/토큰** | always-read 진입 문서 라인수 합 | "1페이지"라던 캡슐이 수백 줄, 1000줄+ 로그를 매번 읽으라는 지침 |
| **③ 폴더/정리** | 폴더 경계, 스테일/중복/방치/빈 파일, 폴더 README 유무 | 1달+ 방치 파일, 영구 미완료 체크리스트, README 없는 폴더 |

## Steps

1. **Scan(직접)** — `find docs -name "*.md" -exec wc -l {} + | sort -rn` 로 큰 파일, `find docs -type d` 로 폴더 경계, `wc -l <entry-docs>` 로 always-read 비용. (`ls`가 비면 `find`로.)
2. **Analyze(저가 모델 위임)** — 진입 문서를 실제로 읽고 3대 기준 등급(A~F) + 적신호 판정. 큰 로그는 처음 50줄/끝 80줄만. 죽은 링크 grep. 추측 금지, `파일:라인` 인용.
3. **Report + Approve** — 등급표 + 🔴즉시/🟡권장/🟢양호 + 편집 제안. 편집 범위 확인(빠른/깔끔/보류).
4. **Edit(저가 모델 위임)** — 승인 범위만. 아래 불변식 주입.
5. **Verify(직접)** — `find`/`wc`/`grep`으로 재검증. 위임 보고가 모호한 이동/생성은 직접 확인.

## 편집 불변식 (위임 시 필수)

- **내용 삭제 금지 = 이관(move)만.** 잘라낸 건 다른 파일로. 정보 손실 0.
- 파일/폴더 이동은 `git mv`. 새 폴더는 README, 새 파일은 헤더 주석.
- 편집 전 read 필수, 추측 금지. 커밋은 사용자 몫.

## 표준 처방

- **핸드오프 비대화** → 원본 `*-FULL.md`로 `git mv` 보존 + 새 핸드오프는 짧은 캡슐.
- **결정로그 비대화** → 최신 N건 `*-CURRENT.md`로 분리 + 본체 네비 헤더.
- **스테일/임시** → `docs/archive/`로 `git mv` + 분기 정책 README.
- **README 없는 폴더** → 용도 README 추가.

## Verify

- [ ] 진입 문서가 빠른 스캔에 들어옴, 죽은 링크 0건
- [ ] 옮긴 파일이 git `R`(rename)로 잡힘, 정보 손실 0
- [ ] 모든 docs 폴더 용도가 README로 설명됨
- [ ] 건강 판정(`stable`/`bloated`/`disorganized`/`reprofile-needed`) + 다음 액션 기록

## Failure / Fallback

- 진입 문서·기존 미커밋 변경이 한 파일에 섞여 분리 불가 → 사용자에게 커밋 범위 확인.
- 위임 편집이 문서 통째 재작성(파괴) → diff 확인 후에만 채택.
- 분석만 필요하면 4~5단계 생략, 보고서만.
