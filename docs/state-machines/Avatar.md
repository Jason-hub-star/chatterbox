---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->
<!-- opencode: 2026-06-29 - C16 WebGL context loss Edge Case 4를 H7/AvatarCanvas.md와 일치 (no state change → voice-only badge 전환 + host alert). Coded with OpenCode; high-cost model review recommended. -->

# 3. Avatar Render State Machine

## State Diagram

```
┌─────────────┐
│  UNLOADED   │ (user hasn't selected model yet)
└──────┬──────┘
       │ user selects model in /models page
       ▼
┌─────────────┐
│  LOADING    │ (fetch project.json + webp parts from Supabase Storage)
└──────┬──────┘
       │ success
       ▼
┌─────────────┐                  (host changes background,
│   READY     │────────────────   changes avatar pose [future])
└──────┬──────┘                   
       │ enter room (participant connected)
       │ → PixiJS container created
       │ → parameter stream ready
       ▼
┌──────────────┐ (blendshape 52ch @ 30fps via RT-02, keyform mesh-deform)
│  RENDERING   │
└──────┬───────┘
       │ participant leaves
       │ → cleanup WebGL
       ▼
┌────────────┐
│ UNLOADED   │ (resources freed)
└────────────┘

Parallel to above:
        any error during LOADING
        ▼
    ┌───────┐
    │ ERROR │ (network timeout, malformed project.json, missing image)
    └───────┘
```

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| UNLOADED | LOADING | User selects model in `/models` | `userStore.selectAvatar(model_id)` | Zustand action |
| LOADING | READY | project.json + all webp parts loaded | fetch + `<img>` load success | `trackingStore.avatar_state = "READY"` |
| LOADING | ERROR | Network timeout (>10s) | Load timeout | Retry button shown |
| LOADING | ERROR | Invalid project.json (parse error) | Load error handler | Show "model corrupted" message |
| LOADING | MEMORY_ERROR | WebGL context creation failed or memory exhausted | PixiJS.Application error | Fallback to static image + voice-only badge; 3-retry limit |
| READY | RENDERING | Participant joins room + container allocated | `stageStore.createAvatarContainer(participant_id)` | PixiJS render loop starts |
| RENDERING | READY | Participant leaves room | `stageStore.removeAvatarContainer(participant_id)` | PixiJS container destroyed; WebGL freed |
| RENDERING | UNLOADED | Avatar model switched during room | `userStore.selectAvatar(other_id)` | Old container destroyed; new model loads |
| RENDERING | ERROR | Runtime error during blendshape apply | Try/catch in blendshapesToRigParams/draw | Avatar freeze in last valid pose |
| ERROR | READY | User clicks "Retry" (during LOADING error) | `trackingStore.retryLoadAvatar()` | Restart LOADING |
| ERROR | UNLOADED | User selects different model | `userStore.selectAvatar(other_id)` | Clear error |
| MEMORY_ERROR | READY | User clicks "Retry" after resolution decrease | `trackingStore.retryLoadAvatar()` | Attempt LOADING with lower resources |
| * | UNLOADED | User account deletes avatar (settings) | `userStore.deleteAvatar()` | DB cleanup; state reset |

## Edge Cases

1. **Default Avatar for New Users**
   - If user has no model selected, show silhouette avatar (no project.json, simple gradient + eyes)
   - Transitions directly UNLOADED → READY (no LOADING step)
   - Always works, no failure path

2. **6-Participant Simultaneous Render**
   - Single PixiJS Application + single WebGL context (shared canvas)
   - Each participant = separate Container (DisplayObject tree)
   - CPU bottleneck: 6×52 blendshape channels × 30fps = 9360 params/sec
   - Solution: batch uniform updates; unroll FFD matrix multiply

3. **Mesh Deformation (구현됨 — `public/aria-player/src/core/rig.js`)**
   - FFD (Free-Form Deformation) 격자 케이지 워프 = 주 변형(MESH-DEFORM-001, 공식 Cubism 등가)
   - 정점 키폼(EYE-NATURAL-002)·2D 조합 키폼(MULTI-KEYFORM-2D-001)으로 얼굴 디테일 보강
   - N-관절 LBS 스키닝(BBW-SKIN-001)·이음새 skin_blend도 구현 — bone 데이터 불필요, 선형대수만
   - 경로 B: 이 렌더러를 `src/lib/pixi/aria/`로 네이티브 이식(인스턴스화)

