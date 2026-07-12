---
tags: [guide]
---

<!--
  opencode: 2026-06-26 - 랜딩 페이지 및 VTuber 메이커 디자인 레퍼런스 모음.
  Coded with OpenCode; high-cost model review recommended.
  스크린샷 원본은 design/reference-screenshots/landing/ 에 둔다.
-->

# UI-REFERENCE-LANDING — 랜딩/디자인 레퍼런스

> `snack-web` 랜딩 페이지(`/` )와 VTuber 메이커 제품을 홍보할 때 참고할 서비스/사이트 모음.
> 용도: 카피 톤, 섹션 구성, 시각적 무드(flecto 스타일), 인터랙션 아이디어 수집.
> Updated: 2026-06-26

---

## 1. VTuber / 2D 라이브 아바타 메이커

Snack 제품(사진 1장 → 2D 버튜버 → 웹캠 방송)과 기능적으로 겹치는 서비스들.

| 사이트 | URL | 카테고리 | 특징 | 우리와의 차이 / 참고점 |
|---|---|---|---|---|
| **VRoid Studio** | https://vroid.com | 3D 캐릭터 메이커 | 사진/드로잉 기반 3D 아바타 생성, VRM 출력, VTuber 방송 연동 | 우리는 **2D 라이브 아바타**라 차별화. UI 플로우(업로드→조립→방송)는 참고 가능. |
| **REALITY** | https://reality.app | 모바일 VTuber 앱 | 일본 서비스. 얼굴 추적 라이브 방송, 가상 선물, 커뮤니티 | 일본 런칭 타겟의 대표 사례. 모바일 퍼스트이며, 우리는 데스크톱 웹캠 방송 중심. |
| **CustomCast** | https://customcast.jp | 모바일 VTuber 메이커 | 밴다이남코. 3D 아바타 커스터마이징 + 라이브 + 녹화 | 일본 사용자의 아바타 메이커 UX 기대치를 파악하기 좋음. |
| **V-Katsu** | https://vkatsu.jp | 3D VTuber 메이커 | 일본/컬러. 묘사 기반 3D 캐릭터 + 라이브 방송 | 캐릭터 커스터마이징 UI 참고. |
| **Animaze (구 FaceRig)** | https://www.animaze.us | 데스크톱 아바타 송출 | 웹캠 얼굴 추적 → 2D/3D 아바타, OBS/Zoom 연동 | 기술 스택과 유사(웹캠 트래킹). **다운로드형 앱**이라 우리는 웹 기반 차별화. |
| **VTube Studio** | https://denchisoft.com/vtubestudio | Live2D 방송 툴 | Live2D 모델 + iPhone TrueDepth/웹캠 트래킹, 핫키, 아이템 | 가장 기술적으로 가까운 도구. 우리는 이미지→아바타 생성까지 포함. |
| **VSeeFace** | https://www.vseeface.net | 무료 3D VTuber 프로그램 | VRM 기반, 웹캠 트래킹, 손 추적, OSC | 묘사→아바타 자동화가 아닌 **수동 VRM** 기반. |

### 인사이트
- 대부분 **3D/VRM** 또는 **Live2D 수동 제작** 기반. Snack의 차별점은 **"사진 1장으로 자동 2D 라이브 아바타"**.
- 일본 서비스(REALITY, CustomCast, V-Katsu)는 모바일 퍼스트. Snack은 웹캠 기반 데스크톱 방송 + 모바일 뷰어(추후)로 포지셔닝 가능.

---

## 2. flecto 스타일 SaaS 랜딩 페이지

`flecto.io` 무드(포레스트 그린 + 크림 + 스프링그린, 둥근 패널, 부드러운 모션)와 비슷한 현대적 SaaS 랜딩.

| 사이트 | URL | 특징 | 참고 포인트 |
|---|---|---|---|
| **flecto** | https://flecto.io | Snack 디자인 무드의 원천 | 둥근 `rounded-panel`, 딥그린/크림 교차, 스프링그린 액센트, HeroFlow 스타일 그래픽 |
| **Linear** | https://linear.app | 개발자 도구 랜딩 | 타이포그래피, 모션, 깔끔한 섹션 전환 |
| **Clerk** | https://clerk.com | 개발자 SaaS 랜딩 | 기능 칩, 코드 예시 섹션, 사회적 증명 배치 |
| **Resend** | https://resend.com | 개발자 이메일 SaaS | 미니멀 그리드, 모션, 크림/화이트 톤 |
| **Mintlify** | https://mintlify.com | 개발자 문서 플랫폼 | 그린 계열 브랜딩, 카드 기반 기능 소개 |
| **Supabase** | https://supabase.com | BaaS 랜딩 | 기능 격자, 사례 로고월, 개발자 중심 카피 구조 |
| **Vercel** | https://vercel.com | 클라우드 플랫폼 | 히어로 비주얼, 사회적 증명, 빠른 onboarding CTA |
| **Framer** | https://framer.com | 노코드 사이트 빌더 | 인터랙티브 히어로, 스크롤 기반 데모 임베드 |

### 인사이트
- flecto 외에는 대부분 **다크/네온** 또는 **크림/화이트** 단일 톤. Snack의 **포레스트그린↔크림 교차**는 상대적으로 독특.
- 랜딩에서 "제품이 실제로 작동하는 모습"을 보여주는 인터랙티브 카드(Framer, Linear)가 Snack `AvatarStudio`/`StreamPanel` 목업과 잘 맞음.

---

## 3. 이미지 자산 보관

스크린샷/캡처는 아래 폴터에 저장:

```
design/reference-screenshots/landing/
  vtuber-makers/
  saas-landings/
```

파일명 예시: `landing-flecto-hero.png`, `landing-reality-app.png`

---

## 4. 다음 조사 방향

- 각 사이트의 **히어로 카피**를 비교해 `content.ts`의 `〔仮〕` 카피 교체에 활용.
- **가격 페이지** 구조(Starter/Pro/Enterprise) 수집 → Snack 랜딩 Pricing 섹션 참고.
- 실제 **모바일 랜딩 반응형** 스크린샷 확보.
