# Manus Threads Auto-Upload Brief — SNACK / ChatterBox

Updated: 2026-07-06  
Owner: 김주영 / SNACK  
Purpose: 마누스가 이 문서를 읽고 ChatterBox 개발 기록을 Threads에 자동 업로드한다.

## 0. 핵심 목표

ChatterBox를 "기술 설명"이 아니라 "결과물이 단계별로 좋아지는 빌드 로그"로 보여준다.

- 첫 업로드는 과거 산물과 현재 버전을 함께 보여준다.
- 이후 업로드는 매번 `A -> B` 개선을 시각 자료로 증명한다.
- 성우 스튜디오를 다니며 목소리/연기 감각을 배우는 개인 서사를 곁들인다.
- 기술력은 자세히 공개하지 않는다. 공개용 표현은 `그림 한 장 -> 움직이는 캐릭터 -> 친구와 연기하는 방 -> 쇼츠` 정도로만 유지한다.

## 1. 프로젝트 한 줄 설명

ChatterBox는 그림 한 장으로 버추얼 캐릭터를 만들고, 친구들과 한 방에서 목소리 연기/더빙/쇼츠 제작을 함께 하는 웹 서비스다.

## 2. 마누스가 참고할 로컬 소스

### 제품/랜딩

- 랜딩 레포: `/Users/family/jason/snack-web`
- 현재 랜딩 상태: `/Users/family/jason/snack-web/docs/status/PROJECT-STATUS.md`
- 랜딩 카피: `/Users/family/jason/snack-web/src/content/locales/ko.ts`
- 랜딩 배포: `https://snack-web-khaki.vercel.app`
- 사전등록 폼: `https://tally.so/r/japxg4`

### ChatterBox 앱

- 앱 레포: `/Users/family/jason/ChatterBox`
- 앱 상태: `/Users/family/jason/ChatterBox/docs/status/PROJECT-STATUS.md`
- 제품 준비도: `/Users/family/jason/ChatterBox/docs/plan/PRODUCT-READINESS.md`
- 피치 증거 기준: `/Users/family/jason/ChatterBox/docs/plan/PITCH-READINESS.md`
- 기능 스펙: `/Users/family/jason/ChatterBox/docs/FEATURE-SPEC.md`

### 사업 자료

- 사업계획서: `/Users/family/Documents/채터박스/수원창업오디션_사업계획서.md`
- 요약서: `/Users/family/Documents/채터박스/수원창업오디션_요약서.md`

### AUTORIG / 아바타 개발 기록

- Vtube 프로젝트: `/Users/family/jason/Vtube`
- 현재 상태: `/Users/family/jason/Vtube/docs/status/PROJECT-STATUS.md`
- 증거 로그: `/Users/family/jason/Vtube/vtube-validation-evidence-log.md`

## 3. 공개 가능한 주요 메시지

사용 가능한 공개 메시지:

- "그림 한 장에서 움직이는 캐릭터까지 가는 흐름을 만들고 있다."
- "혼자 연습하던 목소리 연기/더빙을 친구들과 같이 할 수 있는 방을 만들고 있다."
- "성우 스튜디오를 다니며 실제 연기 감각도 배우는 중이다."
- "처음엔 랜딩과 데모였고, 지금은 실제 방/아바타/더빙 흐름을 제품으로 묶는 중이다."
- "목표는 설치 없이 브라우저에서 캐릭터로 함께 노는 공간이다."
- "일본어/영어 확장을 고려해 다국어 구조를 준비했다."

피해야 할 표현:

- "이미 완전한 공개 서비스다"라고 단정하지 않는다.
- "모든 기능이 배포되어 누구나 쓸 수 있다"라고 말하지 않는다.
- 수치나 상태는 출처 문서와 일치할 때만 쓴다.
- `Live now`, `PoC proven`, `Designed`를 섞지 않는다.

현재 안전한 상태 라벨:

| 항목 | 공개 라벨 |
|---|---|
| snack-web 랜딩 | Live now |
| 사전등록 | Live now |
| ChatterBox 앱 | Building / PoC |
| AUTORIG 캐릭터 결과물 | Working prototype |
| 6인 연기 플랫폼 전체 | Roadmap / Building |

## 4. 절대 공개 금지선

아래 내용은 Threads 이미지, 영상, 본문, 댓글, alt text에 넣지 않는다.

- 소스코드, 터미널 로그, 레포 트리, 내부 파일명 대량 노출
- API 키, 토큰, 환경변수, Supabase/LiveKit/fal.ai 설정값
- 자동 리깅 알고리즘의 구체 단계, 스크립트명, 파라미터, 학습 설정
- See-through 학습 데이터, 공식 샘플 픽셀, isolated RGBA, evidence JSON
- LoRA/adapter 세부 구조, rank, target module, checkpoint 경로
- 비공개 협력자 개인정보, 성우 스튜디오 내부 인물/수업 내용/녹음본
- 친구들과의 대화 캡처, 계정명, 이메일, 방 코드
- "곧 투자받는다", "시장 독점" 같은 과장 문구

