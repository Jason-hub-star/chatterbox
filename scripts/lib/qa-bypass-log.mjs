// 입 QA 게이트 우회(QA_MOUTH_SKIP)를 durable 하게 기록 — 우회 배포/발행된 아바타를 나중에 찾아
// 재게이트하기 위한 추적. 정당한 보류(무안료 화풍은 게이트가 스스로 PASS)와 결함 강제우회를 구분:
// 이 함수는 게이트가 FAIL 했는데 사람이 강제로 넘긴 경우에만 호출된다(deploy·publish 공용).
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const LOG = 'docs/status/qa-mouth-bypass.tsv'

// 게이트 실패 후 QA_MOUTH_SKIP 처리. 우회 허용 시 durable 기록, 불허 시 throw(배포/발행 중단).
// QA_MOUTH_SKIP="<사유>" 로 사유를 남기면 로그에 기록된다("1" 은 사유 미기재로 남김).
export function handleQaBypass({ id, stage }) {
  const skip = process.env.QA_MOUTH_SKIP
  if (!skip) throw new Error(`입 상태 QA 게이트 실패 (${id}/${stage}) — 자산 재생성 또는 QA_MOUTH_SKIP="<사유>"(비상 우회)`)
  const reason = skip === '1' ? '(사유 미기재)' : skip
  const at = new Date().toISOString()
  try {
    mkdirSync(dirname(LOG), { recursive: true })
    appendFileSync(LOG, `${at}\t${id}\t${stage}\t${reason}\n`)
  } catch { /* 로그 실패가 배포를 막지 않게 — 우회 자체는 진행 */ }
  console.warn(`⚠️ QA_MOUTH_SKIP — ${id}(${stage}) 입 QA 실패 우회. 사유: ${reason}. 기록: ${LOG} — 배포 후 재게이트 필요.`)
}
