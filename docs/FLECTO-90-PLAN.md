---
tags: [guide]
---

# FLECTO-90 Plan — 인터랙티브 가짜 제품-UI 목업으로 flecto 90%+ 카피

작성: 2026-06-20 · 상태: **✅ 실행 완료 (phase-loop, P1~P5)** · FLECTO-80 + 인터랙션 패스 후속

## 배경 (왜)

FLECTO-80 + 인터랙션 패스로 디자인 톤은 flecto 80에 도달했지만, flecto.io 본문을 우리 섹션과 직접 대조(agent-browser)하니 **90%로 못 가는 갭이 "스토리텔링 매체"** 한 곳에 몰려 있었다.

flecto 정체성 = **추상 그래픽이 아니라 "실제 제품 UI를 닮은 인터랙티브 가짜 카드"** (채팅 말풍선·예약 명세표·토글하면 숫자가 바뀌는 결제 패널·face-scan 루프 애니). 우리는 같은 자리에 추상 SVG + 아카네 1장 → 제품 증거 밀도가 절반.

→ flecto의 핵심 매체를 우리 제품 스토리(이미지→리깅→방송)로 번역해 **코드로** 구현. 실사 영상 없이도 "제품이 살아있다"는 인상.

## 구현 결과 (phase-loop, 각 Phase tsc/dev 게이트 + agent-browser 데스크탑+모바일 + Opus 자기리뷰 5/5)

| Phase | 산출물 |
|---|---|
| **P1 콘텐츠 SSOT** | `content.ts` 에 `studio`/`liveFlow`/`stream`/`showcase` 키 + `hero.chips` 추가(仮 카피). 컴포넌트가 읽을 텍스트 선반영. |
| **P2 AvatarStudio** ★★★ | `sections/avatar-studio/` — まばたき/リップシンク/髪 토글 → 미리보기 CSS 모션(sway/blink/talk) + 출력 스펙 실시간 재계산. flecto 토글-데모의 우리 버전. ground-truth: 토글 OFF→스펙 텍스트 "✓ 自動"→"—". |
| **P3 LiveFlowLoop** ★★★ | `sections/live-flow/` — 業ロード→リギング中(진행바)→🔴LIVE→完了 자동 순환. HowItWorks 비주얼로 임베드. ground-truth: 진행바 누적 2→3→4. |
| **P4 StreamPanel** ★★★ | `sections/stream-panel/` — OBS 닮은 방송창(아바타 합성+가짜 채팅 순환+시청자수+LIVE+그린백 토글). ground-truth: 채팅 1→2→3, 그린백 토글 accent↔dark. |
| **P5 ShowcaseTabs + chips + count-up** ★★/★ | `sections/showcase/` 세그먼트 탭「配信者向け/視聴者向け」로 Studio+Stream 호스팅(flecto For-Business/For-Customer 듀얼). 히어로 기능 chip 줄. `ui/CountUp` (inView 카운트업, reduce 즉시값) → 시청자수 0→1,284·히어로 stats. |

## 토큰 추가

- `tailwind.config.ts` keyframes/animation: `avatar-sway`·`blink-dot`·`talk-bar` (AvatarStudio 미리보기 모션). 신규 hex 없음 — accent(#56F09F) 토큰만.

## 페이지 구성 변화

`Hero → LogoMarquee → Problem → HowItWorks(+LiveFlowLoop) → Features → **ShowcaseTabs(Studio/Stream)** → Comparison → UseCases → …`

## 검증

- 최종 `npm run build` 그린 — **First Load 152kB** (FLECTO-80 144kB·인터랙션 148kB 대비 +4kB; 인터랙티브 4종 추가에도 경량).
- 인터랙션 전부 ground-truth(DOM/computed style) + 데스크탑(1280)·모바일(375) 스크린샷 검증.
- reduced-motion: CSS 애니는 globals.css 글로벌 룰로 정지, JS 루프(useFlowCycle/useFakeChat/CountUp)는 `useReducedMotion`으로 최종 정적/즉시값. 토글 등 상태 변화는 reduce 여도 유지.
- 불변식 준수: 텍스트=`content.ts`·자산=`assets.ts`·신규 hex 금지.

## 알려진 버그 수정

- **CountUp 0에 갇힘**: `value.match()`(매 렌더 새 객체)를 `useEffect` deps 에 넣어 setN 마다 effect 재시작→애니 start 리셋. 파생 원시값(`hasNumber`/`target`)만 deps 로 변경해 해결. (큰 수 1,284 에서만 표면화, 작은 수는 우연히 통과.)

## 후속 (플랜 외)

- 실사 자산 완성 시 `assets.ts` 빈 슬롯 채우기(StreamPanel 씬·LiveFlow 단계가 실사로 즉시 격상).
- 이모지 내러티브 스크롤 캡션(★)은 의도적 캡션 삭제 결정과 충돌해 보류.
- 〔仮〕 카피 확정·BRAND·Vercel 배포.
