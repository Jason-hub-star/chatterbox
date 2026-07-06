# PoC — reference-to-video (유키, 2026-07-06)

**목적:** 아바타(2D rig)를 참조 이미지로 줘서 fal Seedance 2.0 `reference-to-video`가 **캐릭터 일관성 있는 세로 쇼츠**를 만드는지 실증. slice1b "자기 캐릭터 세로쇼츠"의 유일 미검증 요소(출력 품질) 확인용.

## 결과: PASS (강함)

| 항목 | 결과 |
|---|---|
| 캐릭터 일관성(핵심) | **탁월** — 6프레임 전부 동일 유키, 얼굴 안 흔들림 |
| 역동 카메라(다가옴+push-in) | ✓ |
| 손 흔들기 · "Ohayo~" 오디오 | ✓ (AAC 트랙, 립싱크 mouth open) |
| 2D rig → 영상 품질 | **향상** — 플랫 rig가 음영·입체·보케 애니로 |
| 규격 | 720×1280(9:16)·6.04s |

## 재현 정보

- **모델**: `bytedance/seedance-2.0/fast/reference-to-video` (fal)
- **엔드포인트**: `https://fal.run/{model}` (동기). ⚠️ 로컬은 `queue.fal.ai` DNS 미해결이라 sync 사용. undici `headersTimeout:0` 필수(수분 블록). 앱(`trigger-vgen`, Supabase Edge)의 `queue.fal.ai/run/async` 포맷은 **미검증** — 본 배선 시 확인 요.
- **입력(실증됨)**: `{ prompt, image_urls:[유키시트], aspect_ratio:"9:16", duration:6, resolution:"720p", generate_audio:true }`
- **프롬프트**: `@Image1, a cheerful anime girl with long cream hair and pink rabbit ears walks toward the camera ... says "Ohayo~". Handheld camera ... arcs ... push-in ...` (Seedance 공식 규칙: Subject→Action→Camera→Scene→Style·동사우선·표준카메라·대사 큰따옴표·인라인 no-X)
- **참조 시트**: 유키 rig를 dev서버 RigAvatar size 1024로 렌더 → PNG
- **비용**: fast 720p 6s ≈ $1.45 (undici 타임아웃 실수로 ~$1.45 추가 낭비 가능)

## 파일

- `yuki-poc.mp4` — 생성 영상(2.9MB). ⚠️ fal.media는 임시라 이 PoC는 R2 미저장(직접 호출·앱 우회). 실서비스는 `vgen-webhook→R2→get-vgen-url` 경로가 저장·서빙.
- `yuki-montage.png` — 6프레임 검증 몽타주
- `yuki-sheet.png` — 참조로 쓴 유키 시트

## 결론

reference-to-video **기술·품질 실증 완료.** 본 배선 = rig→시트 자동렌더 + 참조 업로드 + `trigger-vgen` 모델 전환(+fal 포맷 확정) + refine `@Image` 실사용. webhook→R2 서빙은 기존 파이프라인 재사용.
