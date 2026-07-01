---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- DESIGN-DIRECTION §6.x — 인앱 도움말 패널 (슬라이드오버 모달) SSOT -->

# 21. HelpPanel

인앱 도움말 튜토리얼 시스템. 12개 섹션(시작·방입장·아바타·기초·대본·채팅·VGen·DUB·사운드보드·단축키·호스트·문제해결)을 슬라이드오버 모달로 제공. 헤더 ? 버튼 또는 F1 키로 트리거.

**⚠️ 콘텐츠 작성 범위:**
이 파일은 HelpPanel의 **구조·UI 계약서**를 정의한다. 실제 12개 섹션의 한글 본문 작성(각 500~600줄)은 **Phase 2 이후 별도 콘텐츠 작업**으로 진행 예정이다. 섹션 목록과 구조(아코디언 레이아웃, 탭, 인라인 이미지 자리)는 이 SSOT이며, 실제 본문 텍스트는 `docs/help-content/ko/` 디렉터리 또는 i18n JSON에서 관리할 예정이다. 콘텐츠 추적은 다른 클러스터의 `docs/GAP-MATRIX.md`를 참조하라.

---

## Props Interface

```typescript
interface HelpPanelProps {
  /**
   * 패널 열기 상태
   */
  isOpen?: boolean;

  /**
   * 초기 활성 섹션
   * @default 'getting-started'
   */
  defaultSection?: 
    | 'getting-started'
    | 'join-room'
    | 'avatar-setup'
    | 'basics'
    | 'script'
    | 'chat'
    | 'vgen'
    | 'dub'
    | 'soundboard'
    | 'shortcuts'
    | 'host'
    | 'troubleshooting';

  /**
   * 패널 닫기 콜백
   */
  onClose?: () => void;

  /**
   * 에러 콜백
   */
  onError?: (error: Error) => void;

  /**
   * 호스트 모드 여부 (host 섹션 표시)
   */
  isHost?: boolean;

  /**
   * 현재 페이지·모드 (컨텍스트 힌트)
   * 예: 'lobby' → 'join-room' 기본 섹션
   *     'room' → 'basics' 기본 섹션
   */
  currentPage?: string;
}
```

---

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `helpStore` | `isOpen` | ✓ | ✓ | 패널 전개 여부 |
| `helpStore` | `activeSection` | ✓ | ✓ | 현재 활성 섹션 ID |
| `helpStore` | `expandedSubsections` | ✓ | ✓ | 각 섹션 내 하위 아코디언 펼침 상태 |
| `userStore` | `isHost` | ✓ | | 호스트 권한 (host 섹션 표시) |
| `stageStore` | `mode` | ✓ | | 현재 스테이지 모드 ('normal' / 'vgen' / 'dub') |

**읽기 전용:** userStore.isHost, stageStore.mode  
**쓰기:** helpStore.isOpen, helpStore.activeSection, helpStore.expandedSubsections

---

## 12개 도움말 섹션 목록

| 섹션 ID | 제목 | 대상 사용자 | 콘텐츠 | 예상 길이 |
|---------|------|-----------|--------|---------|
| `getting-started` | 🎬 시작하기 | 신규 사용자 | 앱 가입·로그인·프로필 설정 가이드 | 500줄 |
| `join-room` | 🚪 방 입장하기 | 신규 사용자 | 로비 네비게이션·방 선택·방 생성 | 400줄 |
| `avatar-setup` | 🧑 아바타 설정 | 모든 사용자 | 모델 선택·업로드·캘리브레이션 | 600줄 |
| `basics` | 📚 기초 (무대 화면) | 모든 사용자 | 참가자 슬롯·마이크/카메라·기본 조작 | 500줄 |
| `script` | 📖 대본 사용법 | 구성 사용자 | 대본 업로드·큐 동기·진행률 표시 | 400줄 |
| `chat` | 💬 채팅·반응 | 모든 사용자 | 메시지 입력·이모지 반응·차단 기능 | 300줄 |
| `vgen` | 🎬 영상 생성 (VGen) | 보유자 | 프롬프트 작성·생성 요청·다운로드 | 500줄 |
| `dub` | 🎙️ 더빙 (DUB) | 참가자 | 역할 배정·녹음·합성·내보내기 | 500줄 |
| `soundboard` | 🔊 사운드보드 | 호스트 | 효과음 종류·재생·커스텀 | 250줄 |
| `shortcuts` | ⌨️ 단축키 | 고급 사용자 | 키 바인드·필살기·PTT·포커스 토글 | 400줄 |
| `host` | 👑 호스트 권한 | 호스트만 | 참가자 관리·강퇴·권한 양도·녹화 관리 | 600줄 |
| `troubleshooting` | 🔧 문제해결 | 모든 사용자 | 일반 에러·네트워크·오디오·렌더링 문제 | 500줄 |

