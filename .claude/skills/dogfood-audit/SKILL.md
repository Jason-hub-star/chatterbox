---
name: dogfood-audit
description: 플랫폼을 여러 사용자 페르소나(신규유저·호스트·뷰어/모바일·악성참가자·크레딧공격자·데이터절취)로 서브에이전트가 실제로 "써보게" 해서 보안취약점·UX마찰·누락기능·잘되는점을 발굴하고, uiux-distilled 원칙으로 UX 개선안까지 문서화하는 3단(정찰→페르소나 워커→종합) 도그푸딩 감사. "플랫폼 감사해줘", "여러 유저로 써봐", "도그푸딩", "보안+UX 같이 봐줘", "사용자 시뮬레이션", "보안취약점이랑 개선점 찾아줘" 요청에 발동.
user_invocable: true
tags: [security, ux, audit, dogfooding, persona, multi-agent, review, uiux]
trigger: "라이브 플랫폼을 유저 페르소나로 써보며 보안+UX+기능갭을 한 번에 감사 / 도그푸딩 요청"
version: 1
---

<!-- dogfood-audit/SKILL.md · gap-find 의 자매 스킬. frontmatter 는 반드시 첫 줄. -->

# Dogfood Audit

여러 **사용자 페르소나**로 빙의한 서브에이전트가 실제 코드 경로(=유저 여정)를 걸어보며 **보안·UX·누락기능·잘되는점**을 한 번에 발굴하고, 발견을 `uiux-distilled.md` 원칙으로 **선설계 문서**까지 닫는다.

**`gap-find` 와의 구분** — `gap-find`는 *렌즈* 기반(보안/정합성/기능갭/운영) 설계·코드 갭 감사(find→fix). 이건 *페르소나* 기반 **라이브 플랫폼 도그푸딩**(유저로 여정을 실제로 걸음) + **UX/uiux 축** + **3단 파이프라인**(정찰→심층워커→종합). 순수 설계문서 갭이면 `gap-find`, 돌아가는 플랫폼을 "유저처럼 써보며" 보안+UX를 같이 보려면 이 스킬.

## Use When

- "보안취약점이랑 개선점 찾아줘", "여러 유저로 써봐", "도그푸딩", "플랫폼 감사" 류 요청
- 코드가 실제로 도는 단계(Edge Function·프론트 배선 존재)에서 보안과 UX를 **동시에** 보고 싶을 때
- UX/uiux 개선을 문서로 선반영하고 싶을 때 (`uiux-distilled.md` 있는 프로젝트)

## 모델 분담 (전역 에이전트 모델 규칙 준수)

| 단계 | 모델 | 이유 |
|---|---|---|
| **정찰** | Haiku(기계적 인벤토리: 라우트·파일·LOC·i18n·stub 마커) + Sonnet(판단 필요한 보안 표면지도·UX 여정지도) | 병렬·컨텍스트 절약. 표면지도는 워커에 급식되므로 정확도 필요 → Sonnet |
| **페르소나 워커** | Opus | 각 페르소나가 코드를 읽고 심층 공격/여정. 병렬 |
| **종합·검증·설계** | **메인(상위급이면 직접)** | 발견 검증(성역)·중복제거·랭크·UX 선설계·스킬화. 메인이 하위급일 때만 Opus로 격상 |

## Steps

