---
tags: [status]
---

<!--
  REVIEW-LOG — 리뷰/검수 증거 로그 (append-only).
  진행로그(GAP-MATRIX)와 분리: 여기는 "무엇을 리뷰했고 무엇이 진짜였나"의 증거 축.
  규칙: 서브에이전트(페이블 등) 리뷰는 메인(Opus)이 ground truth로 대조 후 판정 — 맹종 금지.
  각 항목: 날짜 · 대상 · 리뷰어(모델) · 발견 · 판정(진짜/오탐) · 조치.
-->

# REVIEW-LOG — 리뷰 증거 로그

> 최신순. 서브리뷰는 "검증 후 반영"이 원칙 — 오탐 기각·제안코드 버그도 기록한다.

## 2026-07-02 · 경로 B B2·B3 — self drive 패리티 + 멀티플레이어 2탭 E2E (Opus)

- **B2 패리티(주인님 실측 반영)**: self drive 첫 배선이 눈·입·입꼴·roll만 구동 → 주인님 "고개 갸우뚱·눈알 안 따라옴, 배포본과 뭐가 다르냐". ground truth(drive.html `rawChannels`) 재확인 → 누락은 **head pose(랜드마크 기반 yaw/pitch/roll)와 gaze(blendshape eyeLook*)**. 내가 "head pose=캘리브레이션 필요"로 오판해 defer한 게 원인(실제 배포본은 캘리브레이션 optional, raw 사용). `faceLandmarker.extractHeadPose`(랜드마크 실측 이식)+gaze(bs) 추가 → AngleX/Y/Z·EyeBallX/Y 구동, 미러(M=−1) 포함. 아리아 rig에 해당 파라미터/바인딩 실재 검증(AngleX/Y 20/10·EyeBall 4/4). 주인님 재확인 **"배포본과 똑같음"**. 교훈: "defer 사유"도 ground truth로 검증할 것 — 있는 입력을 없다고 오판했다.
- **B3 멀티플레이어 — 내가 직접 헤드리스 2탭 E2E**: playwright-core + 시스템 Chrome(SwiftShader WebGL). 2계정 admin 생성→UI 로그인→같은 방 접속→A가 `__room.sendBlendshapes` 표정 주입→**B의 원격 AriaAvatar 파라미터 도달 확인**(주 신호 = `debugParams()`: MouthOpenY 0→1·EyeLOpen 1→0.27·MouthForm 0→1·EyeBallX 0→1). **A↔B 양방향 PASS**. gaze가 blendshape 기반이라 **원격에도 눈알 반영 확인**(head pose는 원격 미전송=정면, 설계대로). 4 WebGL 컨텍스트(2탭×self+remote) 헤드리스 정상. 픽셀 지문은 얼굴영역으로 좁혀도 변화율 낮음(중립↔감김/개구가 캔버스 소부분) → **파라미터 도달을 주 신호로**(렌더 반영은 B2에서 시각확인). playwright-core는 검증 후 제거(앱 의존 아님).
- **게이트**: tsc0·lint·test 30/30·build·docs:check PASS. 커밋 미실행(푸시 미승인).

## 2026-07-02 · 경로 B B1 — 아리아 실 rig 네이티브 이식 + 실데이터 검증 (Opus)

