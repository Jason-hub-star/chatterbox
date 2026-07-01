---
tags: [spec]
---

# 접근성 정책 (Accessibility Policy)

**최종 수정**: 2026-06-30  
**상태**: G-116 초안  
**작성자**: snack-web 팀

---

## §1 접근성 정책 목표

### 1.1 WCAG 2.1 AA 준수 선언

snack-web은 **WCAG 2.1 Level AA** 표준을 준수하여 개발합니다. AAA 수준은 과하지 않으나, A 수준만으로는 웹 접근성 법규(국내 장애인차별금지법, 국제 표준)를 충족하지 못해 AA를 최소 기준으로 설정했습니다.

- **적용 시점**: 기능 추가 단계부터 자동화 + 수동 검증 병행
- **리뷰 게이트**: PR 병합 전 axe-core 자동 검증 필수

### 1.2 적용 범위

#### 포함 범위
- 모든 사용자 인터페이스 요소 (버튼, 입력창, 탭패널, 드롭다운 등)
- 실시간 업데이트 영역 (채팅, 리액션, 디렉터 노트)
- 모달, 팝업, 설정 페이지
- 에러/성공/알림 메시지

#### 제외 범위 (대체 수단 제공)
- **WebGL/PixiJS 아바타 캔버스**: 스크린리더 직접 접근 불가능한 기술적 한계 → 다음 장 참조
  - 아바타 주변에 `role="img"` + `aria-label="[참여자명] 아바타"` 추가
  - 음성 기반 참여, 텍스트 채팅으로 완전 대체 가능

### 1.3 검증 방법

#### 자동화
- **axe-core**: Vitest-axe 또는 Playwright axe 플러그인으로 PR 게이트 구성
- **빌드 체크**: tsc, ESLint a11y 규칙 (eslint-plugin-jsx-a11y)

#### 수동 검증 (정기)
- 키보드 전용 세션 (Tab·Enter·Escape·Arrow keys만 사용)
- 스크린리더 테스트
  - macOS: VoiceOver + Safari
  - Windows: NVDA + Chrome
- 색상 대비 확인 (WebAIM Contrast Checker)
- 포커스 시각화 확인 (검은색 배경에서 outline 보임)

---

## §2 색상 대비 검증 결과

> ⚠️ **2026-07-01 무채색 팔레트 개정 — 아래가 현행 SSOT.** WCAG 공식으로 재계산 완료
> (`python3` 정확 계산, 어림값 아님). 구버전(앰버 다크나이트) 수치는 본 섹션 하단 참조.

### 색상 팔레트 (→ DESIGN-TOKENS.md §8)

| 색상명 | 16진 코드 | RGB | 용도 |
|--------|---------|-----|------|
| stage-base | `#0B0B0D` | (11, 11, 13) | 무대 배경, 메인 어두운 배경 |
| stage-text | `#F5F5F2` | (245, 245, 242) | 주 텍스트, 기본 전경색 |
| fire-amber | `#FF8C2A` | (255, 140, 42) | 강조색 전용 — CTA·호스트·활성 상태 (배경 워시 금지) |
| stage-panel | `#18181C` | (24, 24, 28) | 패널 배경, 채팅 박스 배경 |
| stage-elevated | `#222227` | (34, 34, 39) | 모달·호버·플로팅 요소 |
| stage-text-muted | `#9C9CA3` | (156, 156, 163) | 보조 텍스트, 비활성 상태 |
| fire-hot | `#FF4500` | (255, 69, 0) | 녹음/라이브 상태 |
| spring-green | `#56F09F` | (86, 240, 159) | 트래킹/성공 상태 |

### 대비비 검증 (WCAG 공식 계산식)

**기준:**
- 일반 텍스트 (14px 이상): 최소 **4.5:1** (AA), 7:1 (AAA)
- 큰 텍스트 (18px 이상) / UI 컴포넌트: 최소 **3:1** (AA), 4.5:1 (AAA)

#### 1. stage-text on stage-base

**대비비: 18.00:1** ✓ AA & AAA 통과

**용도**: 메인 텍스트, 기본 UI 요소
**권장**: 일반·큰 텍스트, 버튼 레이블, 폼 입력값

---

#### 2. stage-text on stage-panel

**대비비: 16.21:1** ✓ AA & AAA 통과

**용도**: 채팅 패널, 카드 배경의 텍스트
**권장**: 패널 내 모든 텍스트

