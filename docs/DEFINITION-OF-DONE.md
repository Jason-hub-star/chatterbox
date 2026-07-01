---
tags: [guide]
---

# Definition of Done (DoD)

> G-137 산출 문서. PR 병합 전 모든 항목 확인 필수.

## 기본 DoD (모든 PR)

- [ ] **TypeScript 컴파일**: `npm run type-check` 에러 0개
- [ ] **ESLint**: `npm run lint` 에러 0개
- [ ] **빌드**: `npm run build` 완료
- [ ] **Vitest 커버리지**: 70% 이상 (`npm run test:coverage`)
- [ ] **코드 리뷰**: 담당자 1인 approve

---

## 기능 카테고리별 추가 항목

### UI 컴포넌트 변경

- [ ] 모바일 반응형: 360px ~ 1920px 깨짐 없음
- [ ] WCAG AA 색상 대비 준수 (AccessibilityPolicy.md §4 참조)
- [ ] 키보드 탐색: Tab으로 인터랙티브 요소 접근 가능
- [ ] 스크린샷: 주요 상태 (기본/로딩/에러) 3개 PR에 첨부

### DB 변경 (마이그레이션 포함)

- [ ] 마이그레이션 파일 생성: `supabase migration new <name>`
- [ ] RLS 정책: 신규 테이블/컬럼에 정책 명시
- [ ] DOWN 마이그레이션: 별도 롤백 SQL 파일 준비
- [ ] Staging DB 선행 적용: `supabase db push --linked` 후 테스트
- [ ] 제로다운타임 설계: 컬럼 추가는 `ADD COLUMN NULL` → 배치 UPDATE → NOT NULL 변환 순서

### Edge Function 변경

- [ ] Rate Limit 확인: Supabase Edge Functions 월 100만 호출 한도
- [ ] 에러 코드: 400/401/403/404/500 명확한 메시지 반환
- [ ] 타임아웃: 최대 대기 시간 명시 (fal.ai는 최대 30초)

### 비용 영향 기능 (VGEN·DUB·WebRTC)

- [ ] Feature Flag gate 처리: `VGEN_ENABLED`, `DUB_ENABLED` 확인
- [ ] 일일/월별 한도 구현: `VGEN_DAILY_LIMIT` 등 config 기반
- [ ] COST-ESTIMATE.md 비용 영향 재산출 (DAU 1K 기준)

### 라이브 연기 기능 (Room·WebRTC)

- [ ] Staging 시연: 실제 LiveKit 방 생성 + 비디오 송수신 확인
- [ ] 연결 끊김 복구: 에러 메시지 또는 자동 재연결 동작 확인
- [ ] 모바일 카메라/마이크: 권한 요청 플로우 확인

### 보안 관련 변경

- [ ] PII 로깅 금지: console.log에 이메일·display_name·채팅 내용 없음 (SecurityPolicies.md §17 참조)
- [ ] Sentry `beforeSend` 훅: 기존 PII 필터 유지 확인
- [ ] RLS WITH CHECK: INSERT/UPDATE가 다른 사용자 데이터를 덮지 않는지 확인

---

## PR 체크리스트 템플릿

```markdown
## 변경 내용
- 어떤 기능 / 어떤 버그 수정인지 1줄

## 테스트
- [ ] 로컬 dev 서버 확인
- [ ] 자동 테스트 통과 (`npm run test`)
- [ ] Staging 배포 확인 (해당 시)

## DoD
- [ ] tsc 통과
- [ ] lint 통과
- [ ] 빌드 성공
- [ ] 커버리지 70%+
- [ ] 코드 리뷰 요청
- [ ] (DB 변경) 마이그레이션 + 롤백 파일 포함
- [ ] (비용 기능) Feature Flag gate 처리
- [ ] (라이브) Staging 시연 완료

Closes #이슈번호
```

---

## CI 자동화 (GitHub Actions)

`.github/workflows/ci.yml`:

```yaml
name: CI

on: [pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run build
      - run: npm run test:coverage -- --coverage
```

---

## 배포 전 최종 체크

1. Staging에서 최소 1시간 운영 확인
2. 이전 커밋 해시 기록 (롤백 대비)
3. DB 마이그레이션 → Edge Functions → SPA 순서로 배포

---

## 예외 (긴급 배포)

보안 취약점·서비스 중단 수준 버그 발생 시:
- 코드 리뷰 1인 (최소 유지)
- 기존 테스트는 모두 통과해야 함 (커버리지 70% 게이트 한시 면제)
- 배포 후 24시간 모니터링 필수