- **대상**: `public/aria-player` 렌더러(rig.js·physics.js·draw_pixi.js·pendulum.js) → `src/lib/pixi/aria/`(types·util·rigMath·loader·renderer·AriaAvatar·index) **인스턴스화 이식**. 모듈 싱글턴 `state`+모듈 캐시(latticeBaseCache/latticeFrame)를 `createRigMath(ctx)`/`createRenderer(app,ctx,rig)` 팩토리 클로저로 캡슐화 → participant N명 독립. **변형 수학은 무수정**(`state.`→`ctx.`), 에디터 전용 사문(assembly showreel·explode)은 제거(항상 항등이라 출력 불변).
- **이식 정확성 검증(ground truth = 실 `avatars/aria/project.json`, 200/260KB)**: 이식한 `primaryDeformerForPart`+`deformerChain`을 실 49파츠에 시뮬레이션 → **primary 해소 49/49 성공**(None 0·root 0·전부 메시), **선택 결과 = `part.deformer_node` 49/49 일치**(모호성 0), 체인 계층 정상(face_base→head_angle_warp: root→upper→head_z→head_angle). 수학·선택 모두 런타임과 동일 → 골든 대조 성립 근거.
- **발견 → 문서 정정**: 실 디포머 id는 `*_warp`(`root_warp`·`head_angle_warp`·`eye_L_warp`·`mouth_warp`…)인데 `primaryDeformerForPart`의 대문자 선호목록(`Eye_L`·`Mouth`·`Head_X`·`Root`)은 **한 번도 안 맞는 사문(死文)** — 선택은 항상 `child_ids` fallback으로 이뤄짐. 코드 버그 아님(런타임도 동일)이나 `rig-format.md §7.5`의 "디포머 ID 컨벤션"이 부정확 → 실측대로 정정(파트↔디포머 링크 불변식 = `child_ids`∋part ≡ `deformer_node`).
- **로더 계약 확인**: 실 project.json은 `_project_base_url` 베이크됨·`_mini_rig` 인라인(`render_mode:"mesh"`)·`source_path` 상대(parts/*.webp) — 로더 방어값(파생 base·mesh 기본)은 fallback으로만 작동.
- **게이트**: tsc0·lint클린·`vite build` PASS·`docs:check` PASS. **남음 = 시각/픽셀 대조**(`/avatar-aria-native` = 네이티브 vs `index.html?renderer=pixi` iframe 나란히) — 브라우저 실렌더 확인은 주인님 몫(WebGL·Storage 필요).
- **교훈**: "무수정 이식이라 런타임과 동일"만으로 끝내지 않고 **선택 로직을 실 데이터에 돌려** 사문 선호목록/디포머 명명을 잡았다 — 검증은 성역.

## 2026-07-02 · rig 포맷 SSOT 정정(경로 B) — 페이블 문서리뷰 + Opus 대조

- **대상**: 실 렌더러(`public/aria-player`)·실 에셋(`avatars/aria/project.json`, 200/260KB)·실 와이어(`blendshapeCodec.ts`)와 대조해 정정한 4문서 — `rig-format.md`(전면 재작성)·`AvatarCanvas.md`·`Avatar.md`·`GAP-MATRIX.md`. 정정 골자: SSOT 포맷을 **실재하지 않던 variant-swap `rig.json` → 실제 AUTORIG mesh-deform `project.json`**(FFD 격자·연속 ParamXxx, rig.js "공식 Cubism 워프 이식")으로 교체, v1은 §9 이력 강등.
- **페이블(diversity, 주인님 요청) 5건 — 판정**:
  - **P0-1 "blendshapesToRigParams 미구현" → 오탐(문서결함 아님)**: 함수 부재는 사실이나 문서가 "경로 B에서 이식"이라 **미래작업으로 정확히 명시**. 스코프 오독(페이블이 "문서 정합"이 아니라 "코드 완성 여부"를 감사) — 이건 B2 할 일이지 문서 모순 아님.
  - **P0-2 "멀티 participant 아키텍처 미구현(draw_pixi 싱글턴)" → 오탐(블로커 아님)+부분반영**: 싱글턴 사실이나 이 역시 경로 B B1의 핵심 리팩터(문서가 "인스턴스화" 예정으로 기술). 블로커 기각. **단 유효 지적** — 이식 필수조건(모듈 싱글턴→인스턴스화)을 `AvatarCanvas.md`에 명시 경고로 추가(반영).
  - **P1 "state.js `ParamAngleY` 라벨 누락" → 진짜지만 스코프 밖**: 사실(에디터 `PARAM_LABELS`에 없음). 그러나 렌더러(rig.js/draw_pixi)는 라벨 미사용 → 구동/경로 B/문서 무영향. aria-player **에디터 UI cosmetic** 선결함 — §3에 한 줄 주석만, 수정 defer(벤더 에디터, 미요청).
  - **P2-1 "매핑 표 검증 불가(에셋 없음)" → 근거 오탐·직감 적중(핵심 반영)**: "에셋 없음"은 거짓(이미 로드·범위 실측 일치). **그러나 ground truth(`drive.html convert()`) 대조하니 내가 쓴 §3 표가 실제로 여러 곳 틀림** — 눈은 "좌우 미러"가 아니라 **양눈 링크(max→snap, THA4)**, brow/cheek/EyeSmile은 **미구동인데 지어냄**, MouthForm은 **smile−frown 누락**, Body*는 "미구동"이 아니라 **Pose 어깨 구동**, 미러(M=−1)는 눈이 아니라 **수평·롤 채널**. → §3를 `convert()` 실측대로 **재작성**(로컬/원격 입력 구분 포함).
  - **P2-2 "헤드포즈 Phase 경계 모호" → 진짜(반영)**: RT-02 프레임에 헤드포즈 없음이 사실(codec 확인) → §3에 **로컬(전채널) vs 원격(52 blendshape만, AngleX/Y/Z·Body·gaze=0/중립)** 경로를 명시 분리.
- **게이트**: `docs:check` PASS.
- **교훈**: 문서 리뷰에 코드-완성 감사가 섞이면 "미래작업"이 "블로커"로 오분류된다 — 스코프로 걸러야. 그러나 서브리뷰의 **직감**(매핑 미검증)은 ground truth 대조를 촉발했고, 그 결과 **내가 표준 가정으로 쓴 §3의 실제 오류**를 잡았다. "검증은 성역"의 실증 — 서브 근거가 틀려도 대조는 한다.

## 2026-07-02 · blendshape 전송 — 페이블 리뷰 1패스 + Opus 대조

- **대상**: 코덱/송수신/훅/배선(위 자기리뷰와 동일 파일). 페이블(diversity, 주인님 요청) 3건 + 안전목록(seq·isNewerSeq·byteOffset·프루닝·스로틀·콜백ref·StrictMode·고빈도ref = 모두 안전 확인, Opus와 일치).
- **P0 "CRC-16 표준 불일치" → 오탐(기각)**: 페이블이 검증 벡터를 혼동. `"123456789"` → **0x29B1 = CRC-16/CCITT-FALSE(init 0xFFFF)** = 내 코드 값 = 정답. 0x31C3은 **XMODEM(init 0x0000)** 값. 게다가 crc16은 **송·수신 동일 함수**(같은 모듈)라 "양단 계산 상이" 시나리오 자체가 불가(외부 상호운용 없음). 이중 오탐. → 회귀 가드로 표준 벡터 테스트(`crc16('123456789')===0x29B1`) 추가.
- **P1 "NaN/Inf 미검증" → 진짜(반영)**: 페이블 근거(MediaPipe가 NaN 생성·PixiJS 무한루프)는 부실 — MediaPipe blendshape은 [0,1] 정규화값이고 onFrame은 얼굴 감지 시에만 발화, 무한루프도 아님. **그러나 핵심은 타당**: `decodeBlendshapeFrame`은 신뢰 불가 원격 경계인데 유한성 검증 부재 → crc 맞는 NaN 프레임(손상·악의 peer)이 `s += (NaN-s)*a`로 EMA 상태 **영구 오염**(이후 정상 프레임도 NaN 고정). 코드 주석("디코드는 반드시 검증")과도 모순. → `Number.isFinite` 드롭 + 테스트(NaN·Inf) 반영.
- **P2 "browRaise /2" → 오탐(기각)**: 이 feature 코드 아님 — 기존 `toFaceParams`(웹캠 실사용자 확인·테스트 존재). `/2`는 평균 아니라 `Math.min(1,…)` 클램프된 **의도적 게인**(눈썹 blendshape는 1.0 도달 드묾). 결함 아님.
- **게이트**: test 30/30(코덱 13)·tsc0·lint클린·docs:check PASS.
- **교훈**: 표준 CRC 판정은 "이름"이 아니라 **검증 벡터**로 — init값(0x0000=XMODEM vs 0xFFFF=CCITT-FALSE)이 같은 poly에서도 결과를 가른다. 서브리뷰의 "표준" 주장도 ground truth(테스트 벡터) 대조 후 반영.

## 2026-07-02 · blendshape 표정 전송(LiveKit DataChannel) — Opus 자기리뷰

- **대상**: `blendshapeCodec.ts`(220B 프레임·crc16·seq)·`useLiveKitRoom`(송수신)·`useFaceTracking`(onFrame)·`AvatarLayer`/`RemoteAvatar`·`RoomPage` 배선.
- **seq stale → 재입장 프리즈 (진짜)**: `lastSeq` Map을 참가자 퇴장 시 안 지워 같은 identity 재입장(새로고침 등) 시 상대 seq가 1로 리셋되는데 `isNewerSeq(옛높은값,1)=false` → 새 프레임 전부 드롭 → 아바타 프리즈. `RoomPage`에 참가자 목록 변화 시 부재 identity의 lastSeq 프루닝 effect 추가. 반영.
- **계약 정합(진짜·문서정정)**: MILESTONES가 blendshape을 `reliable`로 적었으나 SSOT(WebRTC.md)는 `unreliable/lossy`(30Hz 표정은 reliable 시 head-of-line 블로킹). 계약대로 unreliable 구현 + MILESTONES 문구 정정.
- **확인(오탐 아님)**: 고빈도 프레임이 React state를 안 거치는지 — 수신 콜백은 ref Map만 만지고 `.update()`만 호출(setState 없음) → 리렌더 폭주 없음. 콜백 ref 갱신은 렌더가 아닌 effect에서(react-hooks/refs 준수). crc16/길이 검증으로 손상·비정상 원격 페이로드 드롭(네트워크 경계 성역).
- **실증**: 헤드리스 2계정·2탭 E2E — A→B·B→A 양방향, 극단 표정 송신 시 상대 원격 아바타 영역 픽셀 diff PASS + 스샷 육안(눈감음·입벌림·눈썹) 정확 반응·콘솔에러0. 단위 11건(라운드트립·crc손상·byteOffset·seq순환) 추가(총 28).

## 2026-07-02 · 아리아/Storage 통합 보안 — 페이블 1패스 + Opus 대조

- **대상**: `?project=` URL 로드, 공개 Storage 버킷, iframe 카메라/중첩, crossOrigin/CORS, service_role 격리.
- **페이블(diversity 목적, 주인님 요청)**: MEDIUM 1건 + 나머지 안전 확인.
  - **MEDIUM `?project=` 임의 URL 로드** (LOW→MEDIUM 격상): 신뢰 도메인 링크로 임의 project JSON+이미지 로드 → DoS/트래킹/디페이스. XSS 아님(모든 DOM 삽입 `escapeHtml`)·자격증명 탈취 아님(무자격 fetch·crossOrigin anonymous) — 페이블도 확인.
  - XSS/자격증명/공개버킷/iframe allow/service_role → 모두 안전 확인(Opus 자기리뷰와 일치).
- **Opus 대조**: MEDIUM 격상 타당(즉시 수정 채택). **단 페이블 제안코드 버그 발견** — `import.meta.env.VITE_SUPABASE_URL`은 `public/` 정적파일(Vite 번들 미처리)에서 `undefined` → 그대로면 깨짐.
- **조치(반영)**: `public/aria-player/src/main.js`에 origin 화이트리스트 — `*.supabase.co` 또는 동일오리진만 허용(정적파일용으로 import.meta.env 안 씀). **양방향 검증**: 헤드리스에서 Storage URL 허용(렌더 PASS)·`evil.example.com` 차단(fatal "허용되지 않은 project URL origin"). iframe `allow`는 microphone 제거(camera만).

## 2026-07-02 · 표정 트래킹/아리아 통합 — Opus 자기리뷰 (규칙: 최상위 메인 직접)

- **useFaceTracking 리소스 누수 (진짜)**: `getUserMedia`/`createFaceLandmarker`가 cleanup 이후 resolve 시 카메라 안 꺼짐(StrictMode/빠른 언마운트) → cancelled 가드 강화(track.stop()/landmarker.close()). 반영.
- **MediaPipe 모델 URL 404 (진짜·근본원인)**: 문서(MediaPipeConfig.md)의 `mediapipe-tasks/vision/...`가 404 → 정본 `mediapipe-models/.../float16/1/`로 코드+문서 5곳 정정. 헤드리스로 TRACKING 도달 확인.

## 2026-07-02 · 채팅(ROOM-05) — 페이블 리뷰 #2

- **판정**: 클린. 유효 1건(cosmetic) — 새 메시지 자동 스크롤 없음 → `listRef`+`useEffect` 반영. SDK API(publishData/DataReceived) 정확 확인.

## 2026-07-02 · LiveKit 음성 PoC(auth/room) — 페이블 리뷰 #1

- **판정**: 4건 중 3.5건 **오탐**(Opus가 설치 SDK 2.20 실타입 대조로 기각).
  - autoplay "블로커" 오탐(SDK가 esm.mjs:13388서 autoplay=true 설정) · TrackSubscribed 3-param "컴파일실패" 오탐(tsc 통과) · detach().forEach "MEDIUM" 오탐(RemoteAudioTrack.detach()는 HTMLMediaElement[] 반환) · `RoomEvent.ConnectionLostError` 제안은 2.20에 없는 API라 반영 시 오히려 파손.
  - 유효 1건: `livekit.ts` 에러 바디 파싱 — 반영.
- **교훈**: 서브리뷰(같은 티어 포함)는 반드시 ground truth 대조 후 반영. 맹종하면 없는 API를 넣어 깨뜨린다.
