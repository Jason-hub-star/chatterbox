---
tags: [goals]
---

# GOAL — 더빙 초보자 신호 마감 (사다리 Y · DUB-BEGINNER-SIGNALS)

> 2026-07-27 더빙 초보자 UX 감사(페르소나 워커 2 + 메인 원본대조 — [../DOGFOOD-AUDIT-2026-07.md](../DOGFOOD-AUDIT-2026-07.md) §0 배치) 후속. 플랜모드 승인됨(2026-07-27).

## 판정 (Why)

"천천히 파트별 반복 녹음" 구조는 완비(프리롤 3‑2‑1·구간 자동정지·루프 테이크·프리뷰 HUD·자동 이동·상시 레이어 — 85c1d60). 주인님 실사용 3대 혼란("저장됐는지 모르겠다·다시 듣는 법 모르겠다·영상이 계속 재생")은 전부 **기능 부재가 아니라 신호 부재**. 이 골은 계기판만 단다 — 신규 Edge/마이그 0, 프론트+i18n only.

## 발견 → 사다리 매핑

| 발견 (§0 배치) | 심각도 | 사다리 |
|---|---|---|
| DUB-RELISTEN-DISCOVERY — 재청취 경로가 title 툴팁에만 | High | Y1 |
| DUB-SAVE-CONFIDENCE — 저장 신호 분산·색상만의 ✓ | High | Y2 |
| DUB-CONFIRM-ALL-SINGLE — 일괄 확정 2건부터만 | Low | Y2 |
| DUB-SOLO-TOAST-LIE — 솔로 자동확정인데 "확정 기다려요" | Med | Y3 |
| DUB-AUTOFLOW-NOTICE — 무언의 재생 재개+다음 파트 점프 | Med | Y3 |
| DUB-PLAYBACK-CONTROL-HINT — 통제권 설명 0 | Med | Y4 |

## 설계 결정

- 재청취 = 기존 rehearse(localMode) 재사용 — 🎧 은 새 로직이 아니라 **보이는 진입점**.
- 솔로 착지 정지: `seekRequest.pause`(솔로만) — 다인은 호스트 pause 가 방 전체 전파라 비적용(ponytail).
- 신규 i18n 7키 ×3로케일(i18nCoverage 게이트 대상).
- Defer: 개인 일시정지 opt-out(vodSync 설계 변경) · 리허설 배속 낮추기 · 온보딩 투어 · 다인 착지 정지.

## 사다리 상태

정본은 [GOAL-LADDER.md](GOAL-LADDER.md) "골 사다리 Y" 표.
