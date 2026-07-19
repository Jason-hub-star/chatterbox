# Rask AI — UX 분석 노트

**Product**: Rask AI (Video Localization & Dubbing)
**URL**: https://www.rask.ai/
**Researched At**: 2026-07-19

---

## 핵심 인터랙션 패턴

### 1. 세그먼트별 텍스트 편집
- **원본 vs 번역 이중 컬럼**: 좌측 원본 언어(STT 결과) / 우측 목표 언어(AI 번역)
- 각 세그먼트(행)별로 독립 수정 가능
- **변경 저장**: "Save changes" 버튼 클릭
- 번역이 원본보다 길면 → 텍스트 조정해서 원본 타임라인에 맞춤
- **출처**: https://www.rask.ai/transcription-and-translation-control

### 2. 타임라인 적응
- 긴 번역 문장을 원본 발음 길이에 맞게 **텍스트로 단축**
- 예) 영어 3초 "hello" → 한국어 3초 "안녕하세요" (자연스럽게 스펀지 안에 맞춤)
- STT 정확도 개선 필요시 원본 텍스트도 수정
- **출처**: https://www.rask.ai/transcription-and-translation-control

### 3. 협업 워크플로우 (엔터프라이즈)
- **Human-in-the-Loop**: AI 80-90% 작업 + 전문가가 최종 검수
- **Teamspaces**: 폴더·권한·음성 프리셋 공유
- **번역 사전**: 용어 일관성 관리 (예: 브랜드 이름)
- **Reviewer 워크플로우**: 배치 프로젝트 → 네이티브 화자 검수 → 최종 렌더링
- 다국어 동시 번역 (한 비디오 → 여러 언어)
- **출처**: https://doneforyou.com/rask-ai-translation-video-tool-review/ (엔터프라이즈 가이드 참조)

### 4. 인라인 편집기
- 워크스페이스는 협업용 (팀원 초대) → 번역 검수
- **타이밍·발음·번역 조정**은 인라인 에디터에서
- 출처: https://www.rask.ai/transcription-and-translation-control

---

## 훔칠 패턴 (ChatterBox DUB-TRIM 적용 안)

### 1. **세그먼트 카드 = 원본(좌) ↔ 번역/대사(우)**
```
좌: STT 결과 (자동 생성, 읽기 전용 또는 미세 편집)
우: 배우별 대사 (수정 가능, 길이 표시)
가운데: 길이 조정 슬라이더 (원본 = 3.2s → 이 슬라이더로 배우 음성 길이 변경)
```

### 2. **번역 길이 동기화 표시**
```
세그먼트마다 "원본 3.2s / 녹음됨 2.8s" 배지
길이 차이가 크면 노란색 경고 → 배우가 텍스트 단축 또는 녹음 다시
```

### 3. **팀 검수 플로우 = @mentions 코멘트**
```
"이 부분 번역 어색한데 검수 부탁" → @담당 배우 또는 @언어 검수자
코멘트 제안 → 승인 / 거부 (Descript 스타일로 변형)
```

---

## 버릴 것 / 함정

- **SRT 업로드/다운로드는 외부 연동용**: ChatterBox는 내부 세그먼트 포맷 하나면 되므로 불필요.
- **다국어 번역 기능은 오버스코프**: DUB-TRIM은 한 언어(또는 우리 플랫폼 설정 언어)로 트림만 하기. 번역은 Rask/ElevenLabs 단계.
- **Human-in-the-loop의 "워크플로우" 복잡성**: 권한 관리, 담당자 배정, 최종 승인은 P2 defer. MVP는 코멘트만.

---

## 출처 목록

- [Rask AI Transcription & Translation Control](https://www.rask.ai/transcription-and-translation-control)
- [Rask AI Review: Translation Video Tool](https://doneforyou.com/rask-ai-translation-video-tool-review/)
- [Rask AI Enterprise Features](https://www.rask.ai/) [공식 사이트 - 상세 미확인]
- [G2 Reviews - Rask AI Features](https://www.g2.com/products/rask-ai/reviews) [미확인]
