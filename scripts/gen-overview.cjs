#!/usr/bin/env node
/**
 * gen-overview.js
 * GAP-MATRIX.md + contracts/_INDEX.md를 읽어
 * docs/meeting/platform-overview.html의 동적 섹션을 갱신한다.
 *
 * 갱신 대상:
 *   - 상단 통계 (계약서 수·상태머신 수·DB 테이블 수)
 *   - GAP 항목별 상태 배지 (DONE/TODO/LATER/RESEARCH)
 *   - "다음 할 일" 우선순위 블록
 *   - 문서 준비 현황 진행바 %
 *   - 마지막 업데이트 날짜
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..', 'docs');
const GAP_FILE = path.join(ROOT, 'GAP-MATRIX.md');
const IDX_FILE = path.join(ROOT, 'contracts', '_INDEX.md');
const SM_DIR   = path.join(ROOT, 'state-machines');
const HTML_IN  = path.join(ROOT, 'meeting', 'platform-overview.html');

// ── 1. 파싱 ──────────────────────────────────────────────

function parseGapMatrix(src) {
  const gaps = {};
  const re = /\|\s*(G-\d+)\s*\|[^|]+\|[^|]+\|[^|]+\|\s*`(\w+)`\s*\|/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    gaps[m[1]] = m[2]; // e.g. { 'G-01': 'DONE', 'G-12': 'RESEARCH' }
  }
  return gaps;
}

function parseContractCount(src) {
  // 헤더 "N개 핵심" 또는 목록 행 수로 계산
  const headerMatch = src.match(/##\s+컴포넌트 목록\s+\((\d+)개\)/);
  if (headerMatch) return parseInt(headerMatch[1], 10);
  // 폴백: | [...](*.md) | 패턴 행 수
  return (src.match(/\|\s*\[.*?\.md\]/g) || []).length;
}

function parseTableCount(src) {
  // DATA-SCHEMA의 ### 1.N 패턴 수
  const schemaFile = path.join(ROOT, 'docs', 'DATA-SCHEMA.md');
  if (!fs.existsSync(schemaFile)) return 16;
  const schema = fs.readFileSync(schemaFile, 'utf8');
  return (schema.match(/^### 1\.\d+/gm) || []).length;
}

function countStateMachines() {
  if (!fs.existsSync(SM_DIR)) return 0;
  return fs.readdirSync(SM_DIR).filter(f => f.endsWith('.md') && f !== '_INDEX.md').length;
}

// ── 2. 상태 → CSS 클래스/라벨 매핑 ──────────────────────

const STATUS_MAP = {
  DONE:     { cls: 'badge-spec',  label: '스펙 완료' },
  TODO:     { cls: 'badge-wip',   label: '작업 필요' },
  RESEARCH: { cls: 'badge-wip',   label: '조사 중' },
  LATER:    { cls: 'badge-later', label: 'LATER' },
  BLOCKED:  { cls: 'badge-wip',   label: 'BLOCKED' },
};

function statusBadge(status) {
  const s = STATUS_MAP[status] || STATUS_MAP.LATER;
  return `<span class="page-status-badge ${s.cls}" data-gap-status="${status}">${s.label}</span>`;
}

function docChipClass(status) {
  if (status === 'DONE') return 'doc-done';
  if (status === 'LATER') return 'doc-later';
  return 'doc-todo';
}

// ── 3. 진행률 계산 ──────────────────────────────────────

function calcProgress(gaps) {
  const all  = Object.values(gaps);
  const done = all.filter(s => s === 'DONE').length;
  return all.length ? Math.round((done / all.length) * 100) : 0;
}

// ── 4. HTML 패치 ─────────────────────────────────────────

/**
 * HTML 안의 data-gen-* 마커를 교체.
 * 마커 형식:
 *   <!-- GEN:stat:contracts -->20<!-- /GEN -->
 *   <!-- GEN:gap:G-01 -->...<!-- /GEN -->
 *   <!-- GEN:progress -->88<!-- /GEN -->
 *   <!-- GEN:date -->2026-06-29<!-- /GEN -->
 */
