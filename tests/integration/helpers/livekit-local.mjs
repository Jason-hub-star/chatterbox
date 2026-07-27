// 로컬 livekit-server E2E 하네스 — 브라우저 E2E의 룸 접속을 클라우드(참가자-분 과금·무료 5000분/월)
// 대신 로컬 dev 서버(ws://127.0.0.1:7880, devkey/secret)로 돌린다. `brew install livekit` 필요.
// 사용: const ctx = await browser.newContext(); await routeLiveKitLocal(ctx)
// 프로드 livekit-token 함수와 동일 규칙(identity=auth uid, 응답 {server_url, token})으로 서명해
// 앱 코드는 무수정. E2E_CLOUD_LK=1 이면 무개입(진짜 클라우드 게이트를 검증할 때만).
import { spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { connect } from 'node:net'
import { openSync } from 'node:fs'

export const LOCAL_LK_URL = 'ws://127.0.0.1:7880'
const DEV_KEY = 'devkey'
const DEV_SECRET = 'secret'

export function signLocalToken({ identity, name, room }) {
  const now = Math.floor(Date.now() / 1000)
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = enc({ alg: 'HS256', typ: 'JWT' })
  const body = enc({
    iss: DEV_KEY, sub: identity, name: name || identity, nbf: now - 10, exp: now + 3600,
    video: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true },
  })
  const sig = createHmac('sha256', DEV_SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

const portOpen = () => new Promise((res) => {
  const s = connect({ host: '127.0.0.1', port: 7880, timeout: 400 })
  s.once('connect', () => { s.destroy(); res(true) })
  s.once('error', () => res(false))
  s.once('timeout', () => { s.destroy(); res(false) })
})

// 싱글턴 스폰: 이미 떠 있으면 재사용(수동 실행분 존중), 스폰분은 테스트 프로세스 종료 시 자동 kill.
let serverReady = null
async function ensureLocalLiveKit() {
  serverReady ??= (async () => {
    if (await portOpen()) return
    const log = process.env.E2E_LK_LOG ? openSync(process.env.E2E_LK_LOG, 'a') : 'ignore'
    const proc = spawn('livekit-server', ['--dev'], { stdio: ['ignore', log, log] })
    proc.on('error', () => {}) // ENOENT 는 아래 포트 대기 실패 메시지로 수렴
    process.on('exit', () => { try { proc.kill() } catch { /* 이미 종료 */ } })
    for (let i = 0; i < 50 && !(await portOpen()); i++) await new Promise((r) => setTimeout(r, 100))
    if (!(await portOpen())) throw new Error('livekit-server --dev 기동 실패 — `brew install livekit` 확인')
  })()
  return serverReady
}

// 브라우저 컨텍스트의 livekit-token Edge 호출을 로컬 서버 토큰으로 대체(preflight 포함).
export async function routeLiveKitLocal(context) {
  if (process.env.E2E_CLOUD_LK) return
  await ensureLocalLiveKit()
  await context.route('**/functions/v1/livekit-token', async (route) => {
    const req = route.request()
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors, body: 'ok' })
    const jwt = (req.headers()['authorization'] || '').replace(/^Bearer\s+/i, '')
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1] || '', 'base64url').toString() || '{}')
    const { roomName } = JSON.parse(req.postData() || '{}')
    return route.fulfill({
      status: 201, headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server_url: LOCAL_LK_URL,
        token: signLocalToken({ identity: claims.sub, name: claims.email, room: roomName }),
      }),
    })
  })
}
