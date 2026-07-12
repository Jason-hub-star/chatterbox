---
tags: [guide]
---

<!-- opencode: 2026-06-26 - Avatar runtime stack comparison for Vtuber theater (A-D options). Coded with OpenCode; high-cost model review recommended. -->

# STACK-COMPARE-AVATAR-RUNTIME — Vtuber 아바타 런타임 대안 비교

## BLUF
Live2D Cubism SDK for Web로의 전환은 **지금 당장 하지 않는다**. 현재 `mini_cubism_app`은 FFD/Canvas2D와 PixiJS v8 WebGL 두 경로를 모두 가지고 있으며, **PixiJS v8을 렌더링 엔진으로 유지하되 단일 Application + 단일 WebGL 컨텍스트 내에서 6인을 그리는 구조**로 통일해야 한다. theater PoC의 단일 페이지 WebGL 측정에서 N=8까지 60fps PASS했으므로 6인 방은 M-시리즈 맥에서 여유 있다. 병렬로 자체 rigging의 BBW/LBS 승격(`AUTORIG-BBW-SKIN-001`)을 추진하여, Live2D 라이선스/파이프라인 종속을 피한다. Cubism SDK는 표준 기능과 생태계가 뛰어나지만, VTuber/아바타 플랫폼은 "확장성 애플리케이션"으로 분류돼 별도 계약과 라이선스 비용이 필요하다.

## 평가축

| 대안 | 기능/품질 | 성능/확장성(6인) | DX/생태계 | 라이선스/보안 | 운영비용 | 리스크 |
|---|---|---|---|---|---|---|
| **A. mini_cubism_app FFD + Canvas2D** | FFD+키폼 기반 2D 변형, 끄덕임/표정 표현 가능. GPU 미사용. | theater PoC에서 단일 페이지 Canvas2D로 N=8 PASS(대표성 낮음, GPU 미사용). 고해상도/필터 불리. | 100% 인하우스, 파이프라인 제어 가능. 자동화된 빌드 존재. | 자체 코드, 상업/배포 자유. | 낮음(CPU 사용). | Canvas2D 성능 천장, 복잡한 셰이더/블렌드 구현 어려움. |
| **B. mini_cubism_app + PixiJS v8 WebGL (현재 default)** | WebGL2/WebGPU, 필터, 블렌드, RenderTexture, batching. | iframe+Pixi PoC에서 N=2 PASS, N≥3은 iframe rAF 측정 아티팩트. **단일 WebGL context 구조로 전환 후 N=8 60fps PASS** (M5, 메시 변형 포함). | PixiJS는 2D WebGL 사실표준, React binding(pixi-react), 풍부한 예제. | MIT. 활발한 보안/커뮤니티 감시. | 추가 클라우드 비용 없음. GPU 메모리 한계 존재. | WebGL 컨텍스트 수 제한; 다중 iframe은 실패. |
| **C. B + 자체 BBW/LBS rigging 승격 (권장)** | FFD 위에 FK+BBW 스키닝+관절 회전(AUTORIG-RIG-STRUCTURE-001) 추가. "납작 눌림"을 입체 회전 착시로 개선. | 단일 Pixi 캔버스에서 동일 정점 수 기준 batching 유지. 6인은 instance/RenderTexture 전략으로 분리. | 인하우스 파이프라인 발전. FFD 폭포(Fallback) 유지. | 자체 알고리즘(scipy/ARAP), Live2D 종속 없음. | 개발 인건 비용. | 몇 주 규모; BBW 품질은 캐릭터/메시 해상도 의존. |
| **D. Live2D Cubism SDK for Web** | 업계 표준. 모델 마켓, 표준 파라미터, 고급 물리/표정. | WebGL 기반, 단일 컨텍스트 내 다중 모델 가능. | 거대한 커뮤니티/에셋, 트래킹 소프트웨어 호환. | **Proprietary**. VTuber/아바타 플랫폼은 "확장성 애플리케이션"으로 별도 승인/계약 필요. 연 매출 2,000만 엔 기준에서 라이선스료 및 보고 의무 발생. | 라이선스 + 계약 비용. 시간외 협상. | 계약 불확실성, 파이프라인 전면 교체, 자산 마이그레이션. |

## 상세 비교

### A. mini_cubism_app FFD + Canvas2D
- **근거**: `mini_cubism_app/src/core/draw.js`(Canvas2D)와 `draw_pixi.js`(PixiJS v8 WebGL)를 모두 보유. `build_player_webapp.py`는 `renderer=pixi`를 기본으로 정적 플레이어를 빌드한다.
- **성능**: theater PoC에서 단일 페이지 Canvas2D는 N=8 PASS. 단, 이 측정은 GPU 미사용(representative_of_real_gpu=false)이고 메시 변형을 생략했을 가능성이 있어 실제 플랫폼 경로의 천장 판정 근거는 아니다.
- **출처**: `Vtube/mini_cubism_app/src/core/draw.js`, `Vtube/mini_cubism_app/src/core/draw_pixi.js`, `Vtube/scripts/build_player_webapp.py`, `Vtube/experiments/theater-platform-001/poc0_render_scale/results/results.json`

