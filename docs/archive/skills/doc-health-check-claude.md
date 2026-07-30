---
name: doc-health-check
description: >-
  프로젝트 문서의 건강성을 3기준으로 진단한다 — ① 인덱싱성(새 세션/태스크 시작 시 CLAUDE.md→INDEX→PROJECT-STATUS 체인만으로 현재 작업을 바로 찾는가, staleness 없는가) ② 크기/토큰(개별 문서가 너무 커서 읽으면 토큰 과소비하는가, 핵심 내비는 작은가) ③ 정리(폴더 구조, 죽은 링크, 중복). 트리거 — "문서 건강성 체크", "문서 건강성", "문서 정리 상태 확인", "문서가 너무 큰지", "문서 토큰 점검", "인덱싱 되는지 확인", "SSOT 문서 점검", "doc health check", "문서 구조 감사", "문서 갱신", "문서 업데이트", "문서 정리해줘". 진단은 메인(최상위) 모델이, 편집은 Sonnet에 위임.
---

# 문서 건강성 체크

프로젝트 문서가 "새 에이전트가 시작할 때 바로 쓸 수 있는 상태"인지 3기준으로 진단한다.
**진단(읽기/분석)은 메인 모델이 직접, 실제 편집은 Sonnet 서브에이전트에 위임한다** (사용자 선호).

## 1. 데이터 수집 (결정론, 추측 금지 — 파일을 실제로 열어 확인)

```bash
# 가장 큰 마크다운 TOP 20 (라인/KB) — 서드파티 제외
find . -name '*.md' -not -path './*/node_modules/*' -not -path './.git/*' -not -path '*/external_repos/*' \
  | while read f; do echo "$(wc -l <"$f") $(( $(wc -c <"$f")/1024 )) $f"; done | sort -rn | head -20

# 내비 체인 규모 (작아야 건강)
for f in CLAUDE.md docs/INDEX.md docs/status/PROJECT-STATUS.md; do printf "%5s줄  %s\n" "$(wc -l<"$f")" "$f"; done

# 죽은 링크: INDEX가 가리키는 경로 실존 확인 / 중복 의심 파일
git log --oneline -5   # 최신 작업과 내비 문서 staleness 대조
```

## 2. 판정 기준

| 기준 | 좋음 | 주의/나쁨 |
|---|---|---|
| **인덱싱성** | 내비 체인이 현재 작업(캐릭터/태스크)을 일관되게 가리킴, 날짜 최신 | INDEX/CLAUDE가 stale(구 캐릭터를 "현재"로), 현재 작업 누락 |
| **크기/토큰** | 핵심 내비 <300줄, 거대 문서는 grep 정책/분할로 완화 | 단일 SSOT가 수천 줄(실수로 전체 읽으면 컨텍스트 폭발) |
| **정리** | 폴더 명확(status/ref/archive), 죽은 링크 0 | 중복·죽은 링크·실험 경계 혼선 |

## 3. 조치 — 편집은 Sonnet 위임

진단 후 발견된 수정은 `Agent(subagent_type=general-purpose, model="sonnet")`로 위임하되, **정확한 사실·경계를 프롬프트에 명시**한다(서브에이전트는 대화 맥락이 없다).

흔한 조치:
- staleness: INDEX `Updated:` 날짜 + "현재 캐릭터/태스크" 행 갱신, CLAUDE "Current Next Work" 최신화.
- 비대 SSOT: 날짜/단계 경계로 **분할 아카이브** — 삭제가 아니라 이동, `docs/archive/`로. 무손실 검증(메인 N행 + 아카이브 M행 = 원본). 참조 문서(INDEX/CLAUDE/ARCHIVE-INDEX)와 상호참조도 함께 갱신.

## 4. 가드레일 (박제된 교훈)

- **증거 삭제 금지**: "중복"이라도 삭제 전 byte-identity를 확인하라. 같은 파일이 여러 경로에 있어도 **타임스탬프 1줄만 다른 재생성 복사본**일 수 있고, 각 `experiments/<id>/`는 self-contained 증거 번들이라 경계를 넘는 이동은 자기완결성을 깬다. 디스크/grep 노이즈가 유일 비용이고 인덱싱·토큰엔 무영향이면 **그대로 두는 게 낫다**.
- **과장 금지** (ssot-summary-overclaim): 상단 요약이 근거보다 톤을 키우거나 한계를 누락하지 않는다.
- **분할은 무손실**: 라인 합이 원본과 일치하는지 검증하고, 깨진 상호참조를 고친다.
- **회전 임계 (append-only 로그/SSOT)**: 단일 로그·SSOT가 ~1500줄 초과 시 날짜·단계 경계로 `docs/archive/`에 회전하고 `ARCHIVE-INDEX.md`에 1줄 기록한다(무손실 검증 필수). 임계 미만이면 그대로 둔다 — 회전은 토큰/인덱싱 보호용이지 미관용이 아니다.
- 진단은 grep/wc/find로 사실만 — LLM 추측 금지.

생성 후: 파일이 존재하고 frontmatter(name/description)가 유효한지 head로 확인해 보고하라.
