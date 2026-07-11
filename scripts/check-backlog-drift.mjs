#!/usr/bin/env node
// 백로그 문서 ↔ 코드 드리프트 감시 — probe 주석이 달린 체크박스 행만 검사한다.
//   probe 형식: <!-- probe: 상대경로 [:: 정규식] -->  (한 행에 여러 개 = AND)
// STALE      = [ ] 인데 probe 전부 초록 → 구현 흔적 검출: 검증 후 [x] + 증거를 남겨라.
// REGRESSION = [x] 인데 probe 실패     → 구현 흔적 소실(리네임/롤백 의심).
// 자동 [x] 전환은 하지 않는다(검증 없는 체크 금지) — 이 스크립트는 표식만 한다.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const root = process.cwd();
const docs = args.length ? args : ['docs/ROOM-BACKLOG.md', 'docs/DOGFOOD-AUDIT-2026-07.md'];

const PROBE_RE = /<!--\s*probe:\s*([^:>]+?)(?:\s*::\s*(.*?))?\s*-->/g;
let stale = 0;
let regression = 0;
let watched = 0;

for (const docRel of docs) {
  const docAbs = path.join(root, docRel);
  if (!fs.existsSync(docAbs)) {
    console.error(`skip (없음): ${docRel}`);
    continue;
  }
  const lines = fs.readFileSync(docAbs, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const box = line.match(/^\s*-\s\[( |x)\]/);
    if (!box) return;
    const probes = [...line.matchAll(PROBE_RE)];
    if (!probes.length) return;
    watched++;
    const ok = probes.every(([, file, re]) => {
      const p = path.join(root, file.trim());
      if (!fs.existsSync(p)) return false;
      return re ? new RegExp(re).test(fs.readFileSync(p, 'utf8')) : true;
    });
    const checked = box[1] === 'x';
    const label = line.replace(PROBE_RE, '').trim().slice(0, 90);
    if (!checked && ok) {
      stale++;
      console.log(`STALE  ${docRel}:${i + 1} 구현 흔적 검출·미체크 → 검증 후 [x]: ${label}`);
    }
    if (checked && !ok) {
      regression++;
      console.log(`REGRESSION  ${docRel}:${i + 1} 체크됨·probe 실패: ${label}`);
    }
  });
}

console.log(`docs:drift — probe 행 ${watched} · STALE ${stale} · REGRESSION ${regression}`);
process.exit(stale + regression ? 1 : 0);
