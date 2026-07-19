# DUB-TRIM 설계 — UX 레퍼런스 롤업

**Research Conducted**: 2026-07-19
**Scope**: 6개 경쟁사 제품 + 협업 도구 분석
**Output Format**: 4축 권고 (BLUF) + 설계 구체안

---

## 💡 요약 (BLUF)

DUB-TRIM은 **세그먼트 카드 리스트(좌) + 플레이어(센터) + 배우 트랙(우)**의 3구간 레이아웃으로, CapCut/YouTube의 "자막 기반 선택 + 드래그 핸들" 트림 UI와 Notion/Linear의 "아바타 커서 + 소프트락" 협업 패턴, Smule의 "색상 파트 버튼" 놀이화를 조합한다.

---

## 1️⃣ 트림 UI (구간 선택)

### 권고 A: 자막 기반 선택 + 드래그 핸들 조합 (CapCut × YouTube)
```
UX 플로우:
1. 좌패널: STT 세그먼트 카드 리스트 (텍스트 보임)
2. 카드 클릭 → 센터 플레이어의 해당 구간이 **노란색 박스**로 하이라이트
3. 플레이어 타임라인에서 드래그 핸들로 미세 조정 (CapCut처럼)
   - 좌측 흰색 핸들: 시작점 드래그
   - 우측 흰색 핸들: 끝점 드래그
4. 스냅 기능 (선택사항): 인접 세그먼트와 자동 정렬
```

**근거**:
- **CapCut**: 흰색 핸들 드래그는 직관적 (3년 사용자 친숙도 높음)
- **YouTube Clip Creator**: 자막 선택 → 타임라인 하이라이트는 오류 방지 (실수로 다른 구간이 잘리는 오류 감소)
- **해당 문서**: [`capcut-trim/UX-NOTES.md`](../design/product-ui-references/capcut-trim/UX-NOTES.md) § 1,2

### 권고 B: "글자 길이" 인디케이터 + 스냅 토글
```
각 세그먼트 카드:
┌─────────────────────────────┐
│ "안녕하세요"                  │
│ 00:15 - 00:18 (3.2s)        │
│ 문자 7개 (권장 최대: 30)    │  ← 길이 경고
│ [🔗 스냅 OFF] [재생]        │
└─────────────────────────────┘

스냅 ON: 세그먼트 끝이 인접 시작점에 자동 정렬 (DAW 방식)
스냅 OFF: 자유 수정 (배우가 "3.5초 필요" → 직접 드래그)
```

**근거**:
- **ElevenLabs Dubbing Studio**: Fixed vs Dynamic 토글로 유연성 제공
- **CapCut**: "트림하다가 다른 클립 건드려" 실수 방지 → 스냅 필수
- **해당 문서**: [`elevenlabs-dubbing/UX-NOTES.md`](../design/product-ui-references/elevenlabs-dubbing/UX-NOTES.md) § 2, [`capcut-trim/UX-NOTES.md`](../design/product-ui-references/capcut-trim/UX-NOTES.md) § 1

---

## 2️⃣ 세그먼트 편집 (텍스트 + 길이 조정)

### 권고 A: 이중 컬럼 (원본 vs 배우 대사)
```
세그먼트 카드 확장 패널:
┌────────────────────────────────────┐
│ 원본 (읽기)     │ 배우 대사 (수정)  │
├────────────────────────────────────┤
│ 안녕하세요      │ [안녕하세요    ]  │  ← 수정 가능
│ (STT 자동)      │ 3.2s / 3.2s    │  ← 길이 매칭
│ 7글자          │ 동기화 ✓       │
└────────────────────────────────────┘
```

**근거**:
- **Rask AI**: 원본 vs 번역 이중 컬럼 UI는 검증 심리 향상
- **Descript**: 스크립트(좌) vs 타임라인(우) 이원 표현으로 실수 감소
- **체계**: STT는 자동 잠금, 배우 대사만 수정 가능 (권한 분리)
- **해당 문서**: [`rask/UX-NOTES.md`](../design/product-ui-references/rask/UX-NOTES.md) § 1, [`descript/UX-NOTES.md`](../design/product-ui-references/descript/UX-NOTES.md) § 1