function patch(html, key, value) {
  const re = new RegExp(`<!-- GEN:${key} -->[\\s\\S]*?<!-- /GEN -->`, 'g');
  const replacement = `<!-- GEN:${key} -->${value}<!-- /GEN -->`;
  if (re.test(html)) {
    return html.replace(new RegExp(`<!-- GEN:${key} -->[\\s\\S]*?<!-- /GEN -->`, 'g'), replacement);
  }
  return html; // 마커 없으면 그냥 반환 (첫 실행 시 마커 삽입은 아래에서)
}

// ── 5. 마커가 없는 초기 HTML에 마커 삽입 ────────────────

function injectMarkers(html, stats, gaps) {
  // 통계 숫자 4개
  html = html.replace(
    /(<div class="stat-num">)(\d+)(<\/div>\s*<div class="stat-label">계약서)/,
    `$1<!-- GEN:stat:contracts -->${stats.contracts}<!-- /GEN -->$3`
  );
  html = html.replace(
    /(<div class="stat-num">)(\d+)(<\/div>\s*<div class="stat-label">상태머신)/,
    `$1<!-- GEN:stat:sm -->${stats.sm}<!-- /GEN -->$3`
  );
  html = html.replace(
    /(<div class="stat-num">)(\d+)(<\/div>\s*<div class="stat-label">DB 테이블)/,
    `$1<!-- GEN:stat:tables -->${stats.tables}<!-- /GEN -->$3`
  );

  // 진행바 width
  html = html.replace(
    /(class="progress-fill" style="width:)(\d+)(%")/,
    `$1<!-- GEN:progress -->${stats.progress}<!-- /GEN -->$3`
  );

  // 날짜
  const today = new Date().toISOString().slice(0, 10);
  html = html.replace(
    /(팀 현황판 · )(\d{4}-\d{2}-\d{2})/,
    `$1<!-- GEN:date -->${today}<!-- /GEN -->`
  );

  return html;
}

function updateMarkers(html, stats, gaps) {
  // 통계
  html = patch(html, 'stat:contracts',  stats.contracts);
  html = patch(html, 'stat:sm',         stats.sm);
  html = patch(html, 'stat:tables',     stats.tables);
  html = patch(html, 'stat:completion', stats.completion);
  html = patch(html, 'progress',        stats.progress);
  html = patch(html, 'date',            new Date().toISOString().slice(0, 10));

  // GAP 상태
  for (const [id, status] of Object.entries(gaps)) {
    html = patch(html, `gap:${id}`, status);
  }

  return html;
}

// ── 6. GAP 상태 배지 인라인 갱신 ────────────────────────
// data-gap="G-xx" 속성이 있는 요소를 찾아 상태 텍스트와 클래스 갱신

function updateGapBadges(html, gaps) {
  for (const [id, status] of Object.entries(gaps)) {
    const s = STATUS_MAP[status] || STATUS_MAP.LATER;
    // <span class="page-status-badge ..." data-gap="G-xx">...</span>
    html = html.replace(
      new RegExp(
        `(<span class="page-status-badge [^"]*" data-gap="${id}">)[^<]*(</span>)`,
        'g'
      ),
      (_, open, close) => {
        const updated = open.replace(
          /class="page-status-badge [^"]*"/,
          `class="page-status-badge ${s.cls}"`
        );
        return `${updated}${s.label}${close}`;
      }
    );

    // doc-chip data-gap="G-xx"
    html = html.replace(
      new RegExp(
        `(<span class="doc-chip [^"]*" data-gap="${id}">)[^<]*(</span>)`,
        'g'
      ),
      (_, open, close) => {
        const updated = open.replace(
          /class="doc-chip [^"]*"/,
          `class="doc-chip ${docChipClass(status)}"`
        );
        return `${updated}${close}`;
      }
    );
  }
  return html;
}

// ── 7. "다음 할 일" 블록 갱신 ───────────────────────────

