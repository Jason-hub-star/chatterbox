---
name: scene-pipeline
description: ChatterBox 씬 에셋 파이프라인 — 화풍 고정 이미지 생성(gpt-image edits+레퍼런스)→WebP→매니페스트 등재, 입장 영상(Seedance i2v→Topaz 업스케일→WebM). 새 씬/시간대 variant/씬 영상을 만들 때 사용.
---

# Scene Pipeline

페이지 배경·입장 영상 에셋의 생성→검증→배선 전 과정. SSOT: `docs/design/scene-prompts.md`(프롬프트·세계관 규정) + `src/scenes/manifest.ts`(배선).

## 절대 게이트

- **모든 생성 프롬프트(이미지·영상)는 실행 전 원문을 주인님께 제시 → 콜 받고 실행.** 초안 수정 시 재제시.
- 시크릿(.env)은 grep 금지([[rtk-grep-secret-leak]]) — 스크립트가 파일을 직접 읽게 한다. 키를 stdout에 내지 않는다.

## 세계관 규정 (scene-prompts.md §신규 씬이 원천)

- **시간축 variant**: `pickTimeVariant`(06~17=morning/18~05=night)를 로그인·로비가 공유. 미등재 variant 는 morning 폴백(점진 등재).
- **시간축=문화축**: 오전=서양 판타지(석조·목골·연철 가로등, 글자 없는 문양 간판 — 한자·종이랜턴 금지) / 밤=중국풍(홍등·처마·동양 용). 동물은 고래·어군 공통, 용은 밤 로그인 전용.
- 로비 등 체류 화면에 **영상 루프 금지**(i2v 루프 이음새 점프컷·상시재생 비용) — 정적 원화+앰비언트 레이어로.

## 1. 이미지 생성 — 화풍 고정

`templates/gen-image-styleref.py` 패턴 (경로·프롬프트만 교체):

- **화풍 고정 기법**: `images/edits`(multipart, `image[]`)에 **`~/Documents/채터박스/v2/login_splash.png` 원본을 레퍼런스로 물리고** 프롬프트 앞에 "Using the exact same painting style, color palette, lighting and level of painterly detail as this reference artwork, paint a different scene from the same world:" — edits 의 "전역 재생성" 특성(매팅엔 독)을 화풍 복제에 역이용.
- 프롬프트 끝에 STYLE ANCHOR v2(scene-prompts.md) + `wide 16:9 composition`. 모델 `gpt-image-2`→`gpt-image-1` 폴백, size `1536x1024`, quality high. 소요 ~160s.
- 투명배경 레이어가 필요하면(z≥1 부품) `background:"transparent"` **API 파라미터로 강제**(프롬프트만으론 불충분).
- 출력은 스크래치 + `~/Documents/채터박스/v2/` 이중 저장(원본 계보 보관). 루트=REF·판정 인박스, 채택 후 `masters/` 등 분류 — 규칙은 `v2/README.md`(2026-07-13 정리).

**검증(성역)**: 생성물 육안(Read) — 문화축·구도·화풍 대조 → 주인님 톤 콜 소재로 실렌더 스크린샷까지.

## 2. WebP + 매니페스트 배선

```bash
python3 -c "from PIL import Image; Image.open('원본.png').save('public/scenes/<slug>/<file>.webp','WEBP',quality=88,method=6)"
```
q88 ≈ 85~87% 절감(실측 3.1MB→522KB). `src/scenes/manifest.ts` variants 에 등재 — 소비자(AuthShell·LobbyPage)는 무변경. 새 소비 화면은 "배경+가독 스크림만"이 v1 규칙(기능 UI·계약 무변경).

## 3. 입장 영상 — i2v → 업스케일 → WebM

`templates/gen-video-i2v.py` → `templates/upscale-topaz.py`:

1. **Seedance 2.0 fast i2v**(`bytedance/seedance-2.0/fast/image-to-video`): fal 스토리지 업로드(initiate→PUT) 후 `image_url`=원화 → **0번 프레임이 그 그림 픽셀 그대로**(이음새 ①). `duration:5, resolution:"720p"(fast 최대), generate_audio:false`. 프롬프트에 **점진 시작 문장**("The motion begins almost imperceptibly — the first moments are nearly still, then …") 필수(이음새 ②). 큐 폴링 ~260s.
2. **Topaz 업스케일**(`fal-ai/topaz/upscale/video`): `upscale_factor:2, target_fps:48` → 2560×1440/48fps. **가격**: 출력 초당 — ≤720p $0.01 / ≤1080p $0.02 / 초과 $0.08, 60fps만 2배(48fps는 기본요금). 5s×$0.08≈$0.40.
3. **WebM**: `ffmpeg -c:v libvpx-vp9 -crf <N> -b:v 0 -deadline good -cpu-used 2 -an` — 1440p 는 crf45≈2.3MB(예산 ≤3MB, 넘으면 crf+3). mp4 마스터는 `~/Documents/채터박스/v2/` 보관(비파괴).
4. manifest `video:` 등재 → `EntryVideoOverlay` 가 소비(이음새 ③④는 코드에 상주: 자체 스틸 슬로우줌+크로스페이드·프리로드).

**프레임 실검증**: `ffmpeg -ss 0/중반/끝 -frames:v 1` 추출 → 0s=원화 일치·중후반=의도 모션·화풍 보존 육안.

## 4. E2E (영상 훅 변경 시)

헤드리스(playwright-core `npm i --no-save` 후 제거): 로그인 성공→오버레이 실재생(`video.currentTime>0`)→Esc→로비 / 2회차 미재생(localStorage `cb.introSeen`) / '인트로 다시 보기' 무로그인 개폐 / reduced-motion 직행. 참고 구현: 세션 스크래치 `verify_entry.mjs`(11항목).

## 함정

- **gpt-image edits = 전역 재생성**: 마스크는 참고일 뿐 — 부분 수정·차분 매팅 불가(폴리곤 매팅+확산 채움으로). 화풍 복제엔 역이용.
- **rtk 재작성**: `npx …`→`npm run` 오변환(→`rtk proxy npx …` 또는 직접 바이너리), `ls` 빈 결과(→`find`), `.env` grep 값 노출(→스크립트 내 파일 읽기).
- **Vite HMR 후 page.evaluate 모듈 주입**: `?t=` 이중 인스턴스 — 모듈 상태 주입 검증 전엔 dev 서버 재시작.
- 스크래치 스크립트의 의존성은 `createRequire('/…/ChatterBox/package.json')`로 해석(스크래치는 프로젝트 밖).
- fal 폴링 스크립트는 백그라운드 실행 + `until grep -qE "OK|FAILED|ERROR|timeout"` 감시.

## 마감 체크리스트

- [ ] scene-prompts.md 씬 표·프롬프트 상태 갱신 (+새 함정 발견 시 이 스킬에 추가)
- [ ] manifest 등재 + 게이트 4종 + 실렌더/E2E
- [ ] 원본 계보 `~/Documents/채터박스/v2/` 보관 확인
- [ ] GAP-MATRIX 진행로그·SCOUT 배턴
