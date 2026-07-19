# ElevenLabs Dubbing Studio — UX 분석 노트

**Product**: ElevenLabs Dubbing Studio
**URL**: https://elevenlabs.io/studio
**Researched At**: 2026-07-19

---

## 핵심 인터랙션 패턴

### 1. 타임라인 기반 세그먼트 편집
- **중앙 타임라인**: 수평 스크롤 영역에 모든 클립·세그먼트 배치
- **3가지 네비게이션**:
  - 커서 드래그로 시간 이동
  - 수평 스크롤
  - 우측 타임코드 입력 (정확한 이동)
- **출처**: https://elevenlabs.io/docs/eleven-creative/products/dubbing/dubbing-studio

### 2. 클립 길이 조정 (드래그 핸들)
- 각 클립의 **좌/우 끝**에 핸들 표시
- **드래그해서 길이 조정** (재생성 필요)
- 우클릭 → "Clip History" (이전 버전들 확인)
- **재생성 모드**:
  - **Fixed Generation** (기본): 클립 길이 고정 유지
  - **Dynamic Generation**: 텍스트에 맞춰 자연스럽게 길이 변경
- **출처**: https://help.elevenlabs.io/hc/en-us/articles/37003161402385-What-is-the-timeline-in-Studio [403]

### 3. 스피커 트랙 관리
- 각 스피커마다 **별도 수평 트랙** (음악 DAW처럼)
- **클립 드래그로 스피커 재배정**: 클립을 다른 스피커 트랙에 드래그 → 자동 재배정
- **스피커 카드** (좌측): 이름 + 성명 + 음성 설정 버튼 (⚙️ 아이콘)
  - 클립 클론 / 트랙 클론 / 라이브러리 음성 선택
- Split/Merge: 인접 클립 끝을 드래그해 자동 병합
- **출처**: https://elevenlabs.io/docs/eleven-creative/products/dubbing/dubbing-studio

### 4. 일괄 재생성
- "Generate Stale Audio" 버튼: 수정된 모든 클립 한 번에 재생성
- 각 클립마다 새로 녹음할 필요 없음
- **출처**: https://elevenlabs.io/docs/eleven-creative/products/dubbing/dubbing-studio

---

## 훔칠 패턴 (ChatterBox DUB-TRIM 적용 안)

### 1. **스피커 트랙 × 세그먼트 = 2D 그리드**
```
좌패널 세그먼트 리스트 + 우측 배우 트랙
→ 각 세그먼트의 배우별 레인으로 시각화
→ 드래그로 배우 재배정 (예: 배우1 → 배우2로 이동)
```

### 2. **Fixed / Dynamic 길이 전환**
```
각 세그먼트별 "길이 고정" 토글
- ON: STT 텍스트가 원본 미디어 길이에 맞춤 (가급적 입 모양 보존)
- OFF: 자연스러운 발음 길이로 신축 (입술 싱크 신경 쓸 필요 적음)
```

### 3. **우클릭 컨텍스트 메뉴 = 세그먼트 작업**
```
세그먼트 카드 우클릭:
- "분할" (현재 플레이헤드 위치)
- "병합" (다음 세그먼트)
- "재생성" (STT 텍스트 → 음성)
- "기록 보기" (이전 버전)
```

---

## 버릴 것 / 함정

- **음성 라이브러리 설정 미러링 금지**: ElevenLabs의 음성 선택(클론·라이브러리)은 복잡. ChatterBox는 배우별 고정 음성(또는 Rask/ElevenLabs REST API 호출)로 단순화.
- **Split/Merge 드래그는 편함인가?**: 핸들 드래그로 자동 병합은 의외로 오류 유발 가능 (실수로 길이 줄이는 것처럼 보임). 명시적 "병합" 버튼이 낫다.
- **타임코드 입력은 우리 플레이어에 과한가**: YouTube처럼 텍스트 선택 기반(STT 세그먼트 텍스트 선택 → 시간 바로 타겟)이 더 자연스러울 수 있음.

---

## 출처 목록

- [ElevenLabs Dubbing Studio Docs](https://elevenlabs.io/docs/eleven-creative/products/dubbing/dubbing-studio)
- [Timeline in Studio Help](https://help.elevenlabs.io/hc/en-us/articles/37003161402385-What-is-the-timeline-in-Studio) [403 - 부분 확인됨]
- [Studio Overview Docs](https://elevenlabs.io/docs/eleven-creative/products/studio)