function buildNextItems(gaps) {
  const urgent = [], normal = [], later = [];

  if (gaps['G-12'] !== 'DONE') normal.push({ title: '아바타 포맷 최종 확정 (G-12)', desc: 'PNG 파츠 리그 vs Live2D 최종 선택. 아바타 렌더링 구현 전 필수.', tag: 'docs/specs/rig-format.md' });
  if (gaps['G-18'] !== 'DONE') later.push({ title: 'DUB 계약서 4개 (G-18)',       desc: 'DubSessionSelector·RoleAssigner·Recorder·Compositor.',      tag: 'G-18 · LATER' });
  if (gaps['G-19'] !== 'DONE') later.push({ title: 'LOB-06 예약 공연 계약 (G-19)', desc: '방 예약 시스템 컴포넌트 계약서.',                           tag: 'G-19 · LATER' });
  if (gaps['G-20'] !== 'DONE') later.push({ title: 'LOB-07 게스트 데모 (G-20)',    desc: '비로그인 30초 미리보기 계약서.',                            tag: 'G-20 · LATER' });

  // 고정 필수 항목
  urgent.push({ title: '① Supabase DB 마이그레이션 실행',  desc: 'DATA-SCHEMA.md의 16개 테이블 SQL 적용. RLS 정책 포함.',       tag: 'docs/DATA-SCHEMA.md' });
  urgent.push({ title: '② LiveKit Edge Function 배포',      desc: 'supabase functions deploy livekit-token. .env 설정 필요.',    tag: 'docs/specs/livekit-edge-fn.md' });
  normal.push({ title: '③ 인증·로비·분장실 구현 시작',     desc: '스펙 완료. AuthPage → LobbyPage → GreenRoom 순서로 코딩.',   tag: 'contracts/' });
  normal.push({ title: '④ GPT Image 2 배경 씬 생성',        desc: 'scene-prompts.md 프롬프트로 씬 3종 생성 → Storage 업로드.', tag: 'design/scene-prompts.md' });
  normal.push({ title: '⑤ 온보딩 컨셉 영상 제작',          desc: '15~20초 시네마틱 인트로. fal.ai Seedance 2.0 활용.',         tag: 'ONBOARDING-FLOW.md §6' });
  later.push({ title: '커스텀 아이콘·Lottie 제작',          desc: '22×22px SVG 12개 + Lottie 6개. AI 슬롭 방지.',              tag: 'ux-layout-picker.html' });

  const renderCard = (item, cls) => `
    <div class="next-card ${cls}">
      <div class="next-title">${item.title}</div>
      <div class="next-desc">${item.desc}</div>
      <div class="next-tag">${item.tag}</div>
    </div>`;

  return [
    ...urgent.map(i => renderCard(i, 'urgent')),
    ...normal.map(i => renderCard(i, 'normal')),
    ...later.map(i => renderCard(i, 'later')),
  ].join('\n');
}

// ── 8. 메인 ─────────────────────────────────────────────

function main() {
  if (!fs.existsSync(GAP_FILE)) { console.error('GAP-MATRIX.md not found'); process.exit(1); }
  if (!fs.existsSync(HTML_IN))  { console.error('platform-overview.html not found'); process.exit(1); }

  const gapSrc  = fs.readFileSync(GAP_FILE, 'utf8');
  const idxSrc  = fs.existsSync(IDX_FILE) ? fs.readFileSync(IDX_FILE, 'utf8') : '';

  const gaps = parseGapMatrix(gapSrc);
  const stats = {
    contracts:  parseContractCount(idxSrc),
    sm:         countStateMachines(),
    tables:     parseTableCount(),
    progress:   calcProgress(gaps),
    completion: 0, // 코드 구현 완성도 — 구현 진행 시 수동 갱신
  };

  let html = fs.readFileSync(HTML_IN, 'utf8');

  // 마커가 없으면 삽입 (최초 1회)
  const hasMarkers = html.includes('<!-- GEN:');
  if (!hasMarkers) {
    html = injectMarkers(html, stats, gaps);
  } else {
    html = updateMarkers(html, stats, gaps);
  }

  // data-gap 배지 갱신
  html = updateGapBadges(html, gaps);

  // "다음 할 일" 블록 교체 (GEN:next-grid 마커)
  const nextHtml = buildNextItems(gaps);
  if (html.includes('<!-- GEN:next-grid -->')) {
    html = patch(html, 'next-grid', nextHtml);
  }

  fs.writeFileSync(HTML_IN, html, 'utf8');

  console.log(`[gen-overview] ✓ platform-overview.html 갱신 완료`);
  console.log(`  계약서: ${stats.contracts}개 | 상태머신: ${stats.sm}개 | 테이블: ${stats.tables}개 | 진행률: ${stats.progress}%`);
  console.log(`  GAP 항목: ${Object.keys(gaps).length}개 (DONE: ${Object.values(gaps).filter(s=>s==='DONE').length}개)`);
}

main();
