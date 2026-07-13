<!--
  WORLD-SYSTEM.md — 세계관(World) 시스템 SSOT. 씬 매니페스트가 시간축→월드축으로 전환된 구조·확장규칙.
  분류: 설계 (씬/월드 아키텍처). 아트 프롬프트 SSOT 는 scene-prompts.md, 허브 파이프라인은 hub-map-pipeline 스킬.
-->

# 월드(World) 시스템 — 사용자 선택 세계관 · 무한 확장

> **BLUF:** 씬은 **시간축(morning/night)** 이 아니라 **세계관축(WorldId)** 으로 조직된다. 사용자가 월드를 고르면 **로그인→광장→내부 4관이 그 세계로 이어지고**, 새 월드는 `WORLDS` 레지스트리 1줄 + 에셋으로 **무한 추가**된다. 대극장 방 입장 시엔 **방장의 월드로 통일**(P2).

## 왜 (배경)

초기 설계는 접속 시각(타임스탬프)으로 morning/night 씬을 자동 선택했다(구 `pickTimeVariant`). 이를 **사용자가 미리 고르는 세계관**으로 승격 — 시간은 "어느 세계를 보여줄지"의 대리변수였고, 직접 선택이 더 단순하고 확장적이다. 낮/밤은 이제 각각 하나의 월드(`western`=서양 낮 / `eastern`=동양 밤).

## 구조 (SSOT: `src/scenes/manifest.ts`)

- **월드 = 최상위 완결 묶음**: `{ loginSplash, plaza, interiors{4관} }` + accent + category. 한 월드는 내부적으로 일관 → "세계관이 이어진다"를 구조가 보장.
- **좌표는 아트에서 분리** (`Composition` = `plazaShops`% + `interiorAnchors`%): 같은 구도 **리스킨**(밤·업스케일)은 좌표 공유, **새 구도**만 캘리브 1회. 이것이 무한 확장의 핵심 — *코드는 무한, 아트는 월드당 1패스*(정직한 천장).
- **`resolveWorld(id)`**: 월드 에셋 + 구도 좌표를 컴포넌트 소비형태로 조립. **표면별 폴백** — 월드에 특정 표면 에셋이 없으면 DEFAULT(`western`)로 그 표면만 폴백(구도까지 함께 = 좌표 정합 보존). 미지 id 도 DEFAULT.
- **앰비언트 연출("원화의 빛을 움직인다") 2층 관리**: **어디** = 구도 데이터(`plazaLamps` 등화구·`plazaSky` 하늘 밴드 — 리스킨 공유), **얼마나·어떤 블렌드** = `index.css` 프리셋 1곳(`.hub-lamp`·`.hub-cloud`, 맵 데이터에 숫자 분산 금지 — 취향 튜닝이 1파일로 끝나야 함). 둘을 잇는 스위치가 `assets.plazaMood`(`SceneMood`, 미선언=`day`) — 무드는 좌표와 달리 **리스킨마다 달라서** 에셋 메타 소속. 블렌드 방향 원칙(픽셀 diff 실측): 밝은 하늘=multiply 그늘 / 어두운 원화=screen 빛. 무대 쪽 대응물은 `stageBackgrounds.fireGlow`(맵 행별 % 앵커, 미선언=글로우 0).

## 선택·우선순위 (SSOT: `src/stores/worldStore.ts`)

```
effectiveWorld = room ?? personal ?? DEFAULT('western')
```
- **personal**: 사용자 선택. localStorage(`cb.world`) 지속(로그인 전이라 DB 불가 → 기기 값). `?world=<id>` = QA/딥링크 오버라이드.
- **room**: 대극장 방 입장 시 방장 월드(`rooms.world_id`)로 통일 → 전원·뷰어 같은 배경. 퇴장 시 해제. **(P2 — 미구현)**
- `useEffectiveWorld()` 반응형 훅. 소비처 4곳(`AuthShell`·`LoginPage`·`LobbyPage`·`useInterior`)이 `resolveWorld(useEffectiveWorld())`.

## 월드 갤러리 (SSOT: `src/components/shared/WorldGallery.tsx`)

스케일 대비 선택 UI — `WORLDS` map 렌더(썸네일 그리드 + 카테고리 필터 + lazy 썸네일 + 활성/잠금 상태). 선택 → `setPersonal` + 스플래시 전환 + accent 리틴트. **로그인 스플래시 컴팩트 어피던스**(현재 월드 칩)로 진입(의상실 진입은 후속). `Modal`(widthClass) 재사용. row/화살표/토글은 N 커지면 붕괴라 그리드 채택.

- **무게 flat(실측)**: 갤러리는 풀아트 아닌 **썸네일(~12KB) lazy** 만. 세션 클라 로드 = 현재 월드 1개(~1.5–3MB) + 보이는 썸네일 ~0.2MB → **월드 수 무관 일정**. 월드당 풀아트 ~5MB(login 0.46+광장 1.19+내부 3.4)는 **서버 저장만**. ~10월드↑는 `public/scenes/`→R2/CDN 이전(매니페스트 경로 스왑, 재작성 아님). 관련 [[frontend-cf-pages-deploy]].
- **확장 훅**: `category`(필터)·`locked`(미완/프리미엄='준비중' 선택잠금)·즐겨찾기(예정). 새 월드 = `WORLDS` 1줄 → 갤러리 자동 등장(UI 코드 0).

## 현재 월드

| id | label | 상태 |
|---|---|---|
| `western` | 서양 판타지(낮) | 완성 — login+광장+내부4관 |
| `eastern` | 동양 판타지(밤) | **로그인 스플래시만 실존**(한복 여인·빨간 유지우산·범동양 야경·동양 용 · 3072×2048). 광장·내부는 서양 폴백 — 아트 생성 예정 |

**동양 아트 원칙(주인님 확정):** 의상은 **한복(韓服)** — 중국 한푸(漢服) 아님. 도시는 중국 특정색(용문양 일변도·한자 간판) 배제한 **한·일·중 블렌드**(특정 국가 무표기). 상세 프롬프트는 `scene-prompts.md`.

## 로드맵

- **Step 3 잔여**: 동양 광장 + 내부 4관 생성(자체 구도 → `EASTERN` Composition 캘리브, 영문 간판 금지) → eastern 완성. 의상실 갤러리 진입.
- **P2 방=방장**: `users.world_id`·`rooms.world_id` 마이그 + create-room 이 방장 personal 복사 + **RoomPage 테마 배경 레이어 신설**(현재 방은 `bg-stage-*` 솔리드, 테마 배경 없음) → `resolveWorld(room.world_id)`. ⚠️ 월드당 방 배경 = 추가 아트 1장.
- **P3+**: 새 월드 무한. 리스킨=좌표 공유 / 새 구도=캘리브 1회.

## 확장 절차 (새 월드 추가)

1. 아트 생성(`scene-prompts.md` 화풍고정 + `hub-map-pipeline` 스킬) → `public/scenes/**/<world>.webp` + 썸네일.
2. `WORLDS` 에 1줄 등재(assets 경로 + composition + accent + category). 리스킨이면 기존 Composition 참조, 새 구도면 캘리브 후 신규 Composition(가로등 `plazaLamps`·하늘 `plazaSky` 앵커 포함).
2-1. 밤/어두운 광장이면 `assets.plazaMood: 'night'` 1줄 + `index.css`에 `.hub-cloud--night` 프리셋을 **그 원화 픽셀 diff 캘리브로** 추가(현재 미존재 — 첫 밤 원화 때 작성).
3. i18n `world.<id>` 라벨 ko/en/ja. → 갤러리 자동 노출.
