---
name: hub-map-pipeline
description: ChatterBox 허브 맵 파이프라인 — 광장/구역 블록·내부 관(館) 원화 생성→핫스팟·앵커 캘리브레이션→manifest 배선→유도 3단 인터랙션→E2E. 새 맵(밤 variant·신규 구역 블록·새 내부 관·다른 씬 허브)을 만들 때 사용. 화풍 고정 생성은 scene-pipeline 참조.
---

# Hub Map Pipeline

게임 마을식 허브(가게=기능 입구) 맵의 제작→배선→검증 전 과정. 로비 v3(광장+내부 4관)로 확립.
SSOT: `docs/design/scene-prompts.md §로비 v2/v3` + `src/scenes/manifest.ts`(좌표·배선) + `src/index.css .hub-*/.interior-*`.

## 절대 게이트

- **모든 생성 프롬프트는 실행 전 원문 제시 → 주인님 콜**(scene-pipeline 동일).
- 생성물 육안 + **캘리브레이션 실렌더**(디버그 오버레이) 없이 좌표 확정 금지.

## 1. 원화 생성 규격 (생성 자체는 scene-pipeline 화풍 고정 기법)

**허브 블록(광장/구역):**
- 프롬프트에 랜드마크별 **위치를 명시**: "(1) ... dominating the left; (2) ... on the right; (3) ... mid-right; ..." — 건물이 겹치면 핫스팟이 못 앉는다. "composed as a game hub where each building is a distinct landmark with clear separation" 문구 필수.
- **좌우 끝 = 석조 아치 마감**("both far edges framed by stone archways") — 블록 스트리트 이음 규격. 확장 시 **새 블록의 좌단 아치가 경계 담당**(기존 블록에 우단 아치가 없어도 됨 — plaza-1 실사례).
- 미래 기능 자리: 예비 건물("one modest unmarked storefront with shuttered windows") + 확정 미래 기능의 건물(예: 극단 회관)을 **그림에 선점**하고 UI 는 '준비 중' — 맵 재생성 없이 기능이 입주.
- 문화축(scene-prompts): 오전=서양 판타지·글자 없는 문양 간판. 내부 씬의 장식적 영문은 주인님 수용 판정 사례 있음(대극장 간판) — 그래도 기본은 무문자.

**해상도 규격(로비 v3.4 확립):** 생성기는 1536×1024가 상한 — 그대로 쓰면 레티나(물리 ~3024px)에서 2× 업스케일 소프트닝(실측 1.97×, 육안 확인). **모든 허브/내부 에셋은 fal ESRGAN `scale:2`로 3072×2048 승급 후 webp q82 배포**(장당 0.8~1.2MB). 소스는 계보 폴더 무손실 PNG에서(webp 재압축 중첩 금지), 2x PNG도 계보 보존. diffusion계(creative) 업스케일러는 그림을 다시 그려 화풍·앵커 좌표가 틀어짐 — 금지. % 좌표는 해상도 무관(파일명 유지 시 manifest 무변경).

**내부 관(館):**
- **정박 오브젝트를 프롬프트에 명시** — UI 가 앉을 자리를 그림이 만들게: 게시판+빈 액자(포스터), 중앙 작업대+모형(폼+현판), 테이블들(칩), 대형 거울(프리뷰), 매표소 창구(예약 폼).
- 4장 병렬 생성 가능(threading, 각 ~160s — `gen_interiors.py` 패턴, 계보 폴더 보관).

## 2. manifest 배선 (`src/scenes/manifest.ts`)

- **모든 좌표는 variant(시간대) 소속** — 밤 확장 = `variants.night` 에 밤 에셋+밤 좌표 등재만(코드 무변경). 내부 점진 등재는 `useInterior` 가 morning 폴백.
- `hub.blocks[].shops[]`: **dest 는 기능명**(rooms/social/create/profile/practice/troupe/reserved — 건물 은유는 주석). box = 이미지 기준 %(1536×1024). 신규 dest 는 HubDest 유니온 + HubMap 라벨/스타일 + LobbyPage 핸들러 + i18n `hub.<dest>.{title,hint,cta}` ×3.
- **로비 IA 재편(2026-07-09) — dest 이름은 고정, 기능만 재정의 가능:** `create` = **쇼츠 제작소**(공방 건물). 방 생성이 아니라 VGEN 쇼츠 생성으로 — VGEN 이 room 강결합(`vgen_jobs.room_id`·호스트검증·R2 경로 SEC-2/3)이라 `ensure-studio-room` 으로 **유저당 숨겨진 스튜디오 방(`is_studio`, `public_rooms` 제외, 유저당 유니크)** 을 재사용해 스키마·보안 무변경으로 우회. `VgenStatusTab(roomId)` 그대로 마운트. 방 생성은 대극장(`rooms`) '무대 열기' 탭(`theater.tabCreate`)으로 흡수, `social`(찻집)=사람 전용(방 재입장 제거·SNS 커뮤니티 자리 선점). 교훈: **간판/기능은 dest 이름 안 바꾸고 i18n `hub.<dest>.*` + 페이지 교체만으로 재정의** — 원화·좌표·라우팅 키 불변.
- `interiors[dest].anchors`: 관별 정박 % 박스. 페이지는 `.interior-anchor` + `--al/--at/--aw` 변수로 소비(md+ absolute / 모바일 정적 카드 폴백 — InteriorShell).
- 블록 확장: blocks 에 append — 기존 블록 픽셀·좌표 **불변**. edits 로 기존 그림 연장은 전역 재생성 함정으로 **금지**.