### 권고 B: "길이 동기화" 배지 + 경고
```
세그먼트별 상태 표시:
┌─────────────────────────────┐
│ "안녕하세요"                  │
│ ✓ 길이 일치 (3.2s = 3.2s)  │  ← 녹색 ✓
│ (또는 ⚠️ 차이: +0.3s)       │  ← 노란색 경고
└─────────────────────────────┘

+0.3초 이상 차이 → 배우에게 "이 부분 0.3초 더 필요해" 알림
```

**근거**:
- **ElevenLabs Dubbing Studio**: Fixed/Dynamic 토글과 유사
- **Rask AI**: "번역이 원본보다 김 → 텍스트 단축" 직관적 흐름
- **우리 케이스**: STT 구간이 고정이므로, 배우는 그 길이에 "맞혀야 함" (강제성은 낮지만 시각 신호로 유도)
- **해당 문서**: [`elevenlabs-dubbing/UX-NOTES.md`](../design/product-ui-references/elevenlabs-dubbing/UX-NOTES.md) § 2, [`rask/UX-NOTES.md`](../design/product-ui-references/rask/UX-NOTES.md) § 2

---

## 3️⃣ 소프트락 + 실시간 Presence 표시

### 권고 A: 아바타 커서 + 5초 타임아웃 소프트락 (Notion 패턴)
```
세그먼트 카드 우측 상단:
┌─────────────────────────────┐
│ "안녕하세요"        [👤김배우]│  ← 현재 보고 있는 아바타
│ (클릭 → 그 배우 세그먼트로 점프)
│                             │
│ ⚠️ 김배우 편집 중...       │  ← 노란색 배지 (≤5초)
│ (변경 금지, 타임아웃 후 해제)
└─────────────────────────────┘

LWW (Last-Write-Wins): 동시 수정 시 마지막 저장본만 반영
→ UI: "변경이 덮어씌워졌습니다" 토스트 + "되돌리기" 링크
```

**근거**:
- **Notion**: "누가 지금 어디 보고 있는가"를 아바타 색상 커서로 시각화 (awareness ↑)
- **Linear / CKEditor**: 실시간 presence는 WebSocket 기반 (ChatPanel에서 이미 구현됨)
- **소프트락 timeout**: CRDT는 오버킬 → 세그먼트 단위 5초 lock + LWW로 충분
- **해당 문서**: [`presence-notion-linear/UX-NOTES.md`](../design/product-ui-references/presence-notion-linear/UX-NOTES.md) § 1,2

### 권고 B: 코멘트 스레드 (세그먼트 단위 토론)
```
세그먼트 카드에 [💬] 코멘트 버튼:
┌─────────────────────────────┐
│ "안녕하세요"         [👤김배우]│
│ [💬 2] ← 스레드 열기         │
│                             │
│ └─ 배우B: "톤이 어색한데?  │
│    재녹음 부탁"             │
│    └─ @김배우: "좋아, 해줄게│
└─────────────────────────────┘

코멘트 스레드 기능:
- @mentions로 팀원 알림
- "✓ 해결" 버튼으로 스레드 종료 (P2 defer)
```

**근거**:
- **Notion / Descript**: @mentions 코멘트는 텍스트 기반 협업의 표준 (low-friction)
- **시간축 vs 컨텐츠축**: 코멘트는 세그먼트 블록에 고정 (Notion처럼), 실시간 chat과 분리
- **해당 문서**: [`descript/UX-NOTES.md`](../design/product-ui-references/descript/UX-NOTES.md) § 3, [`presence-notion-linear/UX-NOTES.md`](../design/product-ui-references/presence-notion-linear/UX-NOTES.md) § 3

---

## 4️⃣ 역할 배정 (배우 할당)

### 권고 A: 색상 파트 버튼 (Smule 놀이화)
```
세그먼트 카드 우측에 아바타 버튼 5개 (예정 배우):
┌─────────────────────────────┐
│ "안녕하세요"                  │
│ [👤] [👤] [👤] [👤] [➕]  │  ← 클릭 1회 = 배정 완료
│ 김  이  박  최  초대...      │
│                             │
│ 선택됨: 김배우 ✓             │
│ (색상: 파란색 배경으로 변함) │
└─────────────────────────────┘

색상 코드:
- 배우A 세그먼트: 파란색
- 배우B 세그먼트: 빨간색
- 배우C 세그먼트: 녹색
→ 스크롤해도 "누가 어디 부르는지" 시각적으로 파악
```