---

#### 3. stage-text on stage-elevated

**대비비: 14.50:1** ✓ AA & AAA 통과

**용도**: 모달·호버 상태 텍스트

---

#### 4. fire-amber on stage-base

**대비비: 8.46:1** ✓ AA & AAA 통과

**용도**: CTA 버튼, 강조 텍스트, 활성 탭 표시
**권장**: 큰 텍스트, 버튼, 링크, 포커스 인디케이터

---

#### 5. fire-amber on stage-panel

**대비비: 7.62:1** ✓ AA & AAA 통과

**용도**: 활성 상태 표시, 패널 강조
**권장**: 버튼 호버 상태, 활성 탭 배경

---

#### 6. stage-text-muted on stage-base

**대비비: 7.21:1** ✓ AA & AAA 통과 (구버전보다 개선됨)

**용도**: 보조 텍스트, 비활성 상태, 타임스탬프

---

#### 7. stage-text-muted on stage-panel

**대비비: 6.49:1** ✓ AA 통과 (AAA 미달)

**용도**: 패널 내 보조 텍스트
**권장**: 14px 이상만 사용

---

#### 8. fire-hot on stage-base

**대비비: 5.72:1** ✓ AA 통과 (AAA 미달)

**용도**: 녹음 중 상태·위험 표시
**권장**: 14px 이상만 사용, 아이콘/배지와 함께 사용 권장(색만으로 상태 전달 금지)

---

#### 9. spring-green on stage-base

**대비비: 13.45:1** ✓ AA & AAA 통과

**용도**: 트래킹 활성/성공 상태 표시

---

### 대비 미달 조합 (사용 금지)

- `stage-text-muted on stage-panel` + 12px 이하 텍스트 → **대비비 6.49:1, AAA 미달 위험**
  → 대안: `stage-text` 또는 14px+ 폰트 크기 확보
- `fire-hot on stage-base` + 12px 이하 텍스트 → **경계 (AA 통과·AAA 미달)**
  → 가능하면 `14px+` 폰트 크기 확보, 색상 단독 의존 금지

---
[구버전 — 참조용, 앰버 다크나이트 팔레트 기준 대비비. 무채색 개정으로 대체됨]