### B. mini_cubism_app + PixiJS v8 WebGL
- **근거**: `draw_pixi.js`는 정점 버퍼 갱신 + GPU 드로우로 작동. 메시 변형(`deformedVertices`)과 강체 트랜스폼(`partTransform`)을 모두 지원. 눈 클리핑, eye socket cover, 투명/OBS 모드를 포함.
- **성능**: 기존 iframe+Pixi 구조는 N≥3에서 호스트의 rAF가 iframe들을 throttle → 자가측정 fps가 신뢰할 수 없게 됨. **그러나 스크린샷에서 아바타는 정상 렌더**. 단일 페이지 WebGL 구조(`single_page/scale_single.html`)로 전환 후 N=1~8 전부 60fps PASS. M5 Metal GPU에서 메시 변형 포함, 8개도 vsync 상한 내 여유 → 6인 방은 맥에서 문제 없음. 결정적 미지수는 저사양 PC(Acer 등)에서의 재측정.
- **출처**: `Vtube/mini_cubism_app/src/core/draw_pixi.js`, `Vtube/mini_cubism_app/src/core/rig.js`, `Vtube/experiments/theater-platform-001/poc0_render_scale/single_page/results/results.json`, `Vtube/experiments/theater-platform-001/poc0_render_scale/results/results.json`

### C. 자체 BBW/LBS rigging 승격
- **근거**: `AUTORIG-RIG-STRUCTURE-001`은 FK 계층+회전 디포머+BBW/ARAP 스키닝을 이미 갖추고 있음을 확인하고, 개선 방향을 "있는 구조의 정교화 + 유기 스키닝"으로 정정. `AUTORIG-BBW-SKIN-001`은 통합 스킨 메시+관절+scipy BBW 가중치+런타임 LBS를 구체화하며, FFD와 병렬 구현 후 007 A/B 검증 계획을 제시.
- **런타임**: `rig.js`에 LBS 변형 경로를 추가해야 하며, 현재 `draw_pixi.js`의 `writeVertices` 메시 구조는 LBS 출력을 그대로 수용할 수 있다.
- **출처**: `Vtube/docs/ref/AUTORIG-RIG-STRUCTURE-001.md`, `Vtube/docs/ref/AUTORIG-BBW-SKIN-001.md`

### D. Live2D Cubism SDK for Web
- **근거**: SDK 다운로드 페이지는 "Live2D Proprietary Software 사용 허가 계약" 동의를 요구. SDK 리리스 라이선스 페이지는 개인/소규모 사업자(직전 매출 1,000만 엔 미만)는 면제 가능하나, VTuber/아바타 트래킹 소프트웨어 또는 VTuber 플랫폼은 "확장성 애플리케이션"으로 분류되어 별도 심사/계약이 필요. 연 매출 2,000만 엔 초과 시 별도 출판 허락 계약과 라이선스료 발생.
- **출처**: https://www.live2d.com/sdk/download/web/, https://www.live2d.com/sdk/license/, https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_jp.html

## 검토했으나 주요 옵션에서 제외한 대안

- **Three.js 2D plane + 3D pivot**: WebGL 3D 라이브러리. 2D plane을 3D 공간에 배치하면 옆모습/정수리 회전이 가능하나, 현재 2D 레이어드 파이프라인(part clipping, expression sheets, FFD keyforms)과는 부조화. 현재 파이프라인을 폐기해야 하므로 채택하지 않음.
  - 출처: https://threejs.org/
- **Spine 2D runtime**: 뼈대 기반 2D 애니메이션, 메시/weights, IK. 게임 업계 표준이나 Spine Editor 라이선스 필요($69~Enterprise)하고, 캐릭터 파이프라인 전체를 Spine 에디터로 재구성해야 한다.
  - 출처: https://esotericsoftware.com/spine-purchase

## PixiJS v8 번들 참고
- `npm view pixi.js@8.19.0 dist.unpackedSize` = 72,415,382B (2026-06-26). 이는 npm 압축 해제 크기이며, 실제 Vite 번들은 필요한 패키지만 포함하고 gzip/브로틀 적용 시 훨씬 작다.
- **출처**: `npm view pixi.js@8.19.0 dist.unpackedSize` (2026-06-26), https://pixijs.com/8.x/guides/getting-started/intro

## 결정

**ARCHITECTURE-B의 현재 선택(PixiJS v8)을 바꿔야 하는가? NO — 단, 구조는 바꿔야 한다.**

- PixiJS v8 렌더링 엔진은 유지한다.
- 6인 동시 렌더링을 위해 **단일 Pixi Application + 단일 WebGL 컨텍스트 + RenderTexture/레이어 전략**으로 구조를 전환한다(iframe 분리 해제). PoC 결과 N=8까지 60fps PASS.
- 아바타 품질 향상은 Live2D 의존 대신 **자체 BBW/LBS rigging 승격**으로 추진한다.
- 다음 조건에서 Live2D Cubism SDK를 재평가한다:
  - 자체 rigging으로 Strong20/기술적 천장을 명확히 확인했을 때.
  - Live2D 계약/라이선스 비용이 사업 모델에 흡수 가능하고, SDK 출판 허가(出版許諾契約) 또는 확장성 애플리케이션 심사를 받을 수 있을 때.
