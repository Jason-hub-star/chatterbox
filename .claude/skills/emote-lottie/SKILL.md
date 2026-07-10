---
name: emote-lottie
description: ChatterBox 이모트 Lottie 자산 파이프라인 — 옐로/앰버 라운드 이모트를 프로그래매틱 저작 → lottie_light 헤드리스 몽타주 육안 검증 → LOTTIE_BY_ID 배선 → 게이트/인룸 E2E. "이모트 추가", "새 이모트", "이모트 애니메이션", "옐로 이모트", "이모트 Lottie", "리액션 이모트 만들어" 요청 시. 2026-07-10 기본 8종 저작 세션에서 밟은 함정을 고정.
---

# emote-lottie

이모트 비주얼은 **데이터 주도**라 컴포넌트를 건드리지 않는다. 자산 1파일 + 매핑 1줄이 전부고, 나머지는 저작 품질과 검증이다.

## 계약 (코드 로직 변경 0 — 어기면 설계 위반)

- 카탈로그: `src/features/reaction/reactionCatalog.ts` `EMOTE_CATALOG` 1행(`{id, emoji, label}`) — **id 가 안정 키**(파일명·매핑 키·역색인 전부 이 id).
- 자산: `public/lotties/emotes/<id>.json` — **96×96 · fr60 · ip0/op120(2s) · 심리스 루프 · 투명배경**, 개당 1.5~5KB.
- 매핑: `src/features/reaction/lottieEmoteMap.ts` `LOTTIE_BY_ID` 1줄. 빈 항목 = emoji 폴백(정상 동작).
- 게이트: `tests/unit/lottieEmoteMap.test.ts` 가 고아 매핑·자산 누락·필수 키(v/fr/ip/op/w/h/layers)를 잡는다.
- 렌더러: `EmoteGlyph.tsx` 단일 지점(lottie_light 지연 청크·성능 가드 내장) — **손대지 말 것**.

## 스타일 (옐로 세트 통일 — 주인님 요구 "이모지는 노란색")

- 팔레트: 본체 `#FFC53D` / 포인트·외곽 `#FF8C2A`(fire-amber) / 이목구비 `#5C3A00` / 하이라이트 `#FFE08A` / 눈물·글린트 `#FFF5E0` 계열.
- 얼굴형 = 공용 `faceShapes()`(66px 원 + 글로스 + 3px 앰버 외곽), 심볼형 = 앰버 fill+스트로크. 신규도 이 헬퍼 재사용해 톤 유지.
- 모션: 이징 앵커(SINE 진동/SETTLE 안착/POP 팝) 파생 · 2초당 제스처 1~2개 · 레이어 ≤5.

## 함정 (이 세션 실측 — 재발견 금지)

1. **rtk 가 `npx` 를 재작성** — 생성 도구 설치·실행은 절대경로 `/opt/homebrew/bin/npx`. ("skills CLI 미존재" 오판의 진범. `text-to-lottie` 스킬은 이미 설치됨 — Lottie 문법·모션 레퍼런스는 그쪽 `references/` 참조.)
2. **bodymovin 이징은 세그먼트 시작 kf 에 `o`+`i` 둘 다** — lottie-web 실측. (lottie-spec 문구 "i 는 도착 kf"와 다름 — 렌더러 기준을 따른다.)
3. **hold(`h:1`) kf 로 사이클 리셋** — hold 는 자기 `s` 를 다음 kf 까지 유지 후 점프컷. 점프는 불투명도 0 구간에 숨긴다.
4. **파티클 사이클은 0..120 안에 완결** — 루프 경계에 걸친 2번째 사이클은 심에서 팝(0프레임 값 ≠ 119프레임 값). 눈물·불티류 필수 점검.
5. **여러 인스턴스가 animationData 공유 시 `structuredClone`** — lottie 가 데이터를 변이함(EmoteGlyph 는 이미 처리).
6. **표정 오독** — 슬픔 = 둥근 눈 + 안쪽 올라간 눈썹 + ∩입(각지게 찌푸린 눈은 분노로 읽힘) · 박수 = 임팩트 프레임에 손 실접촉 + 스파크 · 엄지 = 팔뚝과 손바닥 실오버랩(분리되면 성냥개비).
7. **playwright `waitForFunction` options 는 3번째 인자** — 2번째에 넣으면 arg 로 먹혀 기본 30s 적용(E2E 쪽, supabase-slice-verify 함정 20 참조).

## Steps

1. **디자인**: id 별 컨셉 한 줄(전 세트와 톤 통일). `templates/gen-emotes.mjs` 를 scratch 로 복사 — 헬퍼(anim/gr/el/rc/sh/fl/stk/layer/doc·팔레트·이징)는 그대로, 신규 이모트 블록만 추가.
2. **생성 → 몽타주 육안**: `node gen-emotes.mjs` → `templates/build-harness.mjs`(대상 id·프레임 수정) → 헤드리스 Chrome `--screenshot` → **Read 로 육안 판정**(프레임 0/8/16/45/100 그리드, 몽타주 1장). 오독·비접촉·분리는 지오메트리 수정 후 재몽타주 — 2~3라운드가 정상. 하네스는 lottie_light min.js+JSON 인라인 `file://` 단일 페이지라 서버·CORS 불요, 렌더러 = 앱과 동일(ground truth).
3. **배선**: `LOTTIE_BY_ID` 1줄(+신규 이모트면 `EMOTE_CATALOG` 1행).
4. **게이트**: `npm run type-check && npm run lint && npx vitest run && npm run build`.
5. **(배선 로직을 건드렸을 때만) 인룸 E2E**: `templates/emote-room-e2e.mjs` — dev 프론트(프로드 백엔드)+헤드리스 Chrome, 콘솔 슬롯 svg·발사→플로트 svg·지연청크·콘솔에러 실측. supabase-slice-verify 함정(소셜우선 로그인·버튼 disabled 대기) 준수, 테스트 방·계정 finally 삭제.

## Verify

- 몽타주에서 전 칸이 의도한 표정/동작으로 읽힘(육안 — 성역, 생략 금지).
- vitest `lottieEmoteMap` 계약 통과 · 자산 개당 ≤5KB.
- (E2E 시) 콘솔 N/N svg · 플로트 svg · 콘솔에러 0.

## Failure / Fallback

- 렌더 공백/모양 깨짐 → 함정 2(이징 위치)·path 탄젠트(i/o 는 정점 상대좌표) 순으로 의심.
- 루프 심 팝 → 함정 4. 첫/끝 kf 값 diff 로 확인.
- 몽타주가 전부 빈 칸 → 하네스 HTML 의 `window.__err` 확인(콘솔 에러 수집됨).