## 3. 캘리브레이션 (성역)

1. 초기 좌표는 원화 육안(% 눈대중)으로 등재.
2. dev 서버 + 헤드리스로 **디버그 아웃라인 주입 스크린샷**: `page.addStyleTag('.hub-shop{outline:2px dashed red}')` (내부는 `.interior-anchor`) → 박스가 건물/오브젝트에 앉았는지 육안 → % 조정 1~2회. 참고 스크립트: 세션 스크래치 `hub_calibrate.mjs`.
3. 내부 스크린샷은 **페이드인(0.45s) 이후** 캡처 — 직후 캡처는 어둡게 나옴(오진 주의).

## 4. 인터랙션 규격 (검수 확정 — 임의 변경 금지)

- **호버 = A+B**: 컬러 스포트라이트(멀티플라이+탈채 오버레이에 mask 구멍) + 카메라 푸시(scale 1.035, origin=건물 중심). 글로우 방식은 검수에서 기각됨(밝은 낮 원화에서 구별 불가).
- **클릭 = 푸시 심화(1.16)+페이드 → 라우트 전환** → 내부는 `interior-in` 크로스페이드.
- **입장 웨이브 = localStorage 평생 1회**, 스포트라이트 순차 점멸. **플래그는 완주 시점에 세팅** — 시작 시 세팅하면 StrictMode 이중 마운트가 첫 웨이브를 삼킨다(실버그).
- **기본 UI 즉시 오픈**: 내부 진입 후 추가 클릭 0(공방 autofocus 등). 앵커는 "열려 있는 UI 의 자리"지 "눌러서 여는 것"이 아님(주인님 확정).
- 살아있는 앵커 관당 1개(액자 포스터·현판 실시간·테이블 칩·거울 프리뷰) — 그림이 상태를 알게.

## 5. 함정 전수

- **blend 레이어(스포트라이트·소등)는 씬 직속 형제** — 버튼(스태킹 컨텍스트) 안이면 원화와 안 섞여 스티커가 된다.
- off/휴지 전환 시 `animation: none` — flicker 키프레임이 opacity 를 캐스케이드에서 덮는다.
- `backdrop-filter` 는 헤드리스 SwiftShader 에서 무효과(computed 는 정상) — 판정은 mask/opacity 로, 시각 검증은 multiply 경로로.
- **Playwright 잔류 마우스**: 로그인 클릭 좌표에 마우스가 남아 광장 로딩 순간 그 자리 가게 호버가 오발동 → 검증 전 `page.mouse.move(중립)`.
- 전체화면 cover: 씬을 `max(100vw, 150vh)`(3/2 기준) 센터 배치 — % 핫스팟은 씬 기준이라 크롭돼도 정합. 엘리먼트 스크린샷의 상하 검은 띠는 뷰포트 밖 캡처 한계(오진 주의).
- 통일감: 내부 패널은 `.interior-panel`(흑갈)이 `--color-stage-border` 를 나무톤으로 스코프 오버라이드 — 새 관도 이 패널만 쓰면 자동 정합.

## 6. 앰비언트 (시도→롤백 기록, 2026-07-08)

고래 매팅(육안 폴리곤 — 어둡기 자동검출은 밝은 별빛 텍스처에 실패)+TELEA inpaint+PixiJS MeshRope 유영까지 구현·검증했으나 **주인님 판정 "너무 어색" → 전면 롤백**(원화의 정적 고래 유지). 자산은 계보 폴더(`~/Documents/채터박스/v2/parts/whale-*.png`·`parts/*_sky.png`)와 git 이력(`PlazaAmbient.tsx`)에 보존. 재시도 시 개선 가설: 회화 스타일 스프라이트의 메시 굴곡이 "종이 인형" 느낌을 준 것 — 굴곡 없이 초저속 드리프트+스케일 호흡만, 또는 i2v 시네마그래프 검토.

## 마감 체크리스트

- [ ] scene-prompts §로비 규정 갱신(+새 함정은 이 스킬에)
- [ ] manifest 등재 + 캘리브레이션 실렌더 + 게이트 4종 + E2E(전환·기본오픈·모바일·reduced-motion)
- [ ] 원본 계보 `~/Documents/채터박스/v2/` 보관 + GAP-MATRIX 진행로그