`ponytail:` 기술 공개는 결과물 중심으로만 한다. 내부 구현은 "자동 리깅 파이프라인", "브라우저 아바타 런타임", "실시간 방"처럼 넓은 단어로 표현한다.

## 5. 사용할 수 있는 공개 자산

### 첫 업로드용 강력 후보

| 자산 | 용도 |
|---|---|
| `/Users/family/jason/snack-web/j0_upload.png` | A: 그림/업로드 출발점 |
| `/Users/family/jason/snack-web/j1_rig.png` | B: 캐릭터 리깅 단계 |
| `/Users/family/jason/snack-web/j2_live.png` | C: 라이브 구동 단계 |
| `/Users/family/jason/snack-web/j3_loop.png` | D: 제작 루프/결과 흐름 |
| `/Users/family/jason/snack-web/public/showreel/build.mp4` | 빌드 과정 영상 |
| `/Users/family/jason/snack-web/public/showreel/poster.jpg` | 영상 썸네일 |
| `/Users/family/jason/snack-web/public/screenshots/voicestage-light.png` | 방/무대 UI 밝은 버전 |
| `/Users/family/jason/snack-web/public/screenshots/voicestage-dark.jpeg` | 방/무대 UI 어두운 버전 |
| `/Users/family/jason/ChatterBox/poc/reference-to-video/yuki-poc.mp4` | 유키 PoC 영상 |
| `/Users/family/jason/ChatterBox/poc/reference-to-video/yuki-montage.png` | 유키 montage |

### 업로드 전 자산 처리 규칙

- 이미지에 로컬 경로, 터미널, 파일명, 이메일, 방 코드가 보이면 크롭/블러 처리한다.
- 영상은 15~30초로 자른다.
- 첫 업로드는 이미지 4장 carousel 또는 짧은 영상 1개 + 이미지 2장 조합을 우선한다.
- 텍스트 설명보다 화면 변화가 먼저 보이게 한다.

## 6. 글쓰기 톤

특정 인플루언서를 흉내 내지 않는다. 대신 IT/AI 빌더 계정에서 흔한 문법을 사용한다.

기본 구조:

1. 짧은 후킹 문장
2. 내가 만들고 있는 것 한 줄
3. A -> B 개선 증거
4. 이번에 배운 점
5. 다음에 보여줄 것

문체:

- 한국어 기본.
- 짧은 문장.
- 과장보다 관찰.
- "만들고 있습니다"보다 "만들고 있어요" 정도의 자연스러운 톤.
- 기술명보다 사용자 장면.
- 실패/삽질도 숨기지 않되, 내부 비법은 말하지 않는다.

좋은 문장 예:

- "처음엔 그냥 움직이는 캐릭터를 만드는 게 목표였는데, 지금은 친구랑 같이 연기하는 방을 만들고 있어요."
- "이번 버전에서 좋아진 건 설명보다 화면으로 보는 게 빠릅니다."
- "기술적으로는 아직 갈 길이 많지만, 이제 '혼자 만든 데모'에서 '같이 놀 수 있는 제품' 쪽으로 넘어가는 중입니다."
- "성우 스튜디오를 다니면서 느낀 건, 목소리 연기는 혼자보다 같이 할 때 훨씬 재밌다는 것."

피해야 할 문장:

- "세계 최초", "압도적", "완성", "곧 시장을 먹는다"
- "내 자동 리깅은 이런 구조로 학습했고..."
- "이 코드를 보면..."

## 7. 첫 업로드 패키지

### 목적

SNACK / ChatterBox의 시작점을 알리고, 앞으로의 빌드 로그 시리즈를 예고한다.

### 권장 자산 구성

1. `j0_upload.png`
2. `j1_rig.png`
3. `j2_live.png`
4. `j3_loop.png`

대안:

- `build.mp4`를 첫 미디어로 쓰고, 뒤에 `voicestage` 스크린샷을 붙인다.

### 첫 업로드 본문안 A

```text
요즘 만들고 있는 것.

그림 한 장을 올리면
움직이는 캐릭터가 되고,
그 캐릭터로 친구들과 같이 연기하는 방을 만드는 중입니다.

처음엔 "아바타가 움직이면 신기하겠다"였는데,
성우 스튜디오를 다니면서 생각이 조금 바뀌었어요.

목소리 연기는 혼자보다 같이 할 때 훨씬 재밌고,
그 순간을 바로 기록해서 쇼츠로 남길 수 있으면 좋겠더라고요.

그래서 SNACK에서 ChatterBox를 만들고 있습니다.

첫 버전은 과거 산물 공개부터.
앞으로는 A -> B로 좋아지는 과정을 계속 올려볼게요.
```

