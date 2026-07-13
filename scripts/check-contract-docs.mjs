#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const health = args.includes('--health') || args.includes('--report');
const rootArg = args.find((arg) => !arg.startsWith('-'));
const root = path.resolve(rootArg ?? process.cwd());

const failures = [];
const strictFailures = [];
const warnings = [];

function relPath(...parts) {
  return path.join(...parts);
}

function abs(rel) {
  return path.join(root, rel);
}

function read(rel) {
  return fs.readFileSync(abs(rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(abs(rel));
}

function fail(message) {
  failures.push(message);
}

function strictFail(message) {
  strictFailures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function assertFile(rel) {
  if (!exists(rel)) fail(`missing file: ${rel}`);
}

function walkFiles(dirRel, predicate, out = []) {
  const dir = abs(dirRel);
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relPath(dirRel, entry.name);
    if (entry.isDirectory()) walkFiles(rel, predicate, out);
    else if (predicate(rel)) out.push(rel);
  }
  return out;
}

function lineCount(rel) {
  return read(rel).split(/\r?\n/).length;
}

const DATA_SCHEMA_MANIFEST = 'docs/schema/manifest.json';

function schemaModulePaths() {
  const manifest = JSON.parse(read(DATA_SCHEMA_MANIFEST));
  return manifest.modules.map((file) => relPath('docs', 'schema', file));
}

function readDataSchema() {
  return schemaModulePaths().map((rel) => read(rel)).join('');
}

function activeMarkdownDocs() {
  return walkFiles('docs', (rel) => rel.endsWith('.md') && !rel.startsWith('docs/archive/'));
}

function extractFeatureIds(markdown) {
  const ids = new Set();
  for (const match of markdown.matchAll(/\|\s*(?:★\s*)?([A-Z]+-\d+[a-z]?)\s*\|/g)) {
    ids.add(match[1]);
  }
  return [...ids].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

function hasFeatureId(markdown, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9-])${escaped}([^A-Z0-9-]|$)`).test(markdown);
}

function contractFiles() {
  const dir = abs(relPath('docs', 'contracts'));
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md') && file !== '_INDEX.md')
    .sort();
}

function stateMachineFiles() {
  const dir = abs(relPath('docs', 'state-machines'));
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md') && file !== '_INDEX.md')
    .sort();
}

function tableRowsWith(markdown, pattern) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|') && pattern.test(line));
}

function gapStatusCounts(markdown) {
  const counts = {};
  const rows = markdown
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\*{0,2}G-\d+\*{0,2}\s*\|/.test(line));
  for (const row of rows) {
    const status = [...row.matchAll(/`([A-Z_]+)`/g)].at(-1)?.[1] ?? 'UNKNOWN';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function unresolvedP1Pending(markdown) {
  const pendingStart = markdown.indexOf('## PENDING');
  if (pendingStart === -1) return [];
  const pending = markdown.slice(pendingStart);
  const p2Start = pending.indexOf('### P2');
  const activePending = p2Start === -1 ? pending : pending.slice(0, p2Start);
  return activePending
    .split(/\r?\n/)
    .filter((line) => /^\s*-\s*\[\s\]/.test(line));
}

function topLargestDocs(limit = 10) {
  return activeMarkdownDocs()
    .map((rel) => ({ rel, lines: lineCount(rel) }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, limit);
}

// 문서 크기 임계 (doc-health-check 스킬 기준). 경고 전용 — 게이트를 실패시키지 않는다.
const SIZE_THRESHOLDS = { review: 800, rotate: 1500 };

function oversizedDocs() {
  return activeMarkdownDocs()
    .map((rel) => ({ rel, lines: lineCount(rel) }))
    .filter((doc) => doc.lines > SIZE_THRESHOLDS.review)
    .map((doc) => ({
      ...doc,
      level: doc.lines > SIZE_THRESHOLDS.rotate ? 'ROTATE' : 'REVIEW',
    }))
    .sort((a, b) => b.lines - a.lines);
}

function makeHealthReport(metrics) {
  const gate = metrics.strictBlockers.length === 0 ? 'READY' : 'BLOCKED';
  const generatedDate = new Date().toISOString().slice(0, 10);
  const blockerRows = metrics.strictBlockers.length === 0
    ? '| - | - |\n'
    : metrics.strictBlockers.map((item) => `| blocker | ${item.replaceAll('|', '\\|')} |`).join('\n') + '\n';
  const warningRows = metrics.warnings.length === 0
    ? '| - | - |\n'
    : metrics.warnings.slice(0, 20).map((item) => `| warning | ${item.replaceAll('|', '\\|')} |`).join('\n') + '\n';
  const largestRows = metrics.largestDocs
    .map((item) => `| \`${item.rel}\` | ${item.lines} |`)
    .join('\n');
  const oversizedRows = metrics.oversizedDocs.length === 0
    ? '| - | - | - |\n'
    : metrics.oversizedDocs
        .map((item) => `| ${item.level} | \`${item.rel}\` | ${item.lines} |`)
        .join('\n') + '\n';
  const rotateCount = metrics.oversizedDocs.filter((d) => d.level === 'ROTATE').length;

  return `# CONTRACT-HEALTH — 계약 문서 건강 리포트

> Status: ${gate}
> Generated by: \`npm run docs:health\`
> Updated: ${generatedDate}

## Gate Summary

| Check | Result |
|---|---|
| Default contract check | ${metrics.defaultFailures === 0 ? 'PASS' : `FAIL (${metrics.defaultFailures})`} |
| Strict implementation gate | ${gate} (${metrics.strictBlockers.length} blockers) |
| Feature ID map coverage | ${metrics.mappedFeatureIds}/${metrics.featureIds} |
| Contract completeness | ${metrics.completeContracts}/${metrics.contracts} |
| Store matrix coverage | ${metrics.storeMatrixContracts}/${metrics.contracts} |
| Forbidden live aliases | ${metrics.forbiddenAliases} |

## Inventory

| Area | Count |
|---|---:|
| Markdown docs | ${metrics.docs} |
| Total doc lines | ${metrics.totalDocLines} |
| Feature IDs | ${metrics.featureIds} |
| Contract files | ${metrics.contracts} |
| State machine files | ${metrics.stateMachines} |
| DATA-SCHEMA CREATE TABLE refs | ${metrics.createTables} |

## GAP Status

| Status | Count |
|---|---:|
${Object.entries(metrics.gapStatusCounts).sort().map(([status, count]) => `| ${status} | ${count} |`).join('\n')}

## Strict Blockers

| Type | Detail |
|---|---|
${blockerRows}
## Warnings

| Type | Detail |
|---|---|
${warningRows}
## Largest Docs

| File | Lines |
|---|---:|
${largestRows}

## Oversized Docs (경고 · 비게이트)

> 기준(doc-health-check 스킬): REVIEW > ${SIZE_THRESHOLDS.review}줄, ROTATE > ${SIZE_THRESHOLDS.rotate}줄(archive 회전 권장).
> 이 섹션은 **경고 전용**이며 \`docs:check\`를 실패시키지 않는다. 현재 ROTATE 대상 ${rotateCount}건.

| Level | File | Lines |
|---|---|---:|
${oversizedRows}
## Operating Rule

- \`npm run docs:check\`: 문서 구조 기본 게이트. 항상 PASS 상태를 유지한다.
- \`npm run docs:check:strict\`: 구현 착수 게이트. \`계약 공백\`, active PENDING, BLOCKED gap이 있으면 실패한다.
- \`npm run docs:health\`: 현재 계약망 상태를 사람이 읽는 리포트로 출력한다.
`;
}

