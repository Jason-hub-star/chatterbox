# 더빙 E2E 하네스 (수동·게이트 비연동)

2026-07-26~27 사다리 Y·Z·Z4·험지(Z5)에서 실증한 seed-and-drive 하네스. 프로드 백엔드에 방/세션/트랙을 시드하고 헤드리스 시스템 Chrome(가짜 마이크)으로 실 UI 를 구동한다. **외부 의존(프로드 Supabase·LiveKit·R2·CF Pages)이라 CI 게이트에 안 묶는다** — 더빙 재생/녹음 로직을 만졌을 때 수동 스모크로 돌린다.

## 전제 (supabase-slice-verify 스킬 함정 참조)

```bash
# 1) playwright-core 임시 설치(검증 후 제거 — package.json 불변)
npm i playwright-core --no-save --no-package-lock
# 2) 로컬 프론트 대상 스크립트는 vite dev 5173 필수(R2 CORS 허용 오리진)
npm run dev -- --port 5173 --strictPort &
# 3) 실행 (.env 의 프로드 키 사용 — 값 출력 금지)
node tests/integration/dub/dub-part-loop-e2e.mjs
# 4) 정리
npm remove --no-save playwright-core
```

배포판 대상 2종(`deployed-*`)은 dev 서버 불필요 — `BASE=https://chatterbox-7r8.pages.dev`(기본값).
테스트 방은 각 스크립트 finally 에서 삭제(R2 소스 객체는 90d 보존정책 소멸·비치명).

## 스크립트 (검증 표면)

| 스크립트 | 표면 | 실적 |
|---|---|---|
| `dub-part-loop-e2e` | 리허설 반복·루프 테이크·자동정지·synced·상시 레이어·시크 재정렬 | 13/13 |
| `dub-beginner-signals-e2e` | 🎧 재청취·배지·submitFlash·정직 토스트·착지 정지·2탭 pause 힌트 | 11/11 |
| `dub-handles-e2e` | 말꼬리 핸들(endMs 3600)·자동정지 꼬리 포함·재녹음 pathname 교체 | 8/8 |
| `dub-reclaim-e2e` | 테이크 회수/비회수 판정(`__dubTakeStats`)·회수 토스트 | 13/13 |
| `dub-edge-terrain-e2e` | 붙은세그·초단세그·영상끝세그·가드3·연타·재녹음 내구 | 27/27 |
| `dub-multi-actor-e2e` | 다인 분기(submitMoved·비정지 착지·submitted 유지·일괄확정 1건) | 10/10 |
| `deployed-journey-e2e` | 배포 번들 초보자 원패스(DOM 전용) | 13/13 |
| `deployed-composite-e2e` | 배포 번들 합성→산출 mp4 ffprobe(유료 Demucs 1회 발생 주의) | 8/8 |

## 함정 요약 (메모리 chatterbox-e2e-traps §7·8)

- 룸 진입 게이트 2단([로그인하고 참여하기]→[배우로 참여]) 선행 클릭.
- 룸 진입 후 `waitForFunction` 불안정 → evaluate 폴링(`pollStore`) 사용.
- **recEngine 직접 구동은 busy 중 무음 no-op** — start/submit 전 `!recBusy` 폴링 필수.
- 헤드리스 SwiftShader 는 메인스레드 기아 중에도 비디오만 진행 — 벽시계/샘플러로 경계 정밀 측정 금지(랩 성립 여부만 DOM, 정밀값은 store·`__dubTakeStats`, 타이밍 의존 중지는 in-page setInterval).
- `separate-dub-audio` cache_only 404 콘솔에러는 설계상 정상(필터).
