#!/usr/bin/env bash
# ChatterBox 로컬 검증 하네스 셋업.
# 사용: bash setup-local.sh <SCRATCH_DIR>
# 결과: $SCRATCH/sb.env(키·값 미출력)·fn.env(더미)·node_modules 심링크·functions serve 재기동.
set -euo pipefail

SCRATCH="${1:?SCRATCH 디렉터리를 인자로 주세요}"
PROJ="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
mkdir -p "$SCRATCH"

# 1) 키를 파일로만 (stdout 으로 값 출력하지 않음)
if ! supabase status -o env > "$SCRATCH/sb.env" 2>/dev/null; then
  echo "supabase 로컬 스택 미기동 — 'supabase start' 먼저 실행하세요." >&2
  exit 1
fi
echo "sb.env 작성됨 (vars: $(grep -oE '^[A-Z_]+' "$SCRATCH/sb.env" | tr '\n' ' '))"

# 2) fn.env: 진짜 외부 시크릿만. SUPABASE_* 절대 금지(serve 자동주입과 충돌).
if [ ! -f "$SCRATCH/fn.env" ]; then
  printf 'OPENAI_API_KEY=sk-dummy-not-used\n' > "$SCRATCH/fn.env"
  echo "fn.env 생성(더미). 실제 STT/외부 API 검증 시 진짜 키로 교체."
fi

# 3) node_modules 심링크 (.mjs 의 bare ESM import 해결)
ln -sfn "$PROJ/node_modules" "$SCRATCH/node_modules"
test -e "$SCRATCH/node_modules/@supabase/supabase-js" && echo "node_modules 링크 OK"

# 4) functions serve 재시작 (신규 함수 등록 위해 pkill 필수)
pkill -f "supabase functions serve" 2>/dev/null || true
sleep 1
nohup supabase functions serve --no-verify-jwt --env-file "$SCRATCH/fn.env" > "$SCRATCH/serve.log" 2>&1 &
echo "serve pid $!"

# 5) 준비 대기 (기존 함수 create-room 으로 확인)
API_URL="$(grep '^API_URL' "$SCRATCH/sb.env" | cut -d= -f2- | tr -d '"')"
for i in $(seq 1 40); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$API_URL/functions/v1/create-room" || true)"
  if [ "$code" = "200" ]; then echo "serve ready after ${i}s"; break; fi
  sleep 1
done

echo "완료. 키: $SCRATCH/sb.env (API_URL·ANON_KEY·SERVICE_ROLE_KEY)"
echo "테스트 실행 예: set -a; . $SCRATCH/sb.env; set +a; export SUPABASE_URL=\"\$API_URL\"; cd $SCRATCH && node <test>.mjs"
