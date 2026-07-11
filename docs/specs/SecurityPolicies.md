---
tags: [spec]
---

<!--
  specs/ 문서 — Phase 1 DB 구축 전 필수 보안 정책
  Updated: 2026-07-01 · PLATFORM-SECURITY-RISKS-B §5 Phase 게이트 · VUL-01/VUL-03/VUL-04 반영
  Sources: OWASP, Supabase docs, LiveKit docs, OpenAI Moderation API, NIST
-->
<!-- opencode: 2026-06-29 - LiveKit 토큰 무효화 + replay 방어 §8 신설 (G-37·G-44·C1·C7). Coded with OpenCode; high-cost model review recommended. -->

# ChatterBox 보안 정책 (SEC)

> **범위**: 인증·인가·토큰·미디어·모더레이션·환경변수 정책
> **적용**: Phase 1 DB 마이그레이션 전 모두 완료
> **책임**: 백엔드 리더가 체크리스트 항목별 구현/검증 후 DONE 마킹

---

## 문서 분할 안내 (2026-07-08)

본 정책은 1,500줄 회전 임계를 초과하여 주제별 하위 문서로 분할되었습니다. 섹션 번호(§0–§18)는 그대로 유지되며, 각 섹션은 아래 파일에 있습니다. 인바운드 링크는 이 허브 경로를 그대로 사용하세요.

| 하위 문서 | 포함 섹션 |
|---|---|
| [`auth-and-rls.md`](security/auth-and-rls.md) | 인증·RLS (§0–§2) |
| [`livekit-media-moderation.md`](security/livekit-media-moderation.md) | LiveKit 토큰·미디어·모더레이션·DataChannel·OBS (§3–§7) |
| [`token-invalidation-env.md`](security/token-invalidation-env.md) | 토큰 무효화·Replay 방어·환경변수·Phase1 게이트 (§8–§10) |
| [`consent-credits-quota.md`](security/consent-credits-quota.md) | 녹화 동의·크레딧 동시성·rate limit·차단 게이트·스토리지 쿼터 (§11–§15) |
| [`reporting-logging-feedback.md`](security/reporting-logging-feedback.md) | 신고·차단·PII 로깅·피드백 루프·참고 (§16–§18, 참고) |

### 섹션 → 파일 색인

| 섹션 | 위치 |
|---|---|
| 0. P0 보안 차단 게이트 | [security/auth-and-rls.md](security/auth-and-rls.md) |
| 1. 인증 정책 (AUTH) | [security/auth-and-rls.md](security/auth-and-rls.md) |
| 2. RLS 정책 (Row Level Security) | [security/auth-and-rls.md](security/auth-and-rls.md) |
| 3. LiveKit 토큰 보안 | [security/livekit-media-moderation.md](security/livekit-media-moderation.md) |
| 4. 미디어 보안 (Supabase Storage + R2) | [security/livekit-media-moderation.md](security/livekit-media-moderation.md) |
| 5. 프롬프트 모더레이션 (VGEN-06) | [security/livekit-media-moderation.md](security/livekit-media-moderation.md) |
| 6. DataChannel 보안 | [security/livekit-media-moderation.md](security/livekit-media-moderation.md) |
| 7. OBS 방송 송출 옵션 게이트 (P2, OBS-01·OBS-02·OBS-03) | [security/livekit-media-moderation.md](security/livekit-media-moderation.md) |
| 8. LiveKit 토큰 무효화 + Replay 방어 (G-37·G-44) | [security/token-invalidation-env.md](security/token-invalidation-env.md) |
| 9. 환경 변수 관리 | [security/token-invalidation-env.md](security/token-invalidation-env.md) |
| 10. Phase 1 게이트 체크리스트 | [security/token-invalidation-env.md](security/token-invalidation-env.md) |
| 11. 녹화/DUB 사용자 동의 + 보존기간 정책 (G-39·G-43) | [security/consent-credits-quota.md](security/consent-credits-quota.md) |
| 12. 크레딧 동시성·격리 레벨·할당량 (G-40·G-41·G-42) | [security/consent-credits-quota.md](security/consent-credits-quota.md) |
| 13. 입장·방 생성·초대코드 rate limit (HIGH 핵심) | [security/consent-credits-quota.md](security/consent-credits-quota.md) |
| 14. 차단 사용자 방 입장 게이트 (SEC-04·G-84) | [security/consent-credits-quota.md](security/consent-credits-quota.md) |
| 15. 스토리지 쿼터 정책 (G-83) | [security/consent-credits-quota.md](security/consent-credits-quota.md) |
| 16. 신고·차단·메시지 숨김·감사 로그 (SEC-04·INF-07) | [security/reporting-logging-feedback.md](security/reporting-logging-feedback.md) |
| 17. Error Logging PII 필터링 정책 + 로그 보존 기간 (G-125) | [security/reporting-logging-feedback.md](security/reporting-logging-feedback.md) |
| 18. 신고 접수→처리 피드백 루프 (G-93) | [security/reporting-logging-feedback.md](security/reporting-logging-feedback.md) |
| 참고 자료 | [security/reporting-logging-feedback.md](security/reporting-logging-feedback.md) |