| 색상명 | 16진 코드 | 대비비 (stage-night 기준) |
|---|---|---|
| warm-white (#FFF8F0) | on stage-night (#0D0D14) | 19.5:1 |
| warm-white (#FFF8F0) | on night-blue (#1A1A3E) | 16.5:1 |
| fire-amber (#FF8C2A) | on stage-night (#0D0D14) | 8.9:1 |
| fire-amber (#FF8C2A) | on night-blue (#1A1A3E) | 7.5:1 |
| muted-text (#888899) | on stage-night (#0D0D14) | 6.3:1 (AA만) |
| muted-text (#888899) | on night-blue (#1A1A3E) | 5.3:1 (AA만) |

---

## §3 키보드 네비게이션 패턴

### 3.1 기본 원칙

- **Tab 순서**: DOM 순서 = 시각적 순서 (CSS `order` 사용 시 반드시 tabindex 조정)
- **포커스 가능 요소**: `<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`, `tabindex="0"`
- **비포커스 요소**: `<div>`, `<span>` → ARIA role + tabindex 추가

### 3.2 컴포넌트별 키보드 패턴

#### 탭패널 (RightPanel 4탭)

| 키 | 동작 |
|----|------|
| `Tab` | 다음 활성화 탭으로 이동 |
| `Shift+Tab` | 이전 활성화 탭으로 이동 |
| `←` / `→` | 탭 전환 (좌우 화살표) |
| `Home` | 첫 번째 탭으로 이동 |
| `End` | 마지막 탭으로 이동 |

**패턴**: ARIA Tabs (W3C 권장)
```
<div role="tablist">
  <button role="tab" aria-selected="true" aria-controls="panel-1">Chat</button>
  <button role="tab" aria-selected="false" aria-controls="panel-2">Script</button>
</div>
<div id="panel-1" role="tabpanel" aria-labelledby="tab-1"></div>
```

---

#### 모달 / 설정 페이지

| 키 | 동작 |
|----|------|
| `Tab` | 다음 포커스 가능 요소로 이동 |
| `Shift+Tab` | 이전 포커스 가능 요소로 이동 |
| `Escape` | 모달 닫기 (취소 버튼과 동작 동일) |
| 마지막 요소에서 `Tab` | 첫 번째 포커스 가능 요소로 순환 |

**패턴**: 포커스 트랩 (FocusTrap 컴포넌트 구현)
```tsx
// 첫 포커스 가능 요소와 마지막 포커스 가능 요소 추적
// Tab 누를 때 마지막 요소에 있으면 첫 요소로 포커스 이동
```

---

#### 슬롯 카드 (ParticipantSlot)

| 키 | 동작 |
|----|------|
| `Enter` | 카드 선택 (미디어 상세 보기 등) |
| `Space` | 체크박스 토글 또는 선택 상태 토글 |
| `Tab` | 다음 슬롯으로 이동 |

**패턴**:
```tsx
<div role="button" tabindex="0" aria-label="[참여자명] 슬롯"
     onClick={handleSelect} onKeyDown={handleKeyDown}>
  ...
</div>
```

---

#### 메뉴 / 드롭다운

| 키 | 동작 |
|----|------|
| `Enter` / `Space` | 메뉴 열기/닫기 |
| `↓` / `↑` | 메뉴 항목 포커스 이동 |
| `Escape` | 메뉴 닫기 |
| `Tab` | 메뉴 닫고 다음 요소로 포커스 |

**패턴**: ARIA Menubutton or Combobox

---

#### 채팅 입력

| 키 | 동작 |
|----|------|
| `Enter` | 메시지 전송 |
| `Shift+Enter` | 줄바꿈 추가 |
| `Escape` | 입력 취소 (선택사항) |

**패턴**:
```tsx
const handleKeyDown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};
```

---

### 3.3 마이크/웹캠 토글

| 키 | 동작 |
|----|------|
| `Space` | 마이크 켜기/끄기 토글 |
| `Space` | 웹캠 켜기/끄기 토글 |

**패턴**: `aria-pressed` 속성 사용
```tsx
<button aria-pressed={micOn} aria-label="마이크 켜기/끄기">
  🎤
</button>
```

---

## §4 포커스 관리

### 4.1 포커스 이동 규칙

#### 모달 열릴 때
1. 모달의 첫 번째 포커스 가능 요소로 자동 포커스 이동
2. 예: 입력 필드가 있으면 입력 필드, 아니면 첫 번째 버튼
3. `useEffect(() => firstInput.current?.focus(), [isOpen])`

#### 모달 닫힐 때
- 트리거 버튼으로 포커스 복귀
- 모달 열기 버튼 ref를 저장해두고, 닫을 때 ref.focus()

#### 탭 전환 시
- 새 탭 콘텐츠의 첫 번째 포커스 가능 요소로 포커스 이동
- 또는 탭 버튼 자체에 유지 (권장: 탭 버튼 유지가 접근성 우수)

#### 채팅 새 메시지
- 포커스 이동 없음 (사용자 입력 방해)
- `aria-live="polite"` 리전에만 전달

#### 실시간 알림 (디렉터 노트)
- `aria-live="assertive"` 사용하여 즉시 읽음
- 포커스 이동 없음

---

### 4.2 포커스 인디케이터 스타일

**최소 기준**: 2px outline, 최소 명도 차이 1:3

**권장 스타일**:

```css
:focus-visible {
  outline: 2px solid #FF8C2A;     /* fire-amber */
  outline-offset: 2px;
  border-radius: 2px;
}

/* dark-bg 요소 (stage-base) */
.dark-bg:focus-visible {
  outline-color: #FF8C2A;         /* fire-amber: 8.46:1 대비 충분 */
}

/* light-bg 요소 (stage-text) */
.light-bg:focus-visible {
  outline-color: #0B0B0D;         /* stage-base: 18.00:1 대비 충분 */
}

/* 레거시: 구식 브라우저 대응 */
:focus {
  outline: 2px solid #FF8C2A;
}
```

**금지 사항**:
- ❌ `outline: none;` 전역 적용
- ❌ `box-shadow`만 사용 (시각 장애인 소프트웨어 미인식)
- ❌ 명도 차이 1:3 미만

---

## §5 ARIA 역할, 속성, 라이브 리전

### 5.1 컴포넌트별 ARIA 매핑

#### ChatPanel

```tsx
<div
  role="log"
  aria-live="polite"
  aria-label="채팅"
  aria-relevant="additions"
>
  {messages.map(msg => (
    <div key={msg.id} role="article">
      <strong>{msg.sender}</strong>: {msg.text}
    </div>
  ))}
</div>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `role` | `log` | 시간순으로 쌓이는 메시지 목록 |
| `aria-live` | `polite` | 새 메시지 시에 스크린리더가 읽음 (방해 X) |
| `aria-relevant` | `additions` | 추가된 메시지만 읽음 (삭제 무시) |
| `aria-label` | "채팅" | 목적 명확화 |

---

#### ChatInput

```tsx
<input
  type="textarea"
  aria-label="채팅 메시지 입력"
  aria-multiline="true"
  placeholder="메시지를 입력하세요..."
/>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `aria-label` | "채팅 메시지 입력" | 라벨 없는 입력 요소 설명 |
| `aria-multiline` | `true` | Shift+Enter 줄바꿈 지원 신호 |

---

#### RightPanel 탭 (Tabs 패턴)

```tsx
<div role="tablist" aria-label="설정 탭">
  <button
    role="tab"
    aria-selected={activeTab === 'chat'}
    aria-controls="panel-chat"
    id="tab-chat"
  >
    Chat
  </button>
  <button role="tab" aria-selected={activeTab === 'script'} ...>
    Script
  </button>
</div>

<div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat">
  {/* 채팅 콘텐츠 */}
</div>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `role="tablist"` | — | 탭 컨테이너 |
| `role="tab"` | — | 탭 버튼 (각각) |
| `aria-selected` | `true/false` | 활성 탭 표시 |
| `aria-controls` | 패널 ID | 탭과 패널 연결 |
| `role="tabpanel"` | — | 탭 콘텐츠 영역 |
| `aria-labelledby` | 탭 ID | 패널과 탭 레이블 연결 |

---

#### 마이크/웹캠 토글 버튼

```tsx
<button
  aria-pressed={micOn}
  aria-label={micOn ? "마이크 켜짐, 끄려면 클릭" : "마이크 꺼짐, 켜려면 클릭"}
  className={micOn ? 'active' : ''}
>
  🎤
</button>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `aria-pressed` | `true/false` | 토글 상태 명시 |
| `aria-label` | "마이크 켜기/끄기" | 아이콘만으로는 불충분 |

---

#### 리액션/이모지 팝업

```tsx
<div
  role="dialog"
  aria-label="리액션 선택"
  aria-modal="true"
>
  <ul>
    <li><button>😂</button></li>
    <li><button>❤️</button></li>
  </ul>
</div>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `role="dialog"` | — | 모달 대화상자 |
| `aria-label` | "리액션 선택" | 목적 설명 |
| `aria-modal="true"` | — | 포커스 트랩 신호 |

---

#### 디렉터 노트 알림

```tsx
<div
  role="alert"
  aria-live="assertive"
  aria-label="디렉터 노트"
>
  {directorNote}
</div>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `role="alert"` | — | 긴급 알림 |
| `aria-live="assertive"` | — | 즉시 중단하고 읽음 |
| `aria-label` | "디렉터 노트" | 알림 분류 |

---

#### 로딩 스피너

```tsx
<div
  role="status"
  aria-busy="true"
  aria-label="불러오는 중"
>
  <span>로딩 중...</span>
</div>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `role="status"` | — | 상태 변화 알림 |
| `aria-busy="true"` | — | 작업 진행 중 신호 |
| `aria-label` | "불러오는 중" | 한국어 명확화 |

---

#### 에러 메시지

```tsx
<div
  role="alert"
  aria-live="assertive"
  aria-label="오류"
>
  마이크 연결에 실패했습니다.
</div>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `role="alert"` | — | 중요 오류 알림 |
| `aria-live="assertive"` | — | 즉시 읽음 |

---

#### ParticipantSlot 카드

```tsx
<div
  role="button"
  tabindex="0"
  aria-label={`${participantName} 슬롯, 마이크: ${isMicOn ? '켜짐' : '꺼짐'}`}
  onClick={handleSelect}
  onKeyDown={handleKeyDown}
>
  <canvas aria-hidden="true" /> {/* 아바타 */}
  <div aria-live="polite">
    {participantName}
  </div>
</div>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `role="button"` | — | 클릭 가능한 요소 |
| `tabindex="0"` | — | 키보드 포커스 가능 |
| `aria-label` | 상세 상태 | 참여자 이름 + 상태 한눈에 |
| `aria-hidden="true"` | — | 캔버스(아바타) 숨기기 (다음 장 참조) |

---

### 5.2 WebGL 아바타 캔버스 (aria-hidden 사용)

```tsx
// 올바른 사용법
<div>
  <canvas
    id={`avatar-${userId}`}
    aria-hidden="true"
    role="presentation"
  />
  <div aria-live="polite" aria-label={`${displayName} 아바타`}>
    {displayName}님이 참여 중입니다.
  </div>
</div>

// 또는 aria-label을 캔버스에 직접
<canvas
  aria-label={`${displayName} 아바타 (표정·동작은 음성으로 판단)`}
  role="img"
/>
```

**설명**:
- PixiJS 캔버스는 DOM 요소가 아니므로 ARIA 속성 직접 지원 불가
- `aria-hidden="true"` 추가하여 스크린리더가 빈 캔버스 요소로 취급하지 않도록 함
- 대신 텍스트 `<div>`로 참여자 정보를 제공
- 음성 기반 참여 + 텍스트 채팅으로 완전 대체 가능

---

## §6 모션 감소 (prefers-reduced-motion)

### 6.1 전역 CSS 변수 설정

```css
/* 전역 스타일 */
:root {
  --animation-duration: 0.3s;
  --animation-delay: 0s;
  --animation-fill-mode: forwards;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --animation-duration: 0.01ms;
    --animation-delay: 0s;
  }
  /* 또는 모든 애니메이션 중단 */
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### 6.2 컴포넌트별 모션 정책

#### ChatOverlay 불씨 애니메이션

```css
@keyframes firefly-float {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-100px) scale(0.8);
  }
}

.chat-message {
  animation: firefly-float 1.5s ease-out forwards;
}

@media (prefers-reduced-motion: reduce) {
  .chat-message {
    animation: none;
    opacity: 1;
    /* 페이드만 */
    animation: fade-out 0.3s ease-out forwards;
  }
}

@keyframes fade-out {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
```

---

#### 무대 레이어 Sway/Flicker 애니메이션

```css
@keyframes stage-sway {
  0%, 100% {
    transform: rotateZ(-0.5deg);
    filter: brightness(1);
  }
  50% {
    transform: rotateZ(0.5deg);
    filter: brightness(1.1);
  }
}

.stage-layer {
  animation: stage-sway 3s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .stage-layer {
    animation: none;
    /* opacity만 유지 */
    opacity: 1;
  }
}
```

---

#### 방 입장 트랜지션

```css
@keyframes room-enter {
  0% {
    opacity: 0;
    transform: scale(0.9);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.room-container {
  animation: room-enter 0.5s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .room-container {
    animation: none;
    opacity: 1;
    transform: scale(1);
  }
}
```

---

### 6.3 React 훅으로 감지 및 전달

```tsx
// useReducedMotion.ts
export const useReducedMotion = () => {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mediaQuery.matches);

    const handleChange = (e) => setPrefersReduced(e.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReduced;
};

// 사용 예
export const ChatOverlay = ({ message }) => {
  const prefersReduced = useReducedMotion();

  return (
    <div
      className={prefersReduced ? 'fade-only' : 'firefly-float'}
    >
      {message}
    </div>
  );
};
```

---

## §7 WebGL 아바타 대체 수단

### 7.1 기술적 한계

PixiJS/WebGL 캔버스는 DOM 요소가 아니므로:
- 스크린리더가 내부 콘텐츠 직접 접근 불가
- ARIA 속성 대부분 미지원
- 표정·동작·이모션 정보 전달 어려움

### 7.2 대체 전략

#### 전략 1: 텍스트 기반 상태 표시

```tsx
<div>
  <canvas
    id={`avatar-${userId}`}
    aria-hidden="true"
    role="presentation"
  />
  
  {/* 대체 텍스트 */}
  <div aria-live="polite" aria-label={`${displayName} 상태`}>
    {displayName}님
    {isMicOn && '(마이크 켜짐)'}
    {isWebcamOn && '(웹캠 켜짐)'}
    {emotion && `(${emotion}표정)`}
  </div>
</div>
```

#### 전략 2: 음성 기반 참여 + 채팅

- **음성**: 아바타 표정 대신 음성 톤, 말투로 감정 전달
- **텍스트 채팅**: 의도, 반응을 명시적으로 표현
  - "😂 웃겨요!" → 채팅: "정말 웃겨요!"
  - 아바타 제스처 → 음성 설명 또는 채팅 이모지

#### 전략 3: 캔버스에 aria-label 추가 (제한적)

```tsx
<canvas
  aria-label={`${displayName} 아바타, 현재 ${emotion || '중립'} 표정`}
  role="img"
/>
```

**주의**: 표정/동작이 변할 때마다 aria-label 업데이트 필요 (성능 오버헤드)

### 7.3 테스트 시나리오

1. **스크린리더 사용자**
   - VoiceOver/NVDA로 페이지 탐색
   - 아바타 캔버스 건너뜀
   - 채팅·음성으로만 참여 가능한지 확인

2. **음성 전송 테스트**
   - 마이크 켜기 시 WebRTC 접근 권한 메시지 읽음
   - 참여자 음성 수신·재생 확인

3. **대체 텍스트 정확성**
   - 표정 변화 → 텍스트 즉시 업데이트
   - 모든 참여자 상태 명확

---

## §8 테스트 체크리스트

### 8.1 자동화 테스트

#### axe-core 통합 (PR 게이트)

```bash
# package.json 의존성 추가
npm install --save-dev @axe-core/react vitest-axe
# 또는 Playwright 플러그인
npm install --save-dev @axe-core/playwright
```

**Vitest 설정 (vitest.config.ts)**:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // axe-core 설정 (자동 실행)
  },
});
```

**테스트 작성**:
```ts
import { axe, toHaveNoViolations } from 'jest-axe';
import { render } from '@testing-library/react';
import ChatPanel from './ChatPanel';

expect.extend(toHaveNoViolations);

test('ChatPanel: axe 검증 통과', async () => {
  const { container } = render(<ChatPanel />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

#### ESLint 플러그인

```bash
npm install --save-dev eslint-plugin-jsx-a11y
```

**.eslintrc.json**:
```json
{
  "extends": ["plugin:jsx-a11y/recommended"]
}
```

**검증 항목**:
- ✓ `alt` 텍스트 필수
- ✓ `aria-label` / `aria-labelledby` 필수
- ✓ 포커스 가능 요소의 `role` 명시
- ✓ `click` 핸들러 요소에 `role` 추가

---

### 8.2 수동 검증 체크리스트

#### 키보드 전용 탐색

| 항목 | 체크 |
|------|-----|
| 마우스 없이 모든 기능 접근 가능 | □ |
| Tab으로 모든 버튼·입력·탭 이동 | □ |
| Shift+Tab으로 역방향 이동 | □ |
| 포커스 인디케이터 명확 (2px outline) | □ |
| 모달 포커스 트랩 작동 | □ |
| Escape로 모달 닫김 | □ |
| Enter로 메시지 전송 | □ |
| Shift+Enter로 줄바꿈 | □ |

---

#### 색상 대비 확인

| 항목 | 체크 |
|------|-----|
| stage-text on stage-base (18.00:1) | □ |
| stage-text on stage-panel (16.21:1) | □ |
| fire-amber on stage-base (8.46:1) | □ |
| fire-amber on stage-panel (7.62:1) | □ |
| stage-text-muted on stage-base (7.21:1) | □ |
| stage-text-muted on stage-panel (6.49:1, 14px+만) | □ |
| fire-hot on stage-base (5.72:1, 14px+만) | □ |
| 색상만으로 상태 표현 없음 | □ |

**도구**: WebAIM Contrast Checker, Adobe Color Contrast Analyzer

---

#### 스크린리더 테스트 (VoiceOver + Safari / NVDA + Chrome)

| 항목 | 체크 |
|------|-----|
| 모든 버튼 레이블 읽음 | □ |
| 입력 필드 이름 읽음 | □ |
| 탭 활성 상태 읽음 | □ |
| 채팅 새 메시지 aria-live로 읽음 | □ |
| 에러 메시지 즉시 읽음 (aria-live="assertive") | □ |
| 아바타 캔버스 건너뜀 (aria-hidden) | □ |
| 토글 버튼 상태 읽음 (aria-pressed) | □ |
| 메뉴 구조 이해 가능 | □ |
| 페이지 제목, 헤딩 계층 명확 | □ |

---

#### 모션 감소 테스트

| 항목 | 체크 |
|------|-----|
| 시스템 설정: `prefers-reduced-motion: reduce` 활성화 | □ |
| 불씨 애니메이션: 페이드만 실행 | □ |
| 무대 sway 애니메이션: 멈춤 | □ |
| 방 입장 트랜지션: 즉시 표시 | □ |
| 기능성은 애니메이션과 무관하게 동일 | □ |

---

### 8.3 정기 검증 일정

| 주기 | 담당 | 항목 |
|------|------|------|
| **매 PR** | 자동화 | axe-core 통과, ESLint a11y 규칙 통과 |
| **월 1회** | QA | 키보드 탐색, 포커스 시각화, 색상 대비 |
| **월 1회** | QA | VoiceOver + Safari, NVDA + Chrome |
| **분기 1회** | PM + 개발 | 접근성 정책 검토, 사용자 피드백 |

---

## §9 MUST NOT (금지 사항)

### 9.1 색상 기반 정보 전달

❌ **금지**:
```tsx
// 잘못된 예
<div style={{ color: micOn ? 'green' : 'red' }}>
  마이크
</div>
```

✅ **올바른 예**:
```tsx
<div>
  <span aria-label={micOn ? '마이크 켜짐' : '마이크 꺼짐'}>
    🎤
  </span>
  {micOn ? '켜짐' : '꺼짐'}
</div>
```

---

### 9.2 아이콘 버튼의 aria-label 생략

❌ **금지**:
```tsx
<button>❤️</button>  {/* 스크린리더: "버튼" only */}
```

✅ **올바른 예**:
```tsx
<button aria-label="좋아요 (하트 리액션)">❤️</button>
```

---

### 9.3 전역 outline 제거

❌ **금지**:
```css
* {
  outline: none;
}

button {
  outline: 0;
}
```

✅ **올바른 예**:
```css
:focus-visible {
  outline: 2px solid #FF8C2A;
  outline-offset: 2px;
}
```

---

### 9.4 모달에서 포커스 트랩 누락

❌ **금지**: 모달이 열려 있어도 페이지 뒤의 버튼에 포커스 가능

✅ **올바른 예**:
```tsx
<FocusTrap>
  <Modal>...</Modal>
</FocusTrap>
```

---

### 9.5 동적 콘텐츠 갱신 시 aria-live 누락

❌ **금지**:
```tsx
<div>{newMessage}</div>  {/* 스크린리더 미인식 */}
```

✅ **올바른 예**:
```tsx
<div role="log" aria-live="polite" aria-relevant="additions">
  {newMessage}
</div>
```

---

### 9.6 폼 입력의 명시적 레이블 누락

❌ **금지**:
```tsx
<input placeholder="이름을 입력하세요" />
```

✅ **올바른 예**:
```tsx
<label htmlFor="name">이름</label>
<input id="name" placeholder="예: 홍길동" />

// 또는
<input aria-label="참여자 이름" />
```

---

### 9.7 건너뛰기 링크(Skip Link) 없음

❌ **금지**: 메인 콘텐츠까지 Tab 50회

✅ **올바른 예**:
```tsx
<a href="#main-content" style={{ position: 'absolute', top: '-9999px' }}>
  메인 콘텐츠로 건너뛰기
</a>

<main id="main-content">...</main>
```

---

## §10 참고 자료

### 표준 문서
- [WCAG 2.1 공식 가이드](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA 저작 규칙](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM 색상 대비 검사기](https://webaim.org/resources/contrastchecker/)

### 도구
- **자동화**: axe DevTools, Lighthouse (Chrome DevTools)
- **스크린리더**:
  - macOS: VoiceOver (Control+Option)
  - Windows: NVDA (무료, nvaccess.org)
  - Chrome: ChromeVox
- **모션 감소**: 시스템 설정 → 손쉬운 사용 → 화면 및 시각 → 동작 줄이기

### snack-web 내부 문서
- [[DESIGN-DIRECTION]]: 색상 팔레트 정의
- [[contracts/_INDEX]]: UI 컴포넌트 목록 (ChatPanel, RightPanel 등)

---

## §11 개정 이력

| 날짜 | 버전 | 작성자 | 변경사항 |
|------|------|--------|---------|
| 2026-06-30 | 1.0 | snack-web 팀 | 초안 작성 |

---

**최종 승인**: 대기 중  
**다음 검토**: 2026-07-14
