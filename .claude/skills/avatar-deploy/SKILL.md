---
name: avatar-deploy
description: Vtube AUTORIG rig 를 ChatterBox 아바타로 배포(Storage 업로드 + 매니페스트 등록)하고 네이티브 렌더러로 실렌더 검증하는 하네스. character.json+mini_rig.json 병합·_mini_rig 렌더필수·헤드리스 same-origin 스테이징 등 매번 재발견하던 함정을 고정. "아바타 배포/추가/넣기/Vtube 아바타 온보딩/새 캐릭터 슬롯" 요청 시.
user_invocable: true
tags: [avatar, deploy, vtube, verification, storage]
trigger: "Vtube rig 를 ChatterBox 에 새 아바타로 배포·검증할 때"
version: 1
---

# avatar-deploy

Vtube `mini_cubism` rig 를 ChatterBox 에서 **선택 가능한 아바타로 꼽는다**(배포 → 매니페스트 등록 → 실렌더 검증). 기계적 배포는 `scripts/deploy-avatar.mjs` 가 하고, 이 스킬은 그 위에 **①발굴(어느 rig=어느 캐릭터, 배포할 만한가)** **②렌더 검증(성역)** 을 얹는다. 검증 없이 "배포됨"으로 치지 않는다 — 업로드는 성공해도 rig 데이터가 깨져 안 그려질 수 있다.

## Use When

- Vtube 에서 만든 아바타(캐릭터)를 ChatterBox 방/설정에서 쓰게 하고 싶을 때
- "아바타 배포/추가/넣기", "새 캐릭터 슬롯", "Vtube 아바타 온보딩" 요청 시
- 배포된 아바타가 실제로 렌더되는지 실측이 필요할 때

## 환경 함정 (매번 여기서 시간 날림 — 반드시)

