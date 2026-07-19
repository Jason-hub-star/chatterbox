// 대본(cue) 시드 데이터 — 실시간 연기 텔레프롬프터의 SSOT는 state-machines/Script.md·contracts/ScriptPanel.md.
// 기능 수직 MVP: cue 는 코드에 seed. 호스트가 진행하면 reliable DataChannel('script')로 cue_index 를 동기.
// ponytail: 대본 업로드/라이브러리(CNT-02)·DB 저장(scripts.cues_json·current_cue_index)·늦은 참가자 상태동기·
//   씬 선택 UI·역할 브로드캐스트는 후속. 지금은 seed 대본 1개 + 로컬 역할선택 + cue 동기까지.

export interface Cue {
  role: string
  text: string
}

export interface Script {
  id: string
  title: string
  roles: string[]
  cues: Cue[]
}

// 데모 시드("첫눈 오는 날") 제거(2026-07-19 주인님 결정 — "실제 데이터만"): 전 방에 가짜 대본이
// 뜨던 것을 빈 상태로. 실데이터 공급은 RM-SCRIPT(scripts 테이블·업로드·시드 팩 — 정본 설계 대기)가 담당.
export const SEED_SCRIPTS: Script[] = []

export const getScript = (id: string): Script | undefined => SEED_SCRIPTS.find((s) => s.id === id)
