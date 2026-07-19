# Notion / Linear 실시간 Presence — UX 분석 노트

**Product**: Notion (Block-based) & Linear (Issue Tracking)
**URL**: https://www.notion.com/ / https://linear.app/
**Researched At**: 2026-07-19

---

## 핵심 인터랙션 패턴

### 1. Notion: 아바타 기반 Presence 표시
- **실시간 커서 추적**: 각 사용자의 **색상 있는 커서**가 블록 옆에 표시
- **프로필 아바타**: "누가 보고 있는가" 표시 (사용자 이름 + 아바타)
- **클릭으로 점프**: 팀원 아바타 클릭 → 그 사람이 보고 있는 블록으로 페이지 자동 스크롤
- **블록 단위 충돌 처리**: 같은 블록에 여러 사용자 동시 편집 가능 → **마지막 쓰기 우선**(CRDT 아님, 필드 단위 최신 값 반영)
- **실시간 동기화**: 편집/코멘트/제안이 **<500ms 이내** 모든 클라이언트에 반영
- **출처**: https://www.notion.com/help/collaborate-within-a-workspace

### 2. 동시 편집 시 충돌 해결
- **Last-Write-Wins (LWW)**: 같은 필드를 여러 사용자가 수정하면 마지막 저장본만 반영
- **트랜잭션 기반**: 모든 클라이언트 액션 = 서버에 트랜잭션으로 전송 (레코드 단위)
- **블록 기반 충돌 단위**: 캐릭터 단위가 아니라 **블록 프로퍼티 단위** (예: 텍스트 필드, 체크박스는 각각 하나의 atomic 단위)
- **출처**: https://hld.handbook.academy/curriculum/case-studies/collaborative-editing/

### 3. 인라인 코멘트 + @mentions
- 각 블록에 **스레드형 코멘트** 첨부 가능
- **@이름** 입력 → 팀원 멘션 → 알림 발송
- 코멘트는 **블록에 고정** (시간축이 아닌 컨텐츠축)
- **출처**: https://www.notion.com/help/collaborate-within-a-workspace

### 4. Linear: Issue 설명 필드의 협업
- Linear는 Issue description을 **Tiptap 에디터**(CRDT 기반)로 관리
- Issue title/description 별도 충돌 처리
- Presence: 누가 Issue를 보고 있는지 표시 (아바타 + 색상 커서)
- **권한 분리**: Edit / Comment / View (Issue 단위)
- **출처**: https://linear.app/ [공식 사이트, 상세 미확인]

---

## 훔칠 패턴 (ChatterBox DUB-TRIM 적용 안)

### 1. **세그먼트 카드 위 배우 배지 (Notion 아바타 패턴)**
```
각 세그먼트 카드 상단 우측:
┌─────────────────────────────┐
│ "안녕하세요"        [👤김배우] │  ← 현재 보고 있는 배우 아바타
│ 시간: 00:15 - 00:18         │
│ 길이: 3.2s                   │
└─────────────────────────────┘

아바타 클릭 → 해당 배우 담당 세그먼트로 스크롤
```

### 2. **소프트락 + 편집 중 배지**
```
배우A가 이 세그먼트를 편집 중:
┌─────────────────────────────┐
│ "안녕하세요"                  │
│ ⚠️ 배우A 편집 중...          │  ← 노란색 배지
│ (5초 후 자동 해제)           │
└─────────────────────────────┘

배우B는 읽기는 가능, 수정은 차단 (toast: "배우A가 편집 중입니다")
```

### 3. **코멘트 스레드 (세그먼트 단위)**
```
세그먼트 카드에 코멘트 버튼 → 스레드 열기
"이 부분 톤이 어색한데 재녹음 부탁" → @배우A 멘션
→ 배우A에게 알림 → 댓글로 응답 ("좋아, 다시 할게")
코멘트 해결 시 "✓ Resolved" 처리
```

### 4. **Last-Write-Wins를 버튼 승인으로 보강**
```
배우 A, B가 동시에 같은 세그먼트 텍스트 수정:
A: "안녕하세요" → "안녕"
B: "안녕하세요" → "안녕하세요!"
→ 둘 다 제출하면 B의 마지막 값 반영
→ UI: "A와 B가 동시 편집했습니다. 어느 버전으로 할까요?" (선택지 제시)
```

---

## 버릴 것 / 함정

- **CRDT 오버엔지니어링**: Notion은 LWW + 트랜잭션(Last-Write-Wins의 간단한 구현). CRDT는 구글 문서(OT) 수준의 초미세 캐릭터 단위 동시 편집이 필요할 때만. → DUB-TRIM은 세그먼트(문장 단위) 충돌만 처리하므로 LWW 충분.
- **"누가 편집 중" 락의 시간 설정**: Notion은 실시간이지만, 우리는 5~10초 timeout으로 충분 (네트워크 지연 시 "편집 중" 배지가 僵化되는 걸 방지). 명시적 "편집 해제" 버튼도 제공.
- **코멘트 해결(Resolved) 기능은 P2**: MVP는 코멘트 스레드만 (좋아요, @mentions까지만).
- **권한 분리 → 이탈**: "View only" 사용자를 차단할 필요 있나? → DUB-TRIM은 같은 방의 멤버 전원이 보고 편집할 수 있는 게 기본이라고 가정 (퍼미션 = 다른 문제).

---

## 출처 목록

- [Notion Help: Collaborate within Workspace](https://www.notion.com/help/collaborate-within-a-workspace)
- [Design Collaborative Editing (Google Docs / Figma / Notion) - HLD Handbook](https://hld.handbook.academy/curriculum/case-studies/collaborative-editing/)
- [Real-time Collaboration Overview - CKEditor 5](https://ckeditor.com/docs/ckeditor5/latest/features/collaboration/real-time-collaboration/real-time-collaboration.html)
- [Build Your Own Collaborative Realtime Notion - Medium](https://medium.com/@thomasbrillion/build-your-own-collaborative-realtime-notion-11c361fb2cbe)
- [Linear App](https://linear.app/) [상세 미확인 - 공식 사이트]