**총 콘텐츠:** ~5,350줄 (스크롤 최적화: 섹션별 500~600줄, 하위 탭으로 분산)

---

## 트리거 메커니즘

### 열기 방식 3가지

```typescript
// 1. 헤더 ? 버튼 (우상단)
<button onClick={() => helpStore.setIsOpen(true)} className="help-button">
  ?
</button>

// 2. F1 키 (전역 단축키)
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'F1') {
      e.preventDefault();
      helpStore.setIsOpen(!helpStore.isOpen);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);

// 3. /help URL 접근 (선택)
// /room/:id?help=vgen → VGen 섹션 자동 열기
```

### 컨텍스트 힌트 (currentPage 기반 자동 섹션)

```typescript
// 로비 → "join-room" 기본 설정
// 방 입장 전 GreenRoom → "avatar-setup" 기본 설정
// 방 입장 후 RoomView → "basics" 기본 설정
// RoomView + stageMode='vgen' → "vgen" 기본 설정
// RoomView + stageMode='dub' → "dub" 기본 설정

const defaultSectionMap: Record<string, HelpPanelProps['defaultSection']> = {
  'lobby': 'join-room',
  'greenroom': 'avatar-setup',
  'room': 'basics',
  'room-vgen': 'vgen',
  'room-dub': 'dub',
};

const initialSection = defaultSectionMap[currentPage] || defaultSection || 'getting-started';
```

---

## Store 정의 (helpStore)

```typescript
// src/stores/helpStore.ts (신규)

interface HelpState {
  // 패널 상태
  isOpen: boolean;
  activeSection: string;
  expandedSubsections: Record<string, boolean>;  // 섹션 내 하위 아코디언
  
  // 액션
  setIsOpen(open: boolean): void;
  setActiveSection(section: string): void;
  toggleSubsection(sectionId: string, subsectionId: string): void;
  
  // 도움말 사용 히스토리 (선택)
  viewedSections: Record<string, timestamp>;  // 사용자가 본 섹션 추적
  markSectionViewed(section: string): void;
}

export const useHelpStore = create<HelpState>((set) => ({
  isOpen: false,
  activeSection: 'getting-started',
  expandedSubsections: {},
  viewedSections: {},
  
  setIsOpen: (open) => set({ isOpen: open }),
  setActiveSection: (section) => set({ activeSection: section }),
  toggleSubsection: (sectionId, subsectionId) =>
    set((state) => ({
      expandedSubsections: {
        ...state.expandedSubsections,
        [`${sectionId}-${subsectionId}`]: !state.expandedSubsections[`${sectionId}-${subsectionId}`],
      },
    })),
  markSectionViewed: (section) =>
    set((state) => ({
      viewedSections: { ...state.viewedSections, [section]: Date.now() },
    })),
}));
```

---

## 섹션별 콘텐츠 구조

### 예시: `getting-started` 섹션

```markdown
# 🎬 시작하기

## 1단계: 가입
- 이메일 입력
- 비밀번호 설정
- 이메일 인증 (링크 클릭)

## 2단계: 로그인
- 정보 입력
- "로그인" 버튼 클릭
- 자동 리다이렉트

## 3단계: 프로필
- 사용자명 설정
- 프로필 사진 업로드
- 언어 선택 (한국어/일본어/영어)

💡 팁: 언어는 나중에 [⚙️ 설정] 탭에서 변경 가능합니다.
```

