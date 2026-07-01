---
tags: [guide]
---

# 배포 (Vercel)

정적/SSR 모두 Vercel 기본값으로 동작하는 Next.js 14 앱입니다. (tak 프로젝트와 동일 패턴)

## 현재 상태 (2026-06-20)

- ✅ **프로덕션 라이브**: https://snack-web-khaki.vercel.app
- Vercel 프로젝트 `snack-web`, scope `kimjuyoung1127s-projects` (계정 `kimjuyoung1127`).
- git 리포 아님 → `vercel` CLI 폴더 직접 업로드 방식. **재배포 = 아래 한 줄**:
  ```bash
  vercel --prod --yes --scope kimjuyoung1127s-projects
  ```
  (비대화 모드라 `--scope` 필수. 빠지면 `missing_scope` 에러.)
- ⚠️ 배포 전 dev 서버(:3001) 끄고 `.next` 클린 빌드 — `.next` 충돌 시 CSS 깨짐.

## 처음 한 번

```bash
npm install
npm run build        # 로컬 빌드 통과 확인 (필수 게이트)
```

## Vercel 배포

### 방법 A — 대시보드 (권장, 가장 쉬움)
1. 이 폴더를 GitHub 리포로 푸시.
2. vercel.com → New Project → 해당 리포 import.
3. Framework = Next.js 자동 감지. 그대로 Deploy.
4. 도메인 연결: Project → Settings → Domains.

### 방법 B — CLI
```bash
npm i -g vercel
vercel            # 프리뷰 배포
vercel --prod     # 운영 배포
```

> ⚠️ 폴더를 통째로 지우고 재빌드하면 `.vercel` 링크가 사라져 새 프로젝트가 생길 수 있음.
> 그 경우 `vercel link` 로 기존 프로젝트에 다시 연결.

## 반응형 / 성능

- 루트 폰트 18px(데스크탑) / 16px(≤768px) — `globals.css`.
- 모든 섹션 모바일 1열 → `md`/`lg` 에서 다열로 자동 전환.
- 이미지 추가 시 `next/image` 사용(avif/webp 자동, `next.config.mjs`).
- `prefers-reduced-motion` 존중.

## 배포 전 체크

- [x] `npm run build` 통과 (151kB)
- [x] `BRAND.name` 교체 — `Snack` 확정. (단 `url/applyUrl/contactEmail/social`은 아직 `example.com`)
- [ ] `〔仮〕` 임시 카피 잔존 — **다수 잔존**(비전 확정 후 교체)
- [ ] OG 이미지(`public/og/…`)·favicon 추가 — **미완**(트랙③)
- [x] 모바일·데스크탑 육안 확인 (히어로 v3 검증 완료)

## 배포 롤백 절차

배포 후 심각한 문제 발견 시 이전 배포로 즉시 복귀.

### Cloudflare Pages 롤백

```bash
# 1. Cloudflare 대시보시 접속
# Pages 프로젝트(snack-web-prod) → Deployments

# 2. 배포 히스토리 확인
# 리스트에서 이전의 성공한 배포 찾기

# 3. 배포 클릭 → "Rollback to this deployment" 선택
# 또는 CLI로 직접 롤백

wrangler pages rollback \
  --project-name snack-web-prod \
  --deployment-id <PREVIOUS_DEPLOYMENT_ID>
```

### 배포 ID 확인

```bash
# 최근 배포 목록 조회
wrangler pages deployment list --project-name snack-web-prod

# 출력:
# ID                           Status    Created On
# 1a2b3c4d5e6f7g8h (이전)    Active    2026-07-01 10:00
# 9i8j7k6l5m4n3o2p (현재)    Active    2026-07-01 11:00
```

### 롤백 후 검증

- [ ] 배포 완료 후 https://snack-web-prod.pages.dev 접속 확인
- [ ] `/rooms/test` 라우팅 정상 동작
- [ ] 브라우저 콘솔에서 환경변수(`VITE_SUPABASE_URL`) 확인
- [ ] Sentry 대시보드에서 에러 급증 모니터링

### 롤백이 실패한 경우

1. Cloudflare 대시보드에서 수동으로 이전 배포 선택 후 "Activate"
2. 로컬에서 git 태그 기반 재배포:
   ```bash
   git checkout tags/v1.0.0  # 이전 안정 버전
   npm run build
   wrangler pages deploy dist --project-name snack-web-prod
   ```
3. Vercel(랜딩 페이지)도 동시에 롤백 필요 시: Vercel 대시보드 > Deployments에서 이전 배포 "Promote to Production"
