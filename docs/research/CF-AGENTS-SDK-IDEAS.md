# Cloudflare Agents SDK — ChatterBox 적용 아이디어 (조사 원본)

> 2026-07-12. 출처: 노마드 코더 "Cloudflare에 꽂혔더니 역대급 AI 에이전트 만들었음" (https://www.youtube.com/watch?v=wQDHSDvgU54, 6분) 자막 추출 + Cloudflare 공식문서 교차검증.
> 상태: **P2 후보 풀** — 현 단계(보안 하드닝 + UX seam)의 §0 백로그 아님. 착수 시 PLATFORM-ARCHITECTURE §12 문서 선행 규칙 적용(Workers/DO = 새 인프라 축).

## 영상 요지

Agents SDK 하나로 상태 영속·실시간 동기화·스케줄링·이메일·음성·브라우저 자동화가 몇 줄에 배선된다는 데모.

- 0:00–1:40 데모: Cloudflare 위 브라우저를 유저와 공유(둘 다 클릭 가능)·스크린샷, `bot@` 메일 수신→리마인더, 에이전트가 스스로 도구 코드를 작성해 샌드박스에서 로드·실행(self-extending), 음성 통화.
- 1:40–2:30 배경: PDF 읽기·격리 파일시스템·서브에이전트·MCP 서버化. Cloudflare가 에이전트 스택 전체(샌드박스·브라우저·음성·이메일·메모리·Agents SDK)를 제공.
- 2:30–5:00 코어 배선: `AIChatAgent` 상속 + 프론트 `useAgent`/`useAgentChat` 훅(WebSocket 영속 연결·재연결 내장) + `onChatMessage`에서 AI SDK `streamText`. 모델은 Workers AI(Llama/Mistral/Gemma/Qwen/DeepSeek) 또는 OpenAI/Anthropic. 스트리밍·영속·멀티탭 실시간 동기화가 추가 코드 없이 따라옴. 상태는 에이전트당 SQLite 자동 영속.
- 5:00–6:00 스케줄 1줄·이메일 수신 1메서드·서브에이전트 2줄 + 강의(Claude Clone) 홍보.

## 공식문서 검증 (developers.cloudflare.com/agents)

영상 주장과 문서 일치 확인(2026-07-12 기준):

- 상태: `initialState` / `setState()`(SQLite 영속 + 전 클라이언트 WebSocket 브로드캐스트) / `this.state` / `onStateChanged(state, source)` / `validateStateChange(next, source)`(throw로 거부 — 스푸핑 차단 지점). state는 JSON 직렬화 가능해야 하고 작게 유지, 큰 데이터는 `this.sql` 템플릿 리터럴.
- 스케줄: `this.schedule(초|Date|cron문자열, 콜백명, payload)` — 재시작 생존(SQLite), `cancelSchedule(id)`.
- 라이프사이클: `onStart` / `onRequest` / `onConnect` / `onMessage` / `onEmail` / `replyToEmail` / `@callable()` RPC.
- 프론트: `useAgent({ agent, name, onStateUpdate })` / `useAgentChat`. 바닐라는 `AgentClient`.
- 기타 스택: Browser Rendering(브라우저 자동화), Sandbox(코드 실행), MCP, 음성/이메일 채널.

## ChatterBox 적용 아이디어 (우선순위순)

| # | 아이디어 | ChatterBox 접점 | 근거 API |
|---|---|---|---|
| 1 | **AI 리허설 파트너 / AI 배우** — 상대 배역 부재 시 에이전트가 대본의 상대 대사를 침. 발전형: 무대 7번째 슬롯 AI 아바타 | 대본·더빙과 직결. "혼자서도 연습 가능" 킬러 seam. 진입: 룸 밖 연습 모드 최소 배선(버튼 1개, UI Minimal) | `AIChatAgent`+`useAgentChat`, Workers AI 저가 모델 or Anthropic |
| 2 | **룸 코디네이터 에이전트** — 리액션·프레즌스·대본 진행 포인터를 룸당 1 DO state로 | LiveKit datachannel 첫-메시지 유실(현행 해법: Edge broadcast 릴레이)의 구조적 해법 — 접속 즉시 현재 state 수신·재연결 내장. 단 현행 릴레이가 프로드 동작 중 → 마이그레이션 아닌 신규 실시간 기능(대본 포인터·큐시트)부터 DO로 | `setState` 브로드캐스트, `validateStateChange`, `name: roomId` |
| 3 | **룸 수명주기 타이머** — 예약 공연 카운트다운·빈 방 자동 정리·크레딧 소멸 예고 | 전역 pg_cron 대비 룸 단위 타이머는 DO 알람이 자연스러움 | `this.schedule(Date, …)`, `cancelSchedule` |
| 4 | **도그푸딩 페르소나 봇 상시화** — 프로드를 주기적으로 "써보는" 봇 | dogfood-audit 페르소나 워커의 무인화 | Browser Rendering + `schedule(cron)` |
| 5 | **커미션 메일 인박스** — PNG 첨부 메일로 아바타 발주 접수 | Avatar Forge 커미션 접수 채널 | `onEmail`/`replyToEmail` + Email Routing |

## 제약·판단 근거

- 백엔드 SSOT는 Supabase Edge + pg. Workers/DO 도입은 새 인프라 축이라 문서 선행 + GAP-MATRIX P0 확인 필요.
- CF Pages 계정·배포 라인 기존재 → 진입비용 낮음. DO 알람+SQLite 수준이면 월 수 달러 급.
- 리스크 제로 진입점은 #1 (기존 Edge 릴레이 무접촉·독립 신기능). #2는 검증된 현행 해법을 대체하므로 신중.
