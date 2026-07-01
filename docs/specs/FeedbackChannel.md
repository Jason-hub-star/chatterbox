---
tags: [spec]
---

> G-114 산출 문서. 고객 문의 채널 전략. MVP는 Discord + Tally($0).

# 고객 문의 채널 전략

DAU 규모별 단계적 채택 (Discord→Crisp Mini→Crisp Essentials), MVP는 0원 솔루션.

---

## 단계별 채택 전략

| 단계 | DAU | 권장 조합 | 월 비용 | 변경점 |
|-----|------|---------|-------|--------|
| **MVP** | <100 | Discord + Tally | $0 | — |
| **Alpha** | 100~500 | Discord + Tally + Mava AI 봇 | $0 | Mava 자동 분류 추가 |
| **Beta** | 500~1K | Crisp Mini + Discord 백업 | $45 | 실시간 지원 인터페이스 추가 |
| **Production** | 1K+ | Crisp Essentials + Slack 통합 | $95 | 팀 협업·자동 라우팅 |

---

## MVP 설정: Discord + Tally ($0)

### Discord 서버 구조

**채널 4개:**

```
#📢-공지 (공지사항 전용)
#❓-문의 (일반 문의)
#🐛-버그리포트 (버그 보고)
#💬-일반 (자유 채팅)
```

### Discord 채널 별 용도

| 채널 | 목적 | 관리자 | 사용자 |
|-----|------|--------|--------|
| `#📢-공지` | 공지사항·업데이트 안내 | 공지 게시만 가능 | 읽기만 |
| `#❓-문의` | 기능·사용법 관련 질문 | 답변·스레드·고정 | 질문 발행 |
| `#🐛-버그리포트` | 버그·오류 보고 | 분류·추적·해결 | 보고 발행 |
| `#💬-일반` | 기타 피드백·커뮤니티 | 중재만 | 자유 채팅 |

### Tally 폼 (문의 포집)

**폼 URL:** `https://tally.so/r/[form-id]`  
**수신처:** gmdqn2tp@gmail.com

**필드 5개:**

1. **이메일** (필수)
   - 타입: 이메일
   - 응답 확인·follow-up 연락처

2. **문의 유형** (필수)
   - 옵션: 
     - 기능 요청
     - 버그 신고
     - 사용 도움
     - 기타
   
3. **제목** (필수)
   - 타입: 텍스트
   - 예: "WebRTC 연결 끊김"

4. **내용** (필수)
   - 타입: 긴 텍스트
   - 플레이스홀더: "상세하게 설명해주세요..."

5. **첨부 파일** (선택)
   - 스크린샷·영상

### Tally 이메일 알림 설정

1. Tally 대시보드 → [form name] → Settings
2. **Notifications** 섹션 → "Email notifications"
3. 수신자: `gmdqn2tp@gmail.com`
4. **Include answer with notification** 체크
5. 저장

### Discord에 Tally 연동 (웹훅)

**방법 1: 수동 포스팅**
- Tally 제출 → 이메일 수신 → 수동으로 `#❓-문의` 채널에 요약 포스팅

**방법 2: Zapier (선택, 무료)**
- Zapier 가입 → Tally 트리거 → Discord 액션 설정
- 자동으로 `#❓-문의`에 신규 문의 포스팅

---

## Alpha: Mava AI 봇 추가

**Mava 봇:**
- Discord 봇 자동 분류·응답 생성
- 무료 플랜: 50개 메시지/월
- 자동 분류: 우선순위·카테고리

**설정:**
1. Discord 서버 → Integrations → Bots → "Mava"
2. 채널 권한: #❓-문의, #🐛-버그리포트 메시지 읽음
3. 프롬프트: "문의를 카테고리별로 분류하고 적절한 응답 제안"
4. 각 메시지에 ✅/❌/⚠️ 반응 버튼 추가

---

## Beta: Crisp Mini ($45/월)

**Crisp.chat:** 실시간 고객 지원 플랫폼

### 기본 기능
- 실시간 채팅 위젯 (앱 좌측하단)
- 방문자 기록·분석
- 이메일 통합
- 모바일 앱

### 설정

