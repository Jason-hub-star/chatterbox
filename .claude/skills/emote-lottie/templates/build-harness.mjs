// 이모트 실렌더 하네스: lottie_light(=앱 실렌더러) 인라인 + 프레임 정지 그리드 → file:// 단일 페이지
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = '/Users/family/jason/ChatterBox'
const IDS = ['thumbsup', 'laugh', 'clap', 'fire', 'heart', 'cry', 'wow', 'question']
const FRAMES = [0, 8, 16, 45, 100]

const lottieSrc = readFileSync(`${ROOT}/node_modules/lottie-web/build/player/lottie_light.min.js`, 'utf8')
const data = Object.fromEntries(IDS.map((id) => [id, JSON.parse(readFileSync(`${ROOT}/public/lotties/emotes/${id}.json`, 'utf8'))]))

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#1d1611;font:11px monospace;color:#caa}
table{border-collapse:collapse}td,th{padding:4px;text-align:center}
.cell{width:96px;height:96px;background:#2a2018;border-radius:8px}
</style></head><body>
<table id="t"><tr><th></th>${FRAMES.map((f) => `<th>f${f}</th>`).join('')}</tr></table>
<script>${lottieSrc}</script>
<script>
const DATA = ${JSON.stringify(data)};
const FRAMES = ${JSON.stringify(FRAMES)};
const t = document.getElementById('t');
let pending = 0; window.__err = [];
window.addEventListener('error', (e) => window.__err.push(String(e.message)));
for (const id of Object.keys(DATA)) {
  const tr = document.createElement('tr');
  tr.innerHTML = '<th>' + id + '</th>';
  for (const f of FRAMES) {
    const td = document.createElement('td');
    const div = document.createElement('div');
    div.className = 'cell';
    td.appendChild(div); tr.appendChild(td);
    pending++;
    const anim = lottie.loadAnimation({ container: div, renderer: 'svg', loop: false, autoplay: false, animationData: structuredClone(DATA[id]) });
    anim.addEventListener('DOMLoaded', () => { anim.goToAndStop(f, true); pending--; if (!pending) window.__done = true; });
  }
  t.appendChild(tr);
}
setTimeout(() => { window.__done = true }, 3000);
</script></body></html>`

writeFileSync('/private/tmp/claude-501/-Users-family-jason-ChatterBox/9b5a44dd-26d8-4973-bd4a-7ace01499560/scratchpad/emote-harness.html', html)
console.log('harness written')
