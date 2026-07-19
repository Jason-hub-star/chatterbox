# GOAL-dub-showcase — Demucs 각인 UX + 3막 간소화 + 더빙 무대 리레이아웃

## 골 한 줄
더빙 방이 영상-퍼스트 무대(배경 제거·AR fit·아바타 스프라이트 오버레이)가 되고, [기존 소리|배경만] 토글·배경 베드 미리보기·솔로 원버튼으로 Demucs 본질이 첫 주행에 각인된 상태 — verified by `npm run check:all` + 프로드 통합(S1 캐시)·실렌더(S2/S3)·솔로 E2E(S4), while preserving 비더빙 무대·다인 5단계·서버 동의 게이트 무회귀. details in docs/goals/GOAL-dub-showcase.md

## 1. Outcome (완료 시 참)
- 업로드 자동 체인이 STT→번역→**분리(선행)**까지 흐르고, 스템이 우리 버킷에 캐시된다(재분리·재과금 0).
- 센터에 **[기존 소리|배경만] 토글** — 탭 1로 기존 목소리가 사라진 배경음 청취(각인 #1).
- 녹음 미리보기·시사회가 **배경 베드 위**에서 재생된다(각인 #2 — 무음 배경 소멸).
- 더빙 방 무대 = 씬 배경 없음 · 영상 AR fit 최대화 · 아바타는 흰 원/슬롯 없이 영상 위 스프라이트 오버레이.
- 솔로 방은 ready 에서 **[🎙 이 장면, 내 목소리로]** 버튼 1개(+동의 체크)로 녹음 진입(체감 5단계→3막).
- 카피에서 "원어"→"기존"(신규 카피 포함).

## 2. Verification surface
- `npm run check:all` → exit 0 (165+α)
- `deno check --node-modules-dir=auto supabase/functions/separate-dub-audio/index.ts`
- S1 프로드 통합(.mjs): 1회차 fal 실분리(소액)→버킷 `<room>/stems/<sessionId>/` 실존·2회차 캐시 응답(스토리지 서명 URL·고속)
- S2/S3 실렌더(.mjs·캐시 스템 재사용=무과금): 토글→video.muted/베드 paused 반전 실측 · AR 박스 비율 ±2% · 배경이미지 DOM 부재 · bare 아바타 canvas 존재+크림 원 클래스 부재 · 360px 오버플로 0 · **비더빙 방 무대 무회귀**
- S4 솔로 E2E: 원버튼 1클릭 → DB 실측(전세그 배정·consent true·세션 recording) · 다인 방 5단계 무회귀

## 3. Constraints (후퇴 금지)
- 비더빙 무대 레이아웃·다인 5단계 플로우·DUB-EDIT 타임라인(줌·드래그) 무회귀 — 기존 스위트 그린 유지.
- 서버 동의 게이트 불변(솔로 원버튼은 클라 자동 연쇄일 뿐 assign→consent→start 기존 Edge 3종 그대로).
- 분리 실패 = 비치명(베드 없이 기존 동작·업로드 체인 계속).
- i18n 3국어 완역 · 360px 오버플로 0 · `.env` 값 추출은 awk.

## 4. Boundaries
- 허용: `supabase/functions/separate-dub-audio/` · `src/features/{dub,stage}/` · `src/stores/dubStore.ts` · `src/lib/{dub,dubPreview}.ts` · i18n 3파일 · docs.
- 금지: 마이그레이션(캐시=스토리지 결정론 경로) · assign/consent/start Edge 수정 · 새 의존성.
- 범위 밖(defer): 녹음 중 배경 모니터 · 다인 JIT 동의(§11 재설계) · AudioShake 승급 · 파형 · 멀티스템 믹서.

## 5. Iteration policy
| Phase | Outcome(이진) | 검증 |
|---|---|---|
| S1 분리 선행+캐시 | 체인 꼬리 분리·버킷 스템·2회차 캐시 | deno + 프로드 통합 |
| S2 베드+A/B 토글 | 토글 반전·미리보기/시사회 베드 | 실렌더 |
| S3 무대 리레이아웃 | 배경 skip·AR fit·bare 오버레이 | 실렌더 + 비더빙 회귀 |
| S4 솔로 원버튼+용어 | 1클릭 녹음 진입·원어→기존 | 솔로 E2E |
| S5 마감 | §0 [x]+probe·사다리·문서 | docs 3종 |
- 각 phase: 구현→검증 전체→메인 자기리뷰→PASS 진행/FAIL 최소 재시도. 무진전 3패스 blocked(4분류 보고).

## 6. Blocked stop condition
- 베드-비디오 동기 드리프트가 ±0.3s 보정으로 수렴 안 되는 재현 → blocked(스케줄러 재설계 질문).
- Demucs 스템 품질이 A/B 토글 데모로 부적격(대사 잔류 심각) → blocked·AudioShake 승급 결정 요청.

## 7. 실행 기록 (실행 에이전트가 기록)
- 2026-07-19 Fable — S0: 브리프·사다리 S행·§0 흡수 표기. docs:check·links PASS.
- 2026-07-19 Fable — S1: separate-dub-audio 매니페스트 버킷 캐시(권한 2단·cache_only 프로브·레이트리밋 미스만 계수·실패 비치명) **v12 배포** · 체인 꼬리 분리 선행 · dubStore.bedUrls+세션당 프로브. deno clean · 프로드 통합 **6/6**(프로브 404 → 실분리 96s cached:false·스템 5개 2.4MB 버킷 복사 → **재호출 639ms cached:true** → 멤버 캐시-전용 200 → Range GET 실바이트).
- 2026-07-19 Fable — S2: 베드 audio N개 video 슬레이브(play/pause/seek/rate+1s 드리프트 보정)·bedMode 토글(기본 bed)·video muted 모드 파생·dubPreview bed 트랙(미리보기·시사회 합류). tsc·lint 0.
- 2026-07-19 Fable — S3: Stage isDub 분기(씬 배경 skip·ResizeObserver×sourceAR AR fit·TL 64px 보정)·Self/RemoteAvatar `bare`(크림 원·라벨·크라운 소거, 트래킹 폴백·웹캠 입력 유지)·오버레이 하단-좌측 가로줄(96/64px). tsc·lint 0.
- 2026-07-19 Fable — S4: 솔로 원버튼(동의 인라인 체크→assign→consent→start 자동 연쇄·서버 게이트 불변)·단계표시기 솔로 ready 숨김·용어 원어→기존("기존 목소리를 걷어내는 중…" 3국어). check:all **165/165**.
- 2026-07-19 Fable — S5 총괄 E2E **9/9**(스템 캐시 부활=무과금): 비더빙 그리드 무회귀 · AR fit 0.56=0.56(세로 소스도 정합) · bare 아바타 · 씬 배경 부재 · **배경만=muted+베드 5/5 재생 ↔ 기존 소리=복원+베드 0** · 360px 오버플로 0 · 솔로 1클릭→전세그 배정 3·all_consented·recording·표시기 숨김. 함정 2개 하네스서 해소(솔로방 웹훅 레이스=이탈 전 시딩으로 DUB-PERSIST 보호·roomA 호스트 승계=동적 판별). **완료 판정: 재현됨**. 배포 잔여 = CF Pages(대기분 합류 — separate-dub-audio·edit-dub-segment 는 라이브).

## 참조 문서
- §0 DUB-BED·DUB-ONBOARD(이 골로 흡수) · `research/DUB-TRIM-UX-REFERENCES.md` · `state-machines/DubSession.md` · [[dub-audio-separation-anime]](AudioShake 승급 경로)
