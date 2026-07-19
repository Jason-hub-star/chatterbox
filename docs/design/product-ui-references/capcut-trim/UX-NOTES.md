# CapCut 모바일 트림 + YouTube 클립 만들기 — UX 분석 노트

**Product**: CapCut (Mobile/Desktop) + YouTube Clip Creator
**URL**: https://www.capcut.com/ / https://support.google.com/youtube/answer/15824265
**Researched At**: 2026-07-19

---

## 핵심 인터랙션 패턴

### 1. CapCut: 드래그 핸들로 트림
- **흰색 핸들** (좌/우 끝): 각 클립의 경계에 표시
- **드래그 → 길이 조정**: 안쪽으로 드래그하면 트림, 바깥쪽으로 드래그하면 복구 가능
- **멀티트랙 타임라인**: 비디오·오디오·텍스트가 수평 레인으로 배치
- **플레이헤드**: 중앙 세로줄이 현재 시간 표시
- **Split**: 플레이헤드에서 클립 분할 (Ctrl/Cmd + Click)
- **출처**: https://www.capeditcut.com/capcut-timeline-editing/ / https://pexo.ai/blog/capcut-tutorial-9296

### 2. YouTube 클립 만들기: 3가지 선택 방식
- **방식 1 - 자막 선택**: 자막에서 원하는 텍스트 구간 선택 → "Confirm selection" 버튼 → 타임라인에 하이라이트
- **방식 2 - 단어 마커**: 자막에서 시작 단어 클릭 "Set as start" → 끝 단어 클릭 "Set as end"
- **방식 3 - 타임코드 직접 입력**: 시작 시간/끝 시간 입력 또는 **드래그 핸들로 타임라인에서 직접 조정**
- **AI 제안**: 팟캐스트 콘텐츠에서 주요 장면 자동 제안 (영어 전용, 선별 지역)
- **미리보기**: "Upload dialogue"에서 클립 미리보기 가능
- **출처**: https://support.google.com/youtube/answer/15824265?hl=en-GB

### 3. CapCut 타임라인 구조
- **3개 영역**:
  - 상단: 비디오 미리보기 창
  - 중단: 멀티트랙 타임라인 (수평 클립 배열)
  - 하단: 도구 모음 (선택 객체에 따라 변함)
- **트랙 관리**: Hide / Lock / Mute 토글로 멀티트랙 정리
- 클립 선택 → 하단 도구 활성화
- **출처**: https://www.capeditcut.com/capcut-timeline-editing/ / https://filmora.wondershare.com/advanced-video-editing/capcut-timeline.html

### 4. YouTube 클립 후속 옵션
- **Intro/Outro 추가**: 기존 영상 클립을 클립 앞뒤에 연결
- **자동 자막**: 클립 생성 시 STT 자막 자동 포함
- **발행 미리보기**: Draft 상태에서 발행 전 확인
- **출처**: https://support.google.com/youtube/answer/15824265?hl=en-GB

---

## 훔칠 패턴 (ChatterBox DUB-TRIM 적용 안)

### 1. **자막 기반 세그먼트 선택 (YouTube 패턴)**
```
좌패널: STT 자막 텍스트 리스트
클릭 → 자막 구간 하이라이트
센터 플레이어: 선택 구간이 타임라인에 노란색/초록색 박스로 표시
결과: "이 대사 세그먼트 선택" → 드래그 핸들로 미세 조정 가능
```

### 2. **드래그 핸들 + 마커 조합**
```
우측 끝 흰색 핸들: 드래그해 세그먼트 끝 조정
좌측 끝 흰색 핸들: 드래그해 세그먼트 시작 조정
가운데 플레이헤드: 더블클릭 → "여기서 분할" (CapCut Split처럼)
```

### 3. **AI 제안 배지 + 스냅**
```
YouTube처럼 "주요 장면" AI 제안 표시
배우 음성이 높을 때 자동 스냅 (타이밍 정렬)
예: "높은 에너지 구간" 검출 → 세그먼트 후보 제안
```

---

## 버릴 것 / 함정

- **멀티 클립/레이어 복잡성**: CapCut은 비디오·오디오·텍스트 멀티레이어. DUB-TRIM은 **세그먼트(STT 구간) 하나가 conflict unit** — 오디오 트랙 여러 개는 불필요.
- **"드래그 이동"은 실수 유발**: CapCut/YouTube 모두 드래그 핸들로 길이만 조정하지, 클립을 좌우로 옮기진 않음. ChatterBox도 **길이 조정만** (시간 축 이동은 별도 작업).
- **스냅 기능의 양날검**: 자막 기반 스냅은 좋지만, 배우가 구간을 1.2초 연장하고 싶을 때 스냅이 방해 가능. → 토글 가능하게.
- **오디오 DAW 스타일 레인은 과한가**: CapCut처럼 "비디오 / 오디오 1 / 오디오 2 / 자막" 분리는 복잡. DUB-TRIM은 세그먼트 하나만 봐도 됨.

---

## 출처 목록

- [YouTube Clips in YouTube Studio Help](https://support.google.com/youtube/answer/15824265?hl=en-GB)
- [CapCut Timeline Editing Guide](https://www.capeditcut.com/capcut-timeline-editing/)
- [Master CapCut Timeline Settings: 2026 Guide](https://filmora.wondershare.com/advanced-video-editing/capcut-timeline.html)
- [CapCut Tutorial for Beginners](https://pexo.ai/blog/capcut-tutorial-9296)
- [Beginner's Guide to Trimming in CapCut](https://triad-city-beat.com/beginners-guide-to-trimming-and-cutting-in-capcut-video-editing-software/)
