/**
 * marketingPiiGuard — 마케팅 콘텐츠 발행 직전 PII 검사기
 * 잠금 L11: 사용자명·반려견명·정확한 일시·세부 견종 발견 시 발행 차단 + 텔레그램 알림
 * 출처: /Users/family/.claude/plans/unified-finding-yao.md §3.7 (C1B.6)
 *
 * 기존 _shared/piiGuard.ts는 일반 로깅용. 본 파일은 외부 발행 전 콘텐츠 검사 전용.
 */

export interface PiiCheckResult {
  ok: boolean;
  violations: Array<{
    type: 'korean_name' | 'specific_date' | 'specific_breed' | 'phone' | 'email';
    snippet: string;
    position: number;
  }>;
}

// 한글 이름 패턴 — 2~4자 한글 (성+이름)
// 단순 패턴 매칭이라 false positive 가능, 운영에서 화이트리스트 추가 가능
const KOREAN_NAME_RE = /[가-힣]{2,4}(?:[\s,.　])/g;

// 특정 일시 패턴 — "2026년 5월 22일", "5/22", "2026-05-22" 등
const SPECIFIC_DATE_RE = /(?:\d{4}[-./년\s]+\d{1,2}[-./월\s]+\d{1,2}[일]?|\d{1,2}[-./]\d{1,2}\b)/g;

// 특정 견종 패턴 — 노출 금지 (소/중/대형견으로만 카테고리화)
const SPECIFIC_BREED_RE =
  /(?:골든리트리버|리트리버|푸들|포메라니안|말티즈|시추|치와와|진돗개|삽살개|비글|허스키|닥스훈트|불독|코카스파니엘|요크셔테리어|시바|보더콜리|로트와일러|도베르만)/g;

const PHONE_RE = /(?:01[016789][-\s]?\d{3,4}[-\s]?\d{4}|\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4})/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// 화이트리스트 — 운영자명, 트레이너명, 공식 사용 가능 명칭
const ALLOWED_KOREAN_NAMES = new Set([
  '김주영', // 운영자
  '메이', // mungmungfit 캐릭터 (양사이트 공통)
  'CSCC',
]);

export function checkMarketingContent(content: string): PiiCheckResult {
  const violations: PiiCheckResult['violations'] = [];

  // 한글 이름 검사
  let match: RegExpExecArray | null;
  KOREAN_NAME_RE.lastIndex = 0;
  while ((match = KOREAN_NAME_RE.exec(content)) !== null) {
    const name = match[0].replace(/[\s,.　]/g, '');
    if (!ALLOWED_KOREAN_NAMES.has(name)) {
      violations.push({ type: 'korean_name', snippet: match[0], position: match.index });
    }
  }

  // 특정 일시 검사
  SPECIFIC_DATE_RE.lastIndex = 0;
  while ((match = SPECIFIC_DATE_RE.exec(content)) !== null) {
    violations.push({ type: 'specific_date', snippet: match[0], position: match.index });
  }

  // 특정 견종 검사
  SPECIFIC_BREED_RE.lastIndex = 0;
  while ((match = SPECIFIC_BREED_RE.exec(content)) !== null) {
    violations.push({ type: 'specific_breed', snippet: match[0], position: match.index });
  }

  // 전화·이메일 검사
  PHONE_RE.lastIndex = 0;
  while ((match = PHONE_RE.exec(content)) !== null) {
    violations.push({ type: 'phone', snippet: match[0], position: match.index });
  }
  EMAIL_RE.lastIndex = 0;
  while ((match = EMAIL_RE.exec(content)) !== null) {
    violations.push({ type: 'email', snippet: match[0], position: match.index });
  }

  return { ok: violations.length === 0, violations };
}

/**
 * 콘텐츠 발행 직전 호출 — 위배 발견 시 throw해서 발행 중단
 */
export function assertMarketingContentSafe(content: string, contentLabel: string): void {
  const result = checkMarketingContent(content);
  if (!result.ok) {
    const summary = result.violations
      .slice(0, 5)
      .map((v) => `[${v.type}] "${v.snippet}" @${v.position}`)
      .join('; ');
    throw new Error(
      `PII violation in ${contentLabel} — L11 잠금 위배: ${summary} (total ${result.violations.length})`
    );
  }
}
