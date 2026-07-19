# Descript — UX 분석 노트

**Product**: Descript (Collaborative Video Editing)
**URL**: https://www.descript.com/
**Researched At**: 2026-07-19

---

## 핵심 인터랙션 패턴

### 1. Transcript 기반 편집
- 텍스트 삭제 = 해당 구간 미디어 자동 삭제 (문자열과 영상/음성의 1:1 매핑)
- 스크립트 패널에서 텍스트 수정하면 타임라인의 미디어도 즉시 갱신
- **출처**: https://www.descript.com/video-editing

### 2. Scenes(세그먼트) 구조
- 타임라인 위에 **시각적 세그먼트**로 표현 (썸네일 + 경계선)
- 스크립트 패널: 경계 표시 + 썸네일 미리보기
- 타임라인: 각 씬이 자체 레이어 스택 포함 (비디오·오디오·이펙트)
- Split button으로 플레이헤드 위치에서 즉시 분할
- `/` 입력으로 스크립트에서 씬 자동 추가
- **출처**: https://help.descript.com/hc/en-us/articles/36587650567565-The-Split-button-how-to-split-scenes-and-layers-directly-in-the-timeline

### 3. 실시간 협업
- **Google Docs 스타일**: 여러 사용자 동시 편집, 변경사항 500ms 이하 동기화
- **타임스탐프 코멘트**: 스크립트/타임라인의 특정 지점에 시간 기반 코멘트 핀
- **@mentions**: 코멘트에 팀원 언급으로 알림
- **Permission levels**: Edit / Comment / View로 세분화
- Basic 멤버는 무제한 초대 가능 (비용 = Editor 시트만)
- **출처**: https://www.descript.com/teams, https://www.descript.com/tools/video-collaboration

### 4. Split/Merge 작업
- **Split 버튼**: 플레이헤드에서 현재 씬 분할 (모든 레이어 영향) 또는 특정 레이어만 분할
- **우클릭 → Delete boundary**: 씬과 이전 씬 병합
- 각 씬을 독립적인 "구간"으로 취급 (편집·삭제·재정렬 용이)
- **출처**: https://help.descript.com/hc/en-us/articles/10248940561037-Splitting-vs-creating-a-new-scene

---

## 훔칠 패턴 (ChatterBox DUB-TRIM 적용 안)

### 1. **스크립트-타임라인 이중 표현**
```
좌패널 세그먼트 카드 (텍스트 기반) + 센터 영상 플레이어 (시간 기반)
→ 카드에서 텍스트 수정 → 플레이어 타임라인에 즉시 반영
  예) 세그먼트 카드 "안녕하세요" 삭제 → 그 구간 영상 자동 제거
```

### 2. **한 클릭 분할 + 드래그 병합**
```
세그먼트 카드 간 경계선을 드래그해 새 세그먼트 추가 (스크립트의 "/" 같은 효과)
또는 우클릭 → "여기서 분할" 메뉴 (플레이어의 현재 시간 기준)
```

### 3. **@mentions 코멘트 → 배역 배정 초대**
```
세그먼트 카드에 "@배우이름 여기 담당해줘" → 그 배우에게 알림 + 실시간 표시
(코멘트 스레드 기능으로 토론 → 최종 배역 확정)
```

---

## 버릴 것 / 함정

- **CRDT 오버킬**: Descript는 WebSocket 기반 last-write-wins (CRDT 아님). ChatterBox는 세그먼트 단위 soft-lock (세그먼트 전체 하나의 conflict unit)으로 충분.
- **레이어 복잡성**: Descript는 비디오/오디오/이펙트 멀티레이어. DUB-TRIM은 세그먼트만 — 레이어 추상화는 불필요.
- **자막 생성 미러링 금지**: Descript처럼 STT 자동 동기화는 하지 않기 (STT는 이미 Rask/ElevenLabs에서 생성됨).

---

## 출처 목록

- [Descript Collaboration - Official](https://www.descript.com/tools/video-collaboration)
- [Descript Teams](https://www.descript.com/teams)
- [Split Button Help](https://help.descript.com/hc/en-us/articles/36587650567565-The-Split-button-how-to-split-scenes-and-layers-directly-in-the-timeline)
- [Scenes Overview Help](https://help.descript.com/hc/en-us/articles/10248939749517-Scenes-overview) [403 - 확인 불가]