4. **WebGL Context Loss** (mobile/browser tab backgrounded)
   - `webglcontextlost` 이벤트 감지 시 즉시 **degraded 모드**로 전환 (Ghost Speaker 방지, RUNTIME-HARDENING-REVIEW H7)
   - AvatarCanvas의 `webglcontextlost` 핸들러가 `is_webgl_degraded = true` 플래그 설정 → React가 감지해 static/voice-only badge로 렌더 전환 → 참가자에게 음성만 들림, 아바타 렌더 중단
   - 호스트에게 `avatar_render_failed` 상태 알림 (HostConsole tracking health telemetry, H9 연동)
   - 상태 머신: RENDERING 유지하되 `is_webgl_degraded = true` 플래그 설정 (별도 상태 추가 안 함, YAGNI)
   - `webglcontextrestored` 수신 시 textures 재로드 → `is_webgl_degraded = false` → 정상 렌더링 재개
   - 사용자에게 짧은 안내: "화면이 잠시 끊겼어요, 음성은 정상이에요" 토스트
   - **SSOT 일치**: `contracts/AvatarCanvas.md` Implementation Hints의 `webglcontextlost` 핸들링과 동일 규칙 적용

5. **Model Switch During Room**
   - User can change avatar in settings while in LIVE room
   - Old avatar's container destroyed (RENDERING → UNLOADED)
   - New avatar LOADING → READY → new container spawned
   - ~500ms visual pause during switch

6. **메모리 부족 렌더 실패 (G-100)**
   - 상황: PixiJS WebGL context 생성 중 메모리 부족
     - 특히 저사양 모바일 (RAM 2GB 이하)
     - 6인 동시 참가자 × 52 blendshape × 30fps = 고부하
   - 감지:
     1. PixiJS.Application constructor → WebGL context 생성 실패 또는 null
     2. 또는 `gl.getParameter(gl.MAX_TEXTURE_SIZE)` < required size
     3. 또는 렌더 중 texture allocation 실패 (out of memory)
   - 전이: LOADING → MEMORY_ERROR (RENDERING 중이면 RENDERING 상태 유지)
   - 처리 단계:
     1. GC 트리거: `if (window.gc) window.gc();` (개발자 모드, 프로덕션 fallback)
     2. 메모리 확인: `window.performance.memory?.usedJSHeapSize > 90% limit` 체크
     3. 해상도 자동 감소:
        - 1차: 부자 크기 80% 감소 (3840×2160 → 3072×1728)
        - 2차: 부자 크기 60% 감소 (1920×1080으로)
        - 3차: 텍스처 품질 원본 → low quality PNG (손실 압축)
     4. 재시도: 감소된 설정으로 LOADING → READY 진행
   - 재시도 실패 시:
     - MEMORY_ERROR 상태 유지
     - 정적 이미지 폴백: 아바타 선택 화면에서 capture한 스크린샷 또는 기본 placeholder
     - 배지 표시: "🔇 메모리 부족 — 음성만 참가합니다" (아바타 패널 자리에)
     - 호스트 알림: HostConsole에 "○○님의 아바타 렌더링 실패" 표시 (avatar_render_failed 텔레메트리, H9 연동)
   - MUST NOT:
     - 무한 재시도 금지 (3회 시도 후 포기)
     - 미표시 아바타 상태 허용 금지 (항상 정적 이미지로 대체)
     - 부분 텍스처 렌더 금지 (모든 파츠 완전히 로드되거나 폴백, 중간 상태 노출 금지)

## Implementation Hints

- **Zustand stores**: `userStore` (selected_model_id, avatar_data), `trackingStore` (avatar_state, load_error, model_rig)
- **Event sources**:
  - Supabase Storage: GET `/models/{user_id}/{model_id}/project.json` and `…/parts/*.webp` (PoC: `avatars/{c}/`)
  - `stageStore`: participant join/leave triggers container lifecycle
  - DataChannel `blendshape`: when Tracking state = PAUSED (tab backgrounded), AvatarCanvas freezes on last valid frame (no new frames rendered until TRACKING resumes)
- **Side effects**:
  - READY state: pre-allocate FFD cage matrices (CPU-bound)
  - RENDERING state: call `stageStore.startBlendshapeLoop(participant_id)` (timer-based, not RAF, to decouple from render)
  - ERROR state: log to Sentry for model corruption detection