### 첫 업로드 본문안 B

```text
한동안 만든 것들을 정리해보니 방향이 선명해졌습니다.

A. 그림 한 장에서 움직이는 캐릭터 만들기
B. 그 캐릭터로 친구들과 같이 연기하는 방 만들기

지금은 B로 넘어가는 중.

기술 설명보다 결과물이 좋아지는 과정을 보여주고 싶어요.
오늘은 첫 기록이라 과거 산물부터 올립니다.

다음 업로드는 "이전 버전 vs 다음 버전"으로 가볼게요.
```

### 첫 업로드 본문안 C

```text
혼자 쓰는 버튜버 도구가 아니라,
친구랑 같이 목소리로 노는 방을 만들고 있습니다.

그림 한 장 -> 움직이는 캐릭터
캐릭터 -> 연기 방
연기 방 -> 짧은 클립

아직 만드는 중이라 완성됐다고 말하긴 이르지만,
과거 버전보다 훨씬 제품에 가까워졌어요.

앞으로 개발 기록은 글보다 결과물 위주로 올리겠습니다.
```

### 첫 댓글

```text
공개 가능한 범위 안에서만 올릴 예정입니다.
내부 기술보다 "사용자가 보게 되는 변화"를 기록해볼게요.
```

## 8. 2주 업로드 캘린더

| 순서 | 주제 | 보여줄 것 | 핵심 문장 |
|---:|---|---|---|
| 1 | 프로젝트 시작 | j0~j3 carousel | "과거 산물부터 공개합니다." |
| 2 | 그림 -> 캐릭터 | build.mp4 / poster | "설명보다 조립되는 장면이 빠릅니다." |
| 3 | 캐릭터 A/B | yuki montage / avatar screenshots | "귀, 머리, 표정이 조금씩 자연스러워지는 중." |
| 4 | 성우 스튜디오 기록 | 직접 쓴 짧은 텍스트 + 제품 이미지 | "목소리 연기는 같이 할 때 재밌다." |
| 5 | 방 UI | voicestage light/dark | "아바타보다 중요한 건 같이 있는 느낌." |
| 6 | 더빙 흐름 | 사업계획서의 흐름을 그림으로 요약 | "업로드 -> 역할 -> 녹음 -> 합성." |
| 7 | 신뢰/경계 | Live now / Building / Designed 구분 | "과장하지 않고 되는 것부터 보여주기." |
| 8 | 다음 버전 예고 | 새로운 캡처 또는 short clip | "다음은 실제 방 흐름." |

## 9. 반복 업로드 템플릿

```text
[후킹]

이번에 좋아진 것:
A: [이전 상태]
B: [다음 상태]

사용자 입장에서 달라진 점은 [한 줄].

아직 남은 문제는 [한 줄].
다음엔 [다음 결과물]을 보여줄 예정.
```

예:

```text
이번 주 ChatterBox 빌드 로그.

A: 캐릭터만 보여주던 데모
B: 방 안에서 같이 연기하는 화면

사용자 입장에선 "내 아바타가 있다"에서
"친구랑 같이 뭔가 할 수 있다"로 넘어갑니다.

아직 녹화/쇼츠 흐름은 다듬는 중.
다음엔 더빙 루프를 보여줄게요.
```

## 10. Manus 실행 절차

1. 이 문서를 먼저 읽는다.
2. `2. 마누스가 참고할 로컬 소스`의 상태 문서를 확인한다.
3. 오늘 업로드할 주제를 `8. 2주 업로드 캘린더`에서 고른다.
4. 자산을 복사해 임시 작업 폴더에 둔다.
5. 자산에서 민감정보를 검사한다.
6. 본문 초안을 2개 만든다.
7. 가장 덜 과장되고 가장 화면 중심인 초안을 선택한다.
8. Threads에 업로드한다.
9. 업로드 URL과 사용한 자산 목록을 아래 로그에 기록한다.

권장 작업 폴더:

```text
/Users/family/jason/ChatterBox/docs/marketing/thread_posts/
```

업로드 전 체크:

- [ ] 기술 세부 공개 없음
- [ ] 코드/터미널/키/경로 노출 없음
- [ ] 현재 구현 상태 과장 없음
- [ ] 이미지/영상이 먼저 말함
- [ ] 문장 첫 2줄만 봐도 무슨 프로젝트인지 이해됨
- [ ] 댓글로 더 물어봐도 공개 가능한 내용만 남김

## 11. 업로드 로그

| 날짜 | 주제 | 업로드 URL | 사용 자산 | 메모 |
|---|---|---|---|---|
| 2026-07-06 | 첫 업로드 준비 | pending | j0~j3 후보 | 문서 작성 |