1. **지형 확정(직접, 싸게)** — `find`·`git ls-files`로 라우트/Edge Function/마이그레이션/페이지/피처 목록을 **직접** 잡는다. ⚠️ `ls`가 프록시로 "(empty)" 반환할 수 있음 → `find`/`git ls-files`로 그라운드 트루스. 기존 스킬(`.claude/skills/`)·트리거 라우팅 먼저 확인.
2. **정찰 3종(Haiku/Sonnet 병렬)** — ①기계적 인벤토리(Haiku) ②Edge Function 보안 표면표(함수별 auth/입력검증/인가/레이트리밋/부작용/스토리지경로 — ⚠️행 표시)(Sonnet) ③실 UX 여정지도 + uiux-distilled Top10 적용감사(Sonnet). 산출물이 워커 급식자료.
3. **페르소나 워커(Opus 병렬)** — 보안 트랙(악성참가자=인가/IDOR/스푸핑 · 경제공격자=크레딧/웹훅/SSRF/비용DoS · 데이터절취=signed URL/경로traversal/RLS)과 UX 트랙(신규유저=온보딩마찰 · 호스트=세션운영 · 뷰어/모바일/a11y). 각 워커에 해당 정찰지도 급식 + **모든 발견에 `file:line` + 심각도 + Confidence(Confirmed/Likely/Refuted)** 강제. **실제 안전하면 Refuted로 명시**(거짓양성 억제).
4. **검증(직접·성역, 스킵 금지)** — 최고심각도 Confirmed 발견은 **인용 파일을 직접 열어** 대조. 서브에이전트가 과대평가한 심각도를 실임팩트로 재조정(예: "권한상승"이 실은 "griefing/desync"). Refuted 판정도 스팟 신뢰. 정찰 의심(예: webhook authz)이 실제론 견고할 수 있음 → 재해석.
5. **종합 리포트** — 보안(P0/P1/P2, Confirmed/Refuted 구분) + UX(Blocker/High/Med) + 있으면좋을기능(effort S/M/L) + 잘되는점(회귀방지). 심각도순 표, 산문 중복 금지, BLUF.
6. **UX 선설계(선택, 요청 시)** — 발견을 `uiux-distilled.md` 원칙에 매핑해 "만들 수 있는" 패턴 문서(재사용 프리미티브 우선)로 반영. `docs/design/UX-GAPS-AND-PATTERNS.md` 패턴. `docs/INDEX.md` 등록.
7. **닫기** — 코드 게이트는 소스만 봄(배포 드리프트 주의). 필요 시 발견을 `GAP-MATRIX.md`/`AGENT-OPS.md`에 추적 등록. 새 문서는 `docs:check`.

## 표준 페르소나 세트 (도메인에 맞게 조정)

| 트랙 | 페르소나 | 반드시 봄 | 피함 |
|---|---|---|---|
| 보안 | 악성 참가자 | 호스트전용 함수 무단호출·크로스룸·identity 스푸핑·클라신뢰(큐/역할/동의) | 근거 없는 트집 |
| 보안 | 경제 공격자 | 크레딧 이중지불/음수·웹훅 위조·재생·SSRF·무제한 비용 API | 이미 원자/멱등인 것 재보고 |
| 보안 | 데이터 절취 | signed URL IDOR·경로 traversal(클라 경로 startsWith)·RLS 우회·버킷 공개 | R2 정규화 미검증인데 Confirmed 단정 |
| UX | 신규 유저 | 온보딩 스텝/마찰·데드엔드·무피드백·다국어 커버리지 | 문서의 이상론 |
| UX | 세션 호스트 | 실시간 상태·관리(강퇴/mute/품질)·진행도/ETA·호스트 이양 | 현 규모 오버엔지니어링 |
| UX | 뷰어/모바일/a11y | 뷰어경로 배선 여부·터치/반응형·키보드·대비·색맹 | — |

## Output Format

```markdown
## BLUF — 판정 한 줄

## 보안 (심각도순)
| ID | 취약점 | 심각도 | Confidence | file:line | 익스플로잇 | 수정 |
## 반증(안전 확인) — 거짓양성 억제 기록
## UX 마찰 (Blocker/High/Med)
## 있으면 좋을 기능 (effort)
## 잘되는 점 (회귀 금지)
```

## Verify

- [ ] 정찰 3종이 병렬로 돌았고 표면지도가 워커에 급식됨
- [ ] 각 발견에 `file:line` + 심각도 + Confidence 존재 (추측 없음)
- [ ] 최고심각도 Confirmed 는 메인이 원본 직접 대조(성역) — 심각도 실임팩트로 재조정됨
- [ ] Refuted(안전) 항목이 명시됨 (거짓양성 억제)
- [ ] UX 선설계 문서 작성 시 `docs/INDEX.md` 등록 + `docs:check` PASS

## Failure / Fallback

- `ls`가 빈 결과면(프록시) `find`/`git ls-files`로 사실 확인 후 워커에 주입.
- 워커가 심각도를 부풀리면 메인 검증에서 실임팩트로 강등(예: desync는 데이터유출 아님).
- 스토리지 경로 traversal처럼 외부런타임(R2) 정규화에 결과가 달리면 **Likely + 라이브 테스트 권고**로 남기고, R2 결과와 무관하게 견고한 정수정(서버측 키 생성)을 제안.
- 배포본이 소스보다 오래됐을 수 있음 → "소스 기준" 명시(관련 [[deployed-fn-drift]]).

## 참조

- `docs/design/uiux-distilled.md` — UX 원칙 SSOT(#번호로 인용)
- `docs/design/UX-GAPS-AND-PATTERNS.md` — 이 스킬의 UX 선설계 산출물 패턴
- `.claude/skills/gap-find/SKILL.md` — 렌즈 기반 자매 스킬
- `docs/status/AGENT-OPS.md` § 주간 보안 체크리스트 — 정기 실행 연계
