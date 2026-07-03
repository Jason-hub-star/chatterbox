#!/usr/bin/env bash
# Stop 훅 — 턴 종료 시 계약-코드 정합 게이트.
# working tree 에 변경이 있고 `docs:check` 가 실패하면 종료를 막는다(exit 2 → 모델이 문서를 맞춘 뒤 끝내게).
# clean tree 면 검사할 게 없어 즉시 통과(0토큰). 무한루프는 stop_hook_active 로 방지.
set -uo pipefail

input=$(cat)
# 이미 이 훅으로 재진입(블록 후 재시도) 중이면 재차단하지 않는다.
case "$input" in
  *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;;
esac

proj="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$proj" || exit 0

# working tree 가 깨끗하면(모든 변경 커밋됨) 검사할 게 없다 — 대화/무변경 턴은 즉시 통과.
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  exit 0
fi

log=$(npm run docs:check 2>&1)
if [ $? -eq 0 ]; then
  exit 0
fi

{
  echo "⛔ docs:check 실패 — 계약-코드 정합이 깨진 채로 턴을 끝낼 수 없습니다. 문서를 맞춘 뒤 종료하세요."
  echo "$log" | tail -n 20
} >&2
exit 2