1. **`_mini_rig` 는 렌더 필수** — 배포 project.json 에 `mini_rig.json` 을 `_mini_rig` 로 인라인 안 하면 `loader.ts:normalizeRig` 가 **아리아형 fallback bbox** 로 그려 오작동(`rigMath.ts` 경고). `deploy-avatar.mjs` 가 병합하지만, mini_rig.json 이 없는 rig 는 배포 금지.
2. **`character.json` ≠ 배포 형식** — 소스 `rig_v0_project/character.json`(project_kind mini_cubism_v0)에 `_mini_rig` 병합해야 배포용 `project.json` 이 된다(단순 복사 아님). parts source_path 는 상대(`parts/x.png`), 로더가 base URL 자동 파생.
3. **헤드리스 Chrome 은 외부 DNS 없음** — 프로덕션 `*.supabase.co` 를 직접 못 fetch. 렌더 검증은 배포한 것과 **동일 병합 번들을 앱 same-origin `public/<id>-test/` 로 스테이징** → `?project=/<id>-test/project.json`(로더 origin 화이트리스트: same-origin 허용). 검증 후 `public/<id>-test/` 삭제.
4. **vite dev 는 없는 파일에도 200(SPA fallback)** — `/<id>-test/project.json` 이 200 이어도 index.html 일 수 있다. content-type 이 `application/json` 인지, 앞부분이 `{"schema_version"...` 인지 확인.
5. **렌더러/페이지는 범용** — `RigAvatar`(`src/lib/pixi/rig`)·`AvatarInspectorPage`(`/avatar-inspect`)는 아무 rig 나 렌더. DEV 는 `window.__rigAvatar` 노출.
6. **playwright-core 는 `--no-save` 임시 설치, 검증 후 `npm remove`.** 시스템 Chrome `executablePath`: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, WebGL args `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
7. **키·값 미출력** — `.env`(VITE_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY)에서 값 echo 없이 사용. `deploy-avatar.mjs` 가 .env 자동 로드.
8. **발굴 시 백업 폴더 제외** — `rig_v0_project.bak_*`·`_BROKEN` 는 배포 금지. 캐릭터명은 `Vtube/characters/*.yaml`·`config/pipeline_profile.*.yaml`("(배포본)" 마커)로 매핑. `character.json` mtime 으로 최신 판단.
9. **재배포 = 캐시와의 싸움(2026-07-11 커미션 발행 실측 이관)** — 같은 `avatars/<id>/` URL 재배포 시 유저 브라우저가 project.json 을 최대 1h 캐시(**하드 리프레시도 로드 후 fetch 엔 무효**), 파츠는 `?v=generated_at` 이라 버전 미범프면 영구 스테일. 스크립트가 **generated_at 자동 범프 + 업로드 내용 rev 대조 + 맨 URL 전파 확인**을 한다 — 200 체크만으로 "됨" 판정 금지(내용이 구본일 수 있음). 로더도 project.json 을 `cache:'no-cache'` 재검증(프론트 배포 필요, 2026-07-11 수정).
10. **입 상태 QA 게이트(ISS-04, 2026-07-13 poon995 실측 이관)** — `deploy-avatar.mjs`·`publish-avatar-job.mjs` 가 발행 전 `scripts/qa-mouth-lips.mjs`(립 안료 연속성: mouth_state_* 립안료/closed < 0.35 → FAIL)를 강제한다. AUTORIG 이 열린 입 상태를 입술 안료 없이 생성하면 **발화 밴드(MouthOpenY 0.245~0.47)에서만 입술이 사라져 보여** 정지 초상 검수로는 못 잡는다. FAIL 시 정공=자산 재생성, 임시=closed_master 크로스페이드(0.30→0.60, poon995 선례). 육안 판정 도구는 `scripts/render-mouth-matrix.mjs`(상태×각도 몽타주). 비상 우회 `QA_MOUTH_SKIP=1`.

## Steps

1. **발굴(필요 시):** 넓은 Vtube 탐색은 `Explore`(haiku)로 — 배포가능 rig(`rig_v0_project/{character.json,mini_rig.json,parts/}`, render_mode mesh) 목록 + 캐릭터명 + 이미 ChatterBox 에 있는지. **어느 걸 배포할지는 사용자 로스터 결정**(프로덕션 쓰기라 확인).
2. **배포:** `node scripts/deploy-avatar.mjs <rigDir> <id> <name>` (id=소문자·숫자·하이픈). 병합·parts 검증·업로드·**매니페스트 갱신**·원격 완전성(전 parts 200)까지 자동. 코드 수정 0.
3. **렌더 검증(성역):** `templates/render-verify.mjs` 참고 — 병합 번들 `public/<id>-test/` 스테이징 → vite dev → 헤드리스 `/avatar-inspect?project=/<id>-test/project.json` → `__rigAvatar` 생성·`setParams` 무예외·**스크린샷 육안 확인**·콘솔에러 0.
4. **정리:** `rm -rf public/<id>-test`; `pkill -f vite`; `npm remove --no-save playwright-core`.
5. **확인:** `avatars/manifest.json` 에 항목 추가됨 → 설정에서 선택 가능. `evidence-review` 로 결과 기록.

## Verify

- 배포 스크립트 "원격 검증 N/N 200" + 렌더 `__rigAvatar` 생성 + **스크린샷을 실제로 열어 캐릭터가 온전히 그려졌는지 육안 확인**(parts 조립·색·표정). 업로드 성공만으로 "됨" 처리 금지.
- `package.json` 에 playwright 잔존 없음.
- 성공 사례: yuki(44 parts·6/6) 로컬 rig 배포+실렌더 · uro(41 parts·42/42) 원격 웹앱 이식(2026-07-10 — 이식 시 project.json 의 `_project_base_url` 제거 필수, loader 가 이 필드를 우선함).

## Failure / Fallback

- 렌더 캔버스 빈/깨짐 → `_mini_rig` 미병합(함정 1) 또는 parts 누락. 스크립트의 parts 검증·원격 200 재확인.
- 로더 `project.json` JSON 파싱 실패 → vite SPA fallback(함정 4). 스테이징 실파일 확인.
- `ERR_NAME_NOT_RESOLVED` → 프로덕션 URL 직접 로드(함정 3). same-origin 스테이징으로.
- rig 에 mini_rig.json 없음 → 배포 금지(렌더 부정확). Vtube 파이프라인에서 재생성.

## 참고
- 레지스트리: `src/lib/avatars.ts`(`fetchAvatarPresets` = Storage `avatars/manifest.json` 동적 로드, 재빌드 없이 반영)·`isValidAvatarUrl`(우리 버킷 project.json 만 저장 허용). 렌더: `src/lib/pixi/rig`(`RigAvatar`).
- Storage 레이아웃: `avatars/<id>/project.json` + `avatars/<id>/parts/*` + `avatars/<id>/thumb.png`(정적 썸네일 — `scripts/generate-avatar-thumbs.mjs`). 현 로스터의 원천은 Storage `avatars/manifest.json`(2026-07-10 기준: 미미 mimi-smoke·유키 yuki·우로 uro).
- ponytail: 유저 업로드(MOD-02) 붙으면 매니페스트→DB `avatars` 테이블, 유저별 `avatars/<userId>/`.
