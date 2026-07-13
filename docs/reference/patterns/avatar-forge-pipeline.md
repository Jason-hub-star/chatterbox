---
tags: [reference, pattern]
status: ui-complete (auto-trigger deploy pending)
created: 2026-07-09
---

<!-- reference/patterns: PNG→Live2D 아바타 생성(Avatar Forge) 요청·진행·수령 패턴.
     기반: Vtube Modal 리깅 파이프라인(chatterbox-rig) + Supabase(avatar_jobs·Storage·Realtime).
     구조: 클라 → Storage 업로드 → Edge(create-avatar-job) → Modal 웹엔드포인트 spawn →
           파이프라인이 각 phase마다 avatar_jobs PATCH(service_role) → 완성 리그 Storage avatars/<job>/ 발행 →
           Realtime → 클라가 result_project_url 로드(AvatarPreview/SelfAvatar 네이티브 렌더러).
     VGEN(falai-vgen-pipeline) 잡 패턴의 자매 — 같은 뼈대(잡 테이블·Realtime·Edge·webhook 대신 직접 PATCH). -->

# Avatar Forge — PNG → Live2D 아바타 생성 파이프라인

> **한 줄**: 사용자가 PNG 1장 올리면 25~40분 뒤 **선택 가능한 자기 Live2D 아바타**를 받는다. VGEN(영상)과 동형의 비동기 잡 — 여기선 결과가 rig(`project.json` + `parts/*.webp`)이고, 완성되면 의상실 프리셋에 뜬다.
>
> **상태(2026-07-09)**:
> - ✅ **수령/렌더 반쪽 증명됨** — 서버 리그를 `avatars/<id>/` 에 발행하면 네이티브 `RigAvatar`(AvatarPreview·SelfAvatar·방)가 그대로 로드·렌더·웹캠 구동(미미 서버본 실증).
> - ✅ **배선 코드 완료·검증** — 마이그 `avatar_jobs`, 엣지 `create-avatar-job`, 클라 `lib/avatarJobs.ts`, dev 라우트 `/atelier-forge` (type-check·lint 통과).
> - ✅ **의상실 커미션 UI 승격 완료(2026-07-09)** — `features/avatar/CommissionCorner.tsx`+`useAvatarJobs.ts`+AtelierPage 입어보기. 아래 대기 UX 원칙 ①~⑤ 전부 구현(전역 알림·진행은 2026-07-13 대기 UX 사다리로 닫음 — 아래 참조). 마이그 push 완료(avatar_jobs·avatar-uploads 10MB/png). seed-and-drive E2E 17/17.
> - ✅ **자동 트리거 배포 완료(2026-07-09)** — Modal `chatterbox-rig` deploy(submit 웹엔드포인트) + `vtube-supabase` 시크릿 + supabase secrets(MODAL_ENDPOINT_URL·MODAL_TRIGGER_SECRET) + 엣지 `create-avatar-job` 배포 + 프론트 CF Pages. 스모크: 엣지 무인증 401·Modal 무시크릿 401. 배포판 E2E 통과.
> - ✅ **첫 실런($2) 완료(2026-07-11)** — GPU 전 구간 성공·발행만 Modal 볼륨 스테일로 실패 → 워커 수정(reload+재시도)·구조 발행으로 잡 완결(306592e7). 실패 시 리그는 볼륨에 생존 — 재결제 없이 `scripts/publish-avatar-job.mjs`로 발행(절차는 Vtube 스킬 `chatterbox-avatar-forge` 함정표). 실패 에러 원문은 UI 비노출(`atelier.commissionFailedHint`).
> - 📌 **미학 품질은 자동 게이트 불가 실측(2026-07-11)** — 취향 수준 비례 드리프트("입 높음")는 기하 지표·VLM 심판 모두 정상 판정. 예방 주 채널 = 수령 루프(미리보기 후 보정/재주문 훅, 트랙 B 백로그). **후속 반전**: "입이 딴 데서 열림"의 진범은 형제 키폼 소실(구조 결함) — Vtube 증류가 자동수복하고 rig_health 게이트가 차단(모델 불문 로직, 상세는 Vtube 스킬 `chatterbox-avatar-forge` 함정표). 306592e7은 수복판 재발행 완료.
> - ✅ **대기 UX 사다리 완료·프로드 배포(2026-07-13)** — 전역 알림 defer 해제(uiux #20·#22 준수): ①완료 알림 배선(`avatar_jobs` done/failed→`notifications` AFTER UPDATE 트리거→`NotificationBell`, 프로드 트리거 실측 PASS) ②전역 진행 pill(`AvatarForgePill` 광장 헤더, 로비 돌아다녀도 "제작 중" 노출) ③스텝 생기(경과시간 + 현단계 펄스 + phase내 indeterminate — 가짜 스피너 아님) ④유휴 여백 채우기(제작흐름 3스텝 + 업로드 가이드 상시). CommissionCorner OrderCard·`AvatarForgePill`·`NotificationBell`·마이그 `20260713180000_avatar_job_notify.sql`.

## UI/UX 빌더가 알아야 할 것 (바로 쓰는 계약)

의상실(AtelierPage) 커미션 UX를 만들 때 **이 함수들만 호출**하면 된다. 리깅·GPU·발행은 전부 뒤에서 자동.

### 클라이언트 API — `src/lib/avatarJobs.ts`

```ts
// 1) PNG 업로드 → object key 반환. (avatar-uploads 버킷 <authUid>/uploads/<uuid>.png)
uploadAvatarPng(file: File): Promise<string>

// 2) 리깅 잡 생성(트리거). Edge → Modal spawn. 즉시 반환(잡은 뒤에서 25~40분).
createAvatarJob(accessToken: string, objectKey: string): Promise<{ job_id: string; status: AvatarJobStatus }>

// 3) 진행 실시간 구독(Realtime postgres_changes). 파이프라인의 phase PATCH 가 자동 방송.
subscribeToAvatarJob(jobId: string, onChange: (job: AvatarJob) => void): () => void

// 4) 재진입 — 내 잡 목록(탭 닫았다 와도 진행 중/완료가 보임).
fetchMyAvatarJobs(limit?: number): Promise<AvatarJob[]>
```

`AvatarJob`(`src/types/avatarJob.ts`): `{ id, userId, status, phase, resultProjectUrl, error, createdAt }`.

### 잡 상태 기계 (커미션 스테퍼용)

```
queued ──> running ──[phase: analyzing → cutting → rigging → finishing]──> done
                │                                                            └─ resultProjectUrl 세팅
                └────────────────────────────────────────────────────────> failed (error 사유)
```

phase → 스테퍼 라벨(제안): `analyzing`=① 분석·원화 / `cutting`=② 재단 / `rigging`=③ 리깅·표현 / `finishing`=④ 완성.

### 결과 렌더 (수령)

`status==='done'` 이면 `resultProjectUrl`(= `avatars/<job>/project.json`)을 기존 렌더러에 그대로:

```tsx
<AvatarPreview projectUrl={job.resultProjectUrl} size={220} />       // 거울(정적)
<SelfAvatar projectUrl={job.resultProjectUrl} sendBlendshapes={fn} size={220} />  // 비춰보기(웹캠 구동)
```

`isValidAvatarUrl`(avatars.ts) 통과 형태라 `setMyAvatar(url)`로 **내 아바타로 지정**도 즉시 가능. 완성 아바타를 의상실 프리셋에 상시 노출하려면 `avatars/manifest.json` 에 `{id, name}` 추가(현재 배포 스크립트 `scripts/deploy-avatar.mjs` 규약; 유저 업로드 승격 시 DB `avatars` 테이블로 = ponytail).

### 대기 UX 원칙 (의상실 = 주문/commission)

25~40분은 **숨기지 말고 "장인이 손으로 재단하는 시간"으로 프레이밍**. 핵심: ①업로드 후 즉시 화면에서 풀어줌(fire-and-forget) ②`fetchMyAvatarJobs`로 재진입 시 진행 중 주문서 복원 ③4스텝 실제-진행 스테퍼(가짜 스피너 아님) ④완성 시 알림(`notifications` 테이블 재사용 가능)+거울에 NEW ⑤실패 시 친절한 사유+재업로드. 참조 dev 구현: `src/pages/AvatarForgeDevPage.tsx`(라우트 `/atelier-forge`, 버림 UI지만 4함수 전부 실사용).

## 아키텍처 (전체 경로)

```
[클라] PNG → Storage avatar-uploads/<authUid>/uploads/<uuid>.png (RLS: 본인 폴더)
      → createAvatarJob(token, key)
[엣지] create-avatar-job: getAppUser → avatar_jobs insert(queued) → 업로드 PNG signed GET URL
      → Modal 웹엔드포인트 POST(spawn, body에 trigger_secret) → provider_call_id 저장·status=running
[Modal] submit(fastapi_endpoint): 시크릿 검증 → png 다운로드→볼륨 → run_pipeline.spawn
        run_pipeline: generate_inputs → decompose → build_rig → publish
          각 단계 사이 avatar_jobs PATCH(service_role): phase=analyzing→cutting→rigging→finishing
          publish(bake_storage_avatar.py): project.json + parts/*.webp → Storage avatars/<job>/
          → avatar_jobs PATCH(status=done, result_project_url, completed_at)
[클라] subscribeToAvatarJob → done 시 AvatarPreview/SelfAvatar 로드
```

**핵심 계약 (깨지면 로드 실패)**:
- 발행처는 **Supabase Storage 공개 `avatars` 버킷**(R2 아님) — 로더 신뢰-오리진이 `*.supabase.co`만 허용(`src/lib/pixi/rig/loader.ts`), `isValidAvatarUrl`이 `STORAGE_BASE`+`/project.json`만 통과.
- `project.json._project_base_url` = **빈 문자열** — 로더가 `_project_base_url || deriveBaseUrl(projectUrl)`로 발행 위치에서 파생. Vtube `bake_storage_avatar.py`가 이 규약대로 굽는다(`build_player_webapp`의 `/project/` 기본값을 쓰면 깨짐).
- rig 스키마 = `character.json` + `_mini_rig`(인라인) + `parts[].source_path=parts/*.webp` — Vtube 파이프라인이 네이티브로 산출(기성 로스터와 동일 포맷).

## 티어 정책 (자동 파이프라인 기본)

`run_pipeline`은 프로덕션 안전 티어로 호출: **ARAP meet 감은눈**(`tha4=False, crown=False`) — 자기 픽셀 결정론 워프라 이물 원천 불가. THA4 눈/crown은 어두운 머리·비표준 화풍에서 재작화 이물 위험이라 옵트인(Vtube 스킬 `autorig-upload-e2e` 티어 정책). 표현력 강화는 비파괴 옵트인으로 후속.

## 백엔드 SSOT
- 테이블: `docs/DATA-SCHEMA.md §1.9 avatar_jobs`
- API: `docs/API-SURFACE.md` "Avatar Forge APIs"
- 리깅/발행 런북(Vtube): 스킬 `chatterbox-avatar-forge` + `autorig-upload-e2e`
- 자매 패턴: `docs/reference/patterns/falai-vgen-pipeline.md`(같은 잡 뼈대, 결과가 영상)