**근거**:
- **Smule**: "파트 버튼" 클릭으로 배정 = 한 번의 제스처 (드롭다운보다 빠름)
- **Descript**: @mentions 코멘트로 "너 여기 해줄래?" 초대 (기존 방식)
- **혼합 전략**: 버튼(빠른 배정) + 코멘트(사회적 합의) 병행
- **해당 문서**: [`smule-duet/UX-NOTES.md`](../design/product-ui-references/smule-duet/UX-NOTES.md) § 2, [`descript/UX-NOTES.md`](../design/product-ui-references/descript/UX-NOTES.md) § 3

### 권고 B: 진행도 + 상태 뱃지 (소셜 신호)
```
방 헤더에 배우별 진행도:
┌──────────────────────────────────┐
│ 더빙 세션 "침묵의 괴물"           │
│ ━━━━━━━━━━━ 2/4 완료            │
│                                  │
│ [✓ 김배우] [✓ 이배우]           │  ← 완료 (체크)
│ [⏳ 박배우] [❌ 최배우]          │  ← 대기 / 거절
│                                  │
│ 전체 세그먼트: 20개             │
│ 김배우: 7개 완료 ✓              │
└──────────────────────────────────┘

상태:
- ✓: 녹음 완료 + 승인
- ⏳: 초대됨 (응답 대기)
- ❌: 거절 / 불가 (대체 배우 필요)
- 미배정: 누구 할 거야?
```

**근거**:
- **Smule**: "개수 증가 = 인기도" 심리학 (우리는 "방 진행도"로 변형)
- **GitHub / Linear**: 프로그레스 바 + 체크마크 = 명확한 상태 전달
- **협업 동기 부여**: "3명 중 1명 안 했네 → 재촉" 시각적 신호
- **해당 문서**: [`smule-duet/UX-NOTES.md`](../design/product-ui-references/smule-duet/UX-NOTES.md) § 4, [`presence-notion-linear/UX-NOTES.md`](../design/product-ui-references/presence-notion-linear/UX-NOTES.md) § 4

---

## 📋 설계 구체안 요약

| 축 | 우선순위 | 구체 방안 | 근거 |
|---|---------|---------|------|
| **트림 UI** | P0 | 자막 선택 + 드래그 핸들 + 스냅 토글 | CapCut(직관) × YouTube(오류방지) |
| **세그먼트 편집** | P0 | 원본(좌) vs 배우대사(우) 이중 컬럼 + 길이 배지 | Rask(검증심) × Descript(무오류) |
| **Presence** | P0 | 아바타 커서 + 5s 소프트락(LWW) + 코멘트 스레드 | Notion(awareness) × Descript(@mentions) |
| **역할 배정** | P1 | 색상 파트 버튼(빠름) + 진행도 뱃지(사회신호) | Smule(놀이화) × GitHub(상태) |

---

## 참고 문서

- [`../design/product-ui-references/descript/UX-NOTES.md`](../design/product-ui-references/descript/UX-NOTES.md) — Transcript 기반 편집 + 협업
- [`../design/product-ui-references/elevenlabs-dubbing/UX-NOTES.md`](../design/product-ui-references/elevenlabs-dubbing/UX-NOTES.md) — 타임라인 + 클립 편집 + 스피커 트랙
- [`../design/product-ui-references/rask/UX-NOTES.md`](../design/product-ui-references/rask/UX-NOTES.md) — 원본 vs 번역 이중 컬럼 + 팀 검수
- [`../design/product-ui-references/capcut-trim/UX-NOTES.md`](../design/product-ui-references/capcut-trim/UX-NOTES.md) — 드래그 핸들 트림 + YouTube 자막 선택
- [`../design/product-ui-references/presence-notion-linear/UX-NOTES.md`](../design/product-ui-references/presence-notion-linear/UX-NOTES.md) — 실시간 presence + 소프트락 + 코멘트
- [`../design/product-ui-references/smule-duet/UX-NOTES.md`](../design/product-ui-references/smule-duet/UX-NOTES.md) — 색상 파트 버튼 + 진행도 뱃지
