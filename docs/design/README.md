# design/ — 디자인 토큰 관리 폴더

이 폴더가 사이트 비주얼의 **단일 진실 원천(SSOT)** 입니다.

| 파일 | 내용 |
|---|---|
| `DESIGN-TOKENS.md` | ⭐ 사람이 읽는 토큰 표 (색·타이포·여백·radius·shadow·모션). **여기를 먼저 고친다.** |
| `UIUX-OVERHAUL-2026-07.md` | 방 밖 전체(홈·탐색·생성 진입·공개 관전) 개편 방향 — 치지직·힉스필드·Cluster·VRoid Hub·ZEP 추출 기반. |
| `product-ui-references/` | 위 5개 사이트 designlang 추출 증류본 (2026-07-16). 레퍼런스 전용 — 코드에 직접 복제하지 않음. |
| `flecto-reference/` | flecto.io 디자인 추출(designlang) 원본. 레퍼런스 전용 — 코드에 직접 복제하지 않음. |
| `stitch-mockups/` | 페이지별 AI 생성 목업(Google Stitch, 19 screens) + 페이지별 `prompt.txt`. `index.html`이 갤러리 뷰어. 참고용 시안 — 코드 구현의 정밀 스펙은 아님. |

## 코드와의 연결

- 색·타이포·radius·shadow → `tailwind.config.ts`
- 모션(duration·easing) → `src/lib/motion.ts`

`DESIGN-TOKENS.md` 의 값과 위 두 파일은 **항상 일치**시킵니다. 토큰을 바꿀 땐 문서 → 코드 순서로.

## 추출 재실행 (레퍼런스 갱신 시)

```bash
mkdir -p /tmp/dl-out && cd /tmp/dl-out
npx -y designlang 'https://flecto.io/?ref=godly'   # 따옴표 필수(zsh ? 글로빙 방지)
# 산출물 design-extract-output/ 에서 필요한 것만 flecto-reference/ 로 복사
```

> 추출 하네스: `jason-agent-harness-template/harnesses/designlang-extract-to-ui-primitives.md`
