---
tags: [spec]
---

<!--
  증류 2026-07-02 (Opus). 원천 = /Users/family/jason/Vtube/docs/ref/ (하이쿠 트리아지 + Opus 원본 검증).
  목적: ChatterBox가 "버튜버가 어떻게 만들어지는가 + 무엇을 납품받는가"를 알게 한다(드리프트 방지).
  원칙: ChatterBox는 **안정된 출력 계약**만 소유하고, 진화하는 R&D 파이프라인은 Vtube 문서로 링크(복제 금지).
-->

# 아바타 파이프라인 & 출력 계약 (Vtube AUTORIG → ChatterBox)

> **두 프로젝트 경계**: **Vtube = 아바타 공장**(프롬프트/PNG → 자동리깅 → rig 산출, R&D로 진화 중) · **ChatterBox = 무대**(그 산출물을 PixiJS로 렌더해 실시간 멀티플레이어). ChatterBox는 공장 내부가 아니라 **납품 규격**만 알면 된다.

---

## 1. E2E — `project.json`은 어떻게 태어나나 (Vtube V2 "OMNIPATH")

```
입력 두 경로:
  Path A (텍스트) → GPT-image로 마스터 2048² 생성
  Path B (PNG 업로드) → analyze_master_png.py (ToonOut+Florence-2+anime-face-detector) 자동 분석
        ↓ character.yaml (body_spec·special_parts·eye_pattern·hair_physics)
  [P0] 프리플라이트 검증 (눈/입 존재)
  [P1] See-through 분해 (Colab/Modal A100 2048) → 31~45 레이어 PNG + depth map
  [P1.5] Grounded SAM2 파트 role 분류 (hair/hat/eyes — headwear 오염 해소)
  [P3] build_autorig_rig_v0.py → character.json (mesh·deformer·parameter·keyform)
  [P4] scan_rig_health.py (9게이트) → PASS
  [P4.5] inject_tha4_eyes.py (blink + 웹캠 트래킹 표준 눈)
  [P5] build_player_webapp → [H2] 로컬 drive.html 웹캠 확인 → 배포
```

- **비용**: Path A $0.14~0.26 · Path B $0.10~0.18 /캐릭터 (Modal A100). 결정론적(동일 입력→동일 rig).
- **커버리지**: 동물귀·꼬리·모자·이색동공·치비 등 VTuber 80%+ (special_parts → deformer 자동 배정).
- **원천**: `Vtube/docs/ref/AUTORIG-PIPELINE-V2.md`(2026-06-29, V1은 LEGACY) · `AUTORIG-MASTER-SPEC.md`(마스터 11조건) · `SEETHROUGH-THA-FUSION-001.md`(분해).

## 2. 출력 계약 = `project.json`

- **Vtube 빌드 산출 `character.json` ≡ ChatterBox 로드 `project.json`** (동일 스키마·내용, 파일명만 다름. Storage: `avatars/{c}/project.json`).
- **스키마 SSOT는 `specs/rig-format.md` §2** (parts·meshes·deformers·parameters·keyform_bindings·part_opacity_keyframes·_mini_rig·physics_profiles). 여기서 재기술하지 않는다 — 그 문서가 정본.
- 렌더러가 의존하는 **이름 컨벤션**(디포머 ID·파츠 ID 접두어·표준 `ParamXxx`)은 `rig-format.md` §7.5 "렌더러 컨벤션 계약" 참조. AUTORIG가 전 캐릭터에 일관 보장.

## 3. 파라미터 2계층 — 트래킹(라이브) vs 표정(UI 번들)

**핵심(EXPR-SET-001)**: 파라미터는 두 소스가 공존한다.

| 계층 | 소스 | 파라미터 | ChatterBox 함의 |
|---|---|---|---|
| **트래킹(라이브 가산)** | 웹캠(로컬)·RT-02(원격) | `ParamMouthOpenY`(립싱크)·`ParamEyeLOpen/ROpen`(깜빡)·`ParamAngleX/Y/Z`(머리각, 원격=0)·`ParamMouthForm`(현 drive.html은 smile−frown로 구동) | 얼굴 따라 실시간 |
| **표정(UI 번들 = `.exp3` 등가)** | 핫키/버튼(트리거) | `ParamEyeExpr[0~6]`=6감정(neutral·joy·sorrow·angry·surprised·shy)·`ParamMouthForm`(감정)·`ParamCheek`·`ParamGloom/Tear/Sweat` | 버튼으로 "필살기"(하트눈·눈물·홍조) 즉발 |