1. Crisp 가입 (https://crisp.chat)
2. 플랜: **Crisp Mini** ($45/월)
3. 웹사이트 설정 → Website Name: "snack-web"
4. Chat Widget 코드 생성 → SPA (Vite) index.html에 추가

```html
<!-- Crisp 채팅 위젯 -->
<script type="text/javascript">
  window.$crisp = [];
  window.CRISP_WEBSITE_ID = "[WEBSITE_ID]";
  (function() {
    d = document;
    s = d.createElement("script");
    s.src = "https://client.crisp.chat/l.js";
    s.async = 1;
    d.getElementsByTagName("head")[0].appendChild(s);
  })();
</script>
```

### Discord 백업 유지
- Crisp → Discord 채널 (#❓-문의)로 자동 전달
- Zapier: Crisp message → Discord webhook

---

## Production: Crisp Essentials ($95/월)

**추가 기능:**
- 팀 협업 (최대 5인 에이전트)
- 자동 라우팅 (우선순위·카테고리별)
- Slack 통합
- 고급 분석
- 응답 템플릿·매크로

### Slack 통합 설정

1. Crisp 대시보드 → Integrations → Slack
2. Slack 워크스페이스 선택
3. 채널 지정: #customer-support
4. 권한 확인
5. 자동 알림 활성화

---

## UI 배치: 헤더 링크 + 드롭다운

### React 컴포넌트 (TypeScript)

```typescript
import { useState } from 'react';
import { useHelpStore } from '@/stores/helpStore';

export function FeedbackDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { setIsOpen: setHelpOpen, setActiveSection } = useHelpStore();

  return (
    <div className="feedback-dropdown">
      {/* 헤더 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="feedback-button"
        aria-label="피드백"
      >
        💬
      </button>

      {/* 드롭다운 모달 */}
      {isOpen && (
        <div className="feedback-menu" role="menu">
          <a
            href="https://tally.so/r/[form-id]"
            target="_blank"
            rel="noopener noreferrer"
            className="menu-item"
          >
            📝 문의 폼 (Tally)
          </a>

          <a
            href="https://discord.gg/[invite-code]"
            target="_blank"
            rel="noopener noreferrer"
            className="menu-item"
          >
            💬 Discord 커뮤니티
          </a>

          <button
            onClick={() => {
              setHelpOpen(true);
              setActiveSection('troubleshooting');
              setIsOpen(false);
            }}
            className="menu-item"
          >
            ❓ FAQ (도움말)
          </button>

          <a
            href="mailto:gmdqn2tp@gmail.com?subject=snack-web%20피드백"
            className="menu-item"
          >
            📧 이메일
          </a>
        </div>
      )}

      <style>{`
        .feedback-dropdown {
          position: relative;
        }

        .feedback-button {
          background: transparent;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 4px;
        }

        .feedback-button:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .feedback-menu {
          position: absolute;
          top: 100%;
          right: 0;
          background: white;
          border: 1px solid #ccc;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          min-width: 200px;
          margin-top: 0.5rem;
        }

        .menu-item {
          display: block;
          padding: 0.75rem 1rem;
          color: inherit;
          text-decoration: none;
          border: none;
          background: none;
          cursor: pointer;
          width: 100%;
          text-align: left;
        }

        .menu-item:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        .menu-item:first-child {
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
        }

        .menu-item:last-child {
          border-bottom-left-radius: 8px;
          border-bottom-right-radius: 8px;
        }
      `}</style>
    </div>
  );
}
```

### 헤더 배치 예시

```
┌────────────────────────────────────────────────────┐
│ 로고  [Lobby] [Profile]              [⚙️] [?] [💬] │
└────────────────────────────────────────────────────┘
                                          ^   ^   ^
                                         설정 도움 피드백
```

---

## 확장 경로 (로드맵)

### Phase 2: Live Chat (DAU 500+)

```
Crisp Mini 추가
  ├─ 웹사이트 우측하단 "Chat" 위젯
  ├─ 실시간 에이전트 응답
  ├─ 방문자 추적
  └─ 이메일 연동
```

### Phase 3: 팀 협업 (DAU 1K+)

```
Crisp Essentials + Slack
  ├─ 5인 지원팀
  ├─ 자동 라우팅 (버그/기능/사용법)
  ├─ 응답 템플릿
  ├─ 분석 대시보드
  └─ Slack #customer-support 실시간 알림
```

### Phase 4: AI 에이전트 (DAU 5K+)

```
OpenAI GPT-4 + Custom Assistant
  ├─ 자동 FAQ 응답
  ├─ 버그 보고 분류
  ├─ 기능 요청 축약
  └─ 인간 에이전트에게 에스컬레이션
```

---

## 즉시 적용 체크리스트 (MVP)

- [ ] Discord 서버 생성
  - 초대 링크 생성: https://discord.gg/[code]
  - 4개 채널 생성 (#📢-공지, #❓-문의, #🐛-버그리포트, #💬-일반)
  - 권한 설정 (읽기전용 채널 등)

- [ ] Tally 폼 생성
  - 로그인: https://tally.so
  - 폼 이름: "snack-web 문의"
  - 5개 필드 추가
  - 이메일 알림 설정: gmdqn2tp@gmail.com
  - 공유 링크 복사

- [ ] FeedbackDropdown 컴포넌트 구현
  - Header에 삽입
  - 스타일 적용
  - HelpPanel과 연동

- [ ] 링크 정보 업데이트
  - Discord 초대 링크
  - Tally 폼 URL
  - 이메일 주소

- [ ] 홍보 (출시 시)
  - 헤더 피드백 버튼 안내
  - Discord 커뮤니티 링크 배포

---

## Japan Support Readiness (G-174)

일본 출시에서는 Discord를 코어 커뮤니티 채널로 유지하되, 일반 사용자의 첫 문의 채널은 더 익숙한 방식으로 열어 둔다.

### 채널 우선순위

| 채널 | 용도 | 출시 전 준비 |
|---|---|---|
| X DM | 공개 홍보 후 빠른 문의 | 자동 응답 문구, 운영 시간, 메일폼 링크 |
| LINE Official Account | 모바일 사용자 공지/문의 | 계정 개설 여부와 월 비용 검토 |
| 이메일/메일폼 | 결제·계정·법적 문의 | 일본어 템플릿, 첨부 파일, 접수 번호 |
| Discord | 코어 팬·테스터 커뮤니티 | 베타 테스트/릴리즈 노트/버그 스레드 |

### 일본어 응답 템플릿

- 계정/로그인 문제: 기기, 브라우저, 로그인 방식, 재현 시간 요청.
- 결제/크레딧 문제: 결제수단, 영수증 번호, 차감된 크레딧, 생성물 URL 요청.
- 신고/안전 문제: 방 ID, 신고 대상, 발생 시간, 스크린샷/녹화 첨부 요청.
- 저작권/二次創作 문의: 권리자 여부, 원작명, 사용 범위, 삭제 요청 여부 확인.

### 익명/모바일 사용자 배려

- 문의 폼은 로그인하지 않아도 제출 가능해야 한다.
- 익명 방/닉네임 사용자는 문의 시 계정 이메일 대신 접수 번호를 받을 수 있어야 한다.
- 모바일에서 파일 첨부가 실패해도 텍스트 접수가 먼저 완료되어야 한다.

---

## 비용 계산 예시

| 항목 | MVP | Alpha | Beta | Prod |
|-----|-----|-------|------|------|
| Discord | $0 | $0 | $0 (백업) | $0 (백업) |
| Tally | $0 | $0 | 미사용 | 미사용 |
| Mava | $0 | $0 | 미사용 | 미사용 |
| **Crisp Mini** | — | — | $45 | — |
| **Crisp Essentials** | — | — | — | $95 |
| Slack | 무료 | 무료 | 무료 (필수) | 무료 |
| **월 합계** | **$0** | **$0** | **$45** | **$95** |

---

## 관련 문서

- [[HelpPanel]] (G-113) — 인앱 FAQ 통합
- [[CommunityGuidelines]] (G-121) — 커뮤니티 규칙
- [[COST-ESTIMATE]] (G-133) — 월별 비용 계획

---

## 한줄정리

snack-web의 피드백 채널은 MVP ($0)에서 Discord 4개 채널 + Tally 폼으로 시작하고, Alpha에서 Mava AI 봇으로 자동 분류하며, Beta (DAU 500+)에서 Crisp Mini ($45/월), Production (DAU 1K+)에서 Crisp Essentials ($95/월) + Slack 통합으로 확장하며, 헤더 💬 버튼에서 드롭다운으로 문의/Discord/FAQ/이메일 4가지 채널을 제공한다.
