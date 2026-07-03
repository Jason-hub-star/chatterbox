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

export const SEED_SCRIPTS: Script[] = [
  {
    id: 'first-snow',
    title: '첫눈 오는 날 (2인 단편)',
    roles: ['하루', '유이'],
    cues: [
      { role: '하루', text: '…눈이다. 올해 첫눈이네.' },
      { role: '유이', text: '진짜네. 손 내밀어 봐, 하루.' },
      { role: '하루', text: '차가워. 근데 금방 녹아버리잖아.' },
      { role: '유이', text: '그러니까 지금 봐야지. 안 그러면 놓쳐.' },
      { role: '하루', text: '…너는 늘 그렇게 말하더라.' },
      { role: '유이', text: '왜, 틀렸어?' },
      { role: '하루', text: '아니. 맞아서 문제지.' },
      { role: '유이', text: '후훗. 그럼 오늘은 안 놓칠 거지?' },
      { role: '하루', text: '응. …오늘은 안 놓칠게.' },
      { role: '유이', text: '약속. 자, 눈 더 오기 전에 뛰자!' },
    ],
  },
]

export const getScript = (id: string): Script | undefined => SEED_SCRIPTS.find((s) => s.id === id)