- **공존 정책**: 표정 번들이 **베이스/오버라이드**를 얹고, 트래킹이 **위에 가산**(깜빡임·MouthOpenY·머리각). → 웃는 표정 켠 채 말하면 입꼬리는 웃고 벌림은 립싱크.
- `ParamMouthOpenY`(립싱크)와 `ParamMouthForm`(표정)은 **독립** — 충돌 없음.
- 원천: `Vtube/docs/ref/AUTORIG-EXPR-SET-001.md`.

## 4. 트래킹 → 구동 매핑: 현황과 갭

**핵심 통찰(VOICE-ROOM-001 §2)**: **갭은 리그·트래킹이 아니라 "매핑/UI 층"에 있다.** 리그엔 표정 부품이 다 있고(`ParamEyeExpr`·`accent_*`), 와이어는 이미 52채널을 전부 수신 중. 싸게 채울 수 있다.

| 페이셜 테스트 동작 | blendshape | 파라미터 | 현재 |
|---|---|---|---|
| 깜빡임 / "아~" / 미소(입) | eyeBlink·jawOpen·mouthSmile | EyeLOpen/ROpen·MouthOpenY·MouthForm | ✅ 매핑됨(drive.html) |
| 볼 빵빵 / 눈웃음 / 슬픔·화남 | cheekPuff·eyeSquint·browInnerUp+frown·browDown | Cheek·EyeSmile·Gloom | ❌ **미매핑** (리그·와이어는 준비됨 → 매핑만 추가) |

- **스무딩 표준 = One-Euro Filter**(MediaPipe 지터 제거; 현 EMA/데드존 위에 도입 권장). 손실 프레임은 이전값 유지/페이드.
- **눈 개폐**: 단순 `1−blink` 아님 — 적응 데드존+baseline 추종, THA4 리그라 **양눈 링크**(독립 윙크 불가). 상세 `rig-format.md` §3.
- 원천: `Vtube/docs/ref/AUTORIG-VOICE-ROOM-001.md`(52ch 매핑·페이셜 테스트 8동작·필살기 핫키).

## 5. ChatterBox 함의 (경로 B & 그 이후)

- **경로 B(현재)**: `public/aria-player` 렌더러를 `src/lib/pixi/aria/`로 이식(인스턴스화) + RT-02 blendshape → `blendshapesToRigParams()` → 원격 아바타 구동. **리그·와이어는 이미 준비됨** — 할 일은 매핑/구동 배선.
- **다음(매핑/UI 층 = 싼 고가치)**: cheek/eyeSmile/brow 매핑 보강 + 표정 핫키(ParamEyeExpr·accent 트리거) + One-Euro 스무딩. 리그 변경 0.
- **멀티 스케일(B3+)**: N명 시 AOI 선택구독 + active-speaker 활성 + 적응 레이트(52ch×30fps≈6.2Kb/s/명, N² 완화). `state-machines/Avatar.md` 6인 렌더와 정합.

## 6. 원천 문서 (Vtube 로컬 — 깊이는 여기로)

`/Users/family/jason/Vtube/docs/ref/` (별도 레포, 참조 전용 — **복제 금지**):

| 문서 | 커버 | 신선도 |
|---|---|---|
| `AUTORIG-PIPELINE-V2.md` | E2E 파이프라인(현행 OMNIPATH) | 2026-06-29 |
| `AUTORIG-MASTER-SPEC.md` | 마스터 11조건·표정/입 시트 규약 | 2026-06-11 |
| `AUTORIG-EXPR-SET-001.md` | 표정=감정 풀페이스 세트·립싱크 공존 | 2026-06-19 |
| `AUTORIG-VOICE-ROOM-001.md` | 52ch 매핑·페이셜 테스트·룸 기술스택 | 2026-06-17 |
| `AUTORIG-RIG-STRUCTURE-001.md` | FK 계층·회전 디포머·유기 스키닝 | 2026-06-17 |
| `CUBISM-V2-SUCCESS-PATTERN-PLAN.md` | 파라미터·파트 택소노미(티어) | 2026-06-23 |

> ⚠️ Vtube는 R&D로 진화 중(V1→V2). 이 문서는 **증류 스냅샷** — rig 계약이 바뀌면 `rig-format.md`(정본)와 함께 갱신하고, 세부는 위 원천을 재확인할 것.