const requiredFiles = [
  'docs/FEATURE-SPEC.md',
  'docs/FEATURE-CONTRACT-MAP.md',
  'docs/STORE-DEPENDENCY-MATRIX.md',
  'docs/contracts/_INDEX.md',
  'docs/state-machines/_INDEX.md',
  'docs/DATA-SCHEMA.md',
  'docs/schema/_INDEX.md',
  DATA_SCHEMA_MANIFEST,
  'docs/GAP-MATRIX.md',
];

if (exists(DATA_SCHEMA_MANIFEST)) {
  for (const file of schemaModulePaths()) requiredFiles.push(file);
}

for (const file of requiredFiles) assertFile(file);

let metrics = {
  defaultFailures: 0,
  strictBlockers: strictFailures,
  warnings,
  docs: 0,
  totalDocLines: 0,
  featureIds: 0,
  mappedFeatureIds: 0,
  contracts: 0,
  completeContracts: 0,
  storeMatrixContracts: 0,
  stateMachines: 0,
  createTables: 0,
  gapStatusCounts: {},
  forbiddenAliases: 0,
  largestDocs: [],
  oversizedDocs: [],
};

if (failures.length === 0) {
  const docs = activeMarkdownDocs();
  metrics.docs = docs.length;
  metrics.totalDocLines = docs.reduce((sum, rel) => sum + lineCount(rel), 0);
  metrics.largestDocs = topLargestDocs();
  metrics.oversizedDocs = oversizedDocs();

  const featureIds = extractFeatureIds(read('docs/FEATURE-SPEC.md'));
  const featureMap = read('docs/FEATURE-CONTRACT-MAP.md');
  metrics.featureIds = featureIds.length;
  metrics.mappedFeatureIds = featureIds.filter((id) => hasFeatureId(featureMap, id)).length;
  for (const id of featureIds) {
    if (!hasFeatureId(featureMap, id)) fail(`FEATURE-CONTRACT-MAP missing ${id}`);
  }

  const storeMatrix = read('docs/STORE-DEPENDENCY-MATRIX.md');
  const contracts = contractFiles();
  metrics.contracts = contracts.length;
  metrics.stateMachines = stateMachineFiles().length;
  metrics.createTables = (readDataSchema().match(/\bCREATE\s+TABLE\b/gi) ?? []).length;

  for (const file of contracts) {
    const rel = relPath('docs', 'contracts', file);
    const body = read(rel);
    const checks = [
      ['Props', /(^|\n)#{2,4}\s+.*Props|Props Interface|interface\s+\w+Props/],
      ['Store', /Store 의존|Store Matrix|store/i],
      ['DataChannel', /DataChannel 의존성|DataChannel 타입|DataChannel/i],
      ['MUST NOT', /MUST NOT|금지 사항/],
    ];

    const missing = checks.filter(([, pattern]) => !pattern.test(body)).map(([label]) => label);
    if (missing.length === 0) metrics.completeContracts += 1;
    for (const label of missing) fail(`${rel} missing ${label} section`);

    if (storeMatrix.includes(`\`${file}\``)) metrics.storeMatrixContracts += 1;
    else fail(`STORE-DEPENDENCY-MATRIX missing ${file}`);
  }

  const aliasTargets = [
    ...contracts.map((file) => relPath('docs', 'contracts', file)),
    ...stateMachineFiles().map((file) => relPath('docs', 'state-machines', file)),
  ];

  const forbidden = [
    [/stageStore\.setMode\(['"]dubbing['"]\)/, "stageStore mode must use 'dub', not 'dubbing'"],
    [/stageStore\.mode[^\n]*(?:['"`]dubbing['"`]|dubbing\s*여부)/, "stageStore mode docs must say 'dub', not 'dubbing'"],
    [/\bcredit_balance\b/, 'credits must use credits.balance, not credit_balance'],
  ];

  for (const rel of aliasTargets) {
    const body = read(rel);
    const lines = body.split(/\r?\n/);
    for (const [pattern, message] of forbidden) {
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          metrics.forbiddenAliases += 1;
          fail(`${rel}:${index + 1} ${message}`);
        }
      });
    }
  }

  const gapMatrix = read('docs/GAP-MATRIX.md');
  metrics.gapStatusCounts = gapStatusCounts(gapMatrix);

  const contractGapRows = tableRowsWith(featureMap, /계약 공백/);
  for (const row of contractGapRows) strictFail(`FEATURE-CONTRACT-MAP contract gap: ${row}`);

  for (const row of gapMatrix.split(/\r?\n/).filter((line) => /^\|\s*\*{0,2}G-\d+\*{0,2}\s*\|/.test(line) && /`BLOCKED`/.test(line))) {
    strictFail(`GAP-MATRIX blocked item: ${row}`);
  }

  for (const row of unresolvedP1Pending(readDataSchema())) {
    strictFail(`DATA-SCHEMA active pending item: ${row}`);
  }

  const uncertaintyRows = [
    ...aliasTargets,
    ...schemaModulePaths(),
    'docs/GAP-MATRIX.md',
  ].flatMap((rel) => {
    const body = read(rel);
    return body.split(/\r?\n/)
      .map((line, index) => ({ rel, line, index: index + 1 }))
      .filter(({ line }) => /미정|미구현|TBD|TODO/.test(line))
      .map(({ rel: file, line, index }) => `${file}:${index} ${line.trim()}`);
  });
  for (const item of uncertaintyRows.slice(0, 20)) warn(item);
}

metrics.defaultFailures = failures.length;
metrics.strictBlockers = strictFailures;

if (health) {
  console.log(makeHealthReport(metrics));
}

if (failures.length > 0 || (strict && strictFailures.length > 0)) {
  const label = strict ? 'contract-docs strict check FAILED' : 'contract-docs check FAILED';
  console.error(label);
  for (const failure of failures) console.error(`- ${failure}`);
  if (strict) {
    for (const failure of strictFailures) console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (!health) {
  console.log(strict ? 'contract-docs strict check PASS' : 'contract-docs check PASS');
}