### 예시: `vgen` 섹션 (하위 탭)

```
[프롬프트 작성] [생성 요청] [다운로드] [품질 설정]

### 📝 프롬프트 작성
"무대 배경은 미래도시, 주인공은 파란색 옷 입은..."

### ⚡ 생성 요청
1. [생성▶] 버튼 클릭
2. 크레딧 차감 (1초 = 1 credit)
3. 생성 중... (예상 2분)
4. 완료 시 다운로드 가능

### 📥 다운로드
- [MP4로 다운로드]
- [클립으로 저장]
- [SNS 공유]
```

---

## 컴포넌트 관계 (ASCII)

```
[HelpPanel] (슬라이드오버 모달, width: 32%, right: 0)
  │
  ├─ [Header]
  │  ├─ [섹션 제목: "🎬 시작하기"]
  │  └─ [× 닫기] (onClick: helpStore.setIsOpen(false))
  │
  ├─ [탭/섹션 네비게이션]
  │  ├─ [버튼: 시작하기] (onClick → activeSection='getting-started')
  │  ├─ [버튼: 방 입장]
  │  ├─ [버튼: 아바타]
  │  ├─ [버튼: 기초]
  │  ├─ [버튼: 대본]
  │  ├─ [버튼: 채팅]
  │  ├─ [버튼: VGen]
  │  ├─ [버튼: DUB]
  │  ├─ [버튼: 사운드보드]
  │  ├─ [버튼: 단축키]
  │  ├─ [버튼: 호스트] ← isHost=true일 때만 표시
  │  └─ [버튼: 문제해결]
  │
  ├─ [콘텐츠 영역] (flex: 1, overflow-y: auto)
  │  │
  │  ├─ activeSection='getting-started' → [GettingStartedSection]
  │  │  ├─ [아코디언 #1: 가입]
  │  │  │  └─ 콘텐츠 + 스크린샷
  │  │  ├─ [아코디언 #2: 로그인]
  │  │  └─ [아코디언 #3: 프로필]
  │  │
  │  ├─ activeSection='vgen' → [VgenHelpSection]
  │  │  ├─ [탭: 프롬프트]
  │  │  ├─ [탭: 생성]
  │  │  ├─ [탭: 다운로드]
  │  │  └─ [탭: 품질]
  │  │
  │  └─ ... (다른 섹션들)
  │
  └─ [Footer]
     ├─ [개선 피드백] (G-114로 연동)
     └─ [F1로 닫기] (단축키 안내)
```

---

## 금지 사항 (MUST NOT)

- ❌ **도움말 섹션을 RoomView·LobbyPage 내에 직접 포함** — HelpPanel 슬라이드오버만 사용 (방 이탈 방지)
- ❌ **모든 사용자에게 'host' 섹션 표시** — `isHost=true` 조건부 렌더만 허용
- ❌ **도움말 콘텐츠를 localStorage만으로 로드** — 콘텐츠는 i18n 파일 또는 Supabase에서 fetch (다국어 지원)
- ❌ **도움말 패널을 닫을 때 섹션 상태 초기화** — activeSection 및 expandedSubsections 보존 (사용자 경험)

---

## DataChannel 의존성

**없음** — HelpPanel은 순수 UI 안내. 채팅·VGen·DUB 등의 기능은 각각의 컴포넌트에서 담당.

---

## 관련 문서

- `DESIGN-DIRECTION.md` — UI 레이아웃 가이드
- `specs/FeedbackChannel.md` (G-114) — 도움말 피드백 통합 링크
- `contracts/_INDEX.md` — 컴포넌트 등록
- `FEATURE-SPEC.md` — G-113 인앱 도움말 명세

---

## 한줄정리

HelpPanel은 헤더 ? 버튼 또는 F1 키로 열리는 슬라이드오버 모달로, 12개 섹션(시작·입장·아바타·기초·대본·채팅·VGen·DUB·사운드보드·단축키·호스트·문제해결)을 제공하며, currentPage 컨텍스트에 따라 기본 섹션을 자동 선택하고, 호스트 권한에 따라 호스트 섹션을 조건부 표시하며, helpStore로 섹션 상태를 관리한다.
