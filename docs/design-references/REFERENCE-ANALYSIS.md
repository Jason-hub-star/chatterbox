---
tags: [design]
---

# 디자인 레퍼런스 분석 — ChatterBox 랜딩

추출일: 2026-06-27 (agent-browser)

---

## cluster.mu/en

### 핵심 패턴

- **"Events Now Live"** — 페이지 최상단 첫 섹션. 지금 진행 중인 이벤트를 LIVE 배지와 함께 즉시 노출
- 섹션 순서: Live Events → Upcoming → Online Spaces → Top Worlds (Art/Social/Game) → Creator Guides
- 카드 그리드: 섬네일 + 참가자 아바타 + 실시간 인원수
- 탭 필터: Worlds / Events (pill 형태, border-radius: 18px)

### 색상
```
primary:    #008CFF  (파란 액센트 — live/active 표시)
body:       #080133  (딥 네이비)
pill.active.bg:    rgb(229,243,255)
pill.active.color: rgb(0,140,255)
border-radius (pill): 18px
border-radius (cta): 100px
```

### 우리가 채택할 패턴
- Hero 또는 그 직하단에 **"지금 N명이 연기 중"** live 배지 노출
- Live 표시에는 cluster blue `#008CFF` 대신 우리 `accent #56F09F` + `primary #004737` 활용

---

## flecto.io

### 핵심 패턴

- **Hero**: 다크 그린(#004737) 라운드 패널이 크림/화이트 배경 위에 float. 패널 안에 큰 제목
- **제품 UI 미리보기**: Hero 패널 내부에 실제 제품 카드 + 채팅 UI를 플로팅 카드로 삽입
- **Typography**: 두꺼운 display 헤딩 + 라이트 subtitle
- **CTA**: Login = 초록 pill 버튼, Book a Demo = outlined

### 색상
```
body.color: rgb(0,71,55)  = #004737  ← 우리 primary와 완전 동일!
body.bg:    #ffffff
--radius:   20px
font:       roobert-regular (= 우리 Schibsted Grotesk에 해당)
```

### 우리가 채택할 패턴
- Hero: `bg-primary` (dark green) 라운드 패널 + 실제 ChatterBox 룸 UI 미리보기 (제공된 스크린샷 활용)
- flecto의 색상 = 이미 우리 토큰과 정렬됨 → 추가 디자인 토큰 수정 불필요

---

## 종합 적용 방향

| 패턴 | 출처 | 적용 위치 |
|---|---|---|
| "지금 N명이 연기 중" live 배지 | cluster.mu | Hero subtitle 아래 |
| Dark green rounded hero panel | flecto.io | Hero 배경 카드 |
| 제품 UI float in hero | flecto.io | Hero 안 ChatterBox 룸 스크린샷 |
| 이벤트/세션 카드 그리드 | cluster.mu | TheaterPreview 또는 별도 Activity 섹션 |
| Pill category filter | cluster.mu | UseCases 탭 |

### 추가 디자인 토큰 (tailwind.config.ts에 추가)
```ts
live: "#008CFF"   // live 배지 전용 (cluster.mu blue)
```
