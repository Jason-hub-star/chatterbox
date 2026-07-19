# Smule 듀엣 / 그룹 콜라브 — UX 분석 노트

**Product**: Smule (Social Singing App)
**URL**: https://www.smule.com/
**Researched At**: 2026-07-19

---

## 핵심 인터랙션 패턴

### 1. 듀엣 vs 그룹 콜라브
- **Duet**: 2명 (원본 가수 1 + 신참 가수 1)
  - 다른 사용자가 이미 녹음한 것에 음성 추가
  - 두 목소리가 섞여서 최종 결과물로 공개
  - 개수 제한 없음 (3명 이상 참여 가능, 한 번에 한 명씩)
- **Group Collab**: N명이 순차적으로 추가
  - "하나의 거대한 콜라브"로 진화 (시간에 따라 성장)
  - 모두의 프로필에 표시됨
- **출처**: https://smule.zendesk.com/hc/en-us/articles/360001428286-All-information-on-collabs

### 2. 파트(Part) 배정 인터페이스
- **"버튼으로 파트 선택"**: 노래의 각 라인/섹션 옆에 버튼 → 클릭하면 **그 파트 담당자로 할당**
- 노래가 2인창(남/여)으로 나뉘면 그대로 복사 (예: 남자 보컬은 남자 버튼, 여자 보컬은 여자 버튼)
- **대부분 자유**: 노래 구성이 명확하지 않으면 누가 어느 파트를 하는지 자유 (사용자 선택)
- **타이밍 설정**: 각 라인별로 스페이스바 입력해서 정확한 타이밍 설정
  - "이 라인은 2.5초에 시작해야 한다" → 스페이스 누르기
- **출처**: https://sing.salon/forums/topic/624-how-to-actually-make-your-own-parts-when-clicking-this-option-in-duet/

### 3. 합성 및 볼륨 조정
- **각 참여자 볼륨 비율 조정**: 최종 녹음에서 A목소리 70% / B목소리 30% 등으로 혼합
- **하모니 및 이펙트 추가**: 각 파트별 리버브, 에코, 피치 시프트 등 적용 가능
- **자신과 듀엣 (Self-Duet)**: 같은 사람이 여러 파트를 나눠 녹음할 수 있음
- **출처**: https://sing.salon/articles/tips-and-tricks/how-to-add-songs-to-smule-r5/

### 4. 커뮤니티 및 초대 메커니즘
- **공개 공지**: 듀엣 시작 후 공개 알림으로 다른 싱어들에게 노출
- **Direct Message / Group Chat**: 친구들을 직접 초대
- **최종 결과물**: 참여자 모두의 프로필에 나타남 (협업 신호 = 사회적 증명)
- **Collab 성장**: 시간 지남에 따라 참여자 증가 (콜라브 개수 증가 = 인기도)
- **출처**: https://smule.zendesk.com/hc/en-us/articles/360001428286-All-information-on-collabs

---

## 훔칠 패턴 (ChatterBox DUB-TRIM 적용 안)

### 1. **파트 버튼 = 역할 빠른 배정 (놀이화)**
```
세그먼트별로 작은 버튼 표시:
┌─────────────────────────────┐
│ "안녕하세요"                  │
│ [👤김배우] [👤이배우] [➕]   │  ← 아바타 버튼 = 파트 배정
│ (클릭하면 그 배우로 할당)    │
└─────────────────────────────┘

기존 방식: 드롭다운 선택 "배우 선택: [▼]"
개선안: 아바타 버튼 5개 미리 보이기 → 클릭 1회 배정 완료
```

### 2. **색상 코드 = 배우별 시각적 분리**
```
배우A의 세그먼트: 파란색 배경
배우B의 세그먼트: 빨간색 배경
배우C의 세그먼트: 녹색 배경
→ 시각적으로 "누가 어디 부르는가" 한눈에 파악
```

### 3. **볼륨 레벨 인디케이터 (Smule 하모니 패턴)**
```
각 세그먼트 옆에 "📊 A: 80% | B: 60%" 표시
→ 배우가 볼륨 조정 버튼 클릭 → 스튜디오의 최종 믹스 시뮬레이션
→ 너무 크면 경고 배지: "A가 너무 커요, 줄여봐"
```

### 4. **"초대" → "응답 대기" 배지 (사회적 신호)**
```
세그먼트마다 상태 표시:
- [✓] 배우A 완료 (녹음됨, 검증됨)
- [⏳] 배우B 초대됨 (응답 대기 중)
- [❌] 배우C 거절 (대체 배우 필요)
- [➕] 비어있음 (누구 배정?)

배우 목록 우측에 "2/4 완료" 진행도
```

---

## 버릴 것 / 함정

- **"자신과 셀프 듀엣" 기능**: Smule은 한 사람이 남/여 파트를 나눠 부르는 기능 허용. ChatterBox는 하나의 세그먼트 = 하나의 배우 (중복 녹음 없음). → 불필요.
- **커뮤니티 노출/인기도**: Smule의 "공개 공지 → 싱어들이 참여" 자동 증가 메커니즘은 우리 플랫폼의 "방" 구조와 안 맞음 (이미 초대된 멤버만 참여). → 불필요.
- **리버브/피치 시프트 이펙트 복잡성**: 더빙은 "이미 녹음된 목소리"를 정렬하는 것이 목표. 에펙트는 P2 (이미 Rask/ElevenLabs가 생성함).
- **자동 스냅 vs 수동 타이밍**: Smule은 스페이스바 입력으로 정확한 ms 단위 타이밍 설정. 우리는 STT 세그먼트 시간축이 이미 정해져 있으므로 → 배우는 그 시간에 맞춰 녹음만 하면 됨 (타이밍 조정 불필요).

---

## 출처 목록

- [Smule Collabs Zendesk Help](https://smule.zendesk.com/hc/en-us/articles/360001428286-All-information-on-collabs)
- [How to Make Your Own Parts in Duet - Smule Community](https://sing.salon/forums/topic/624-how-to-actually-make-your-own-parts-when-clicking-this-option-in-duet/)
- [How to Add Songs to Smule - Sing.Salon Tips](https://sing.salon/articles/tips-and-tricks/how-to-add-songs-to-smule-r5/)
- [Smule App Store - Apple](https://apps.apple.com/us/app/smule-sing-duet/id509993510)
