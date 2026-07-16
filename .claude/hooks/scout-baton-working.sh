#!/usr/bin/env bash
# Auto-flip the SCOUT baton to WORKING on the first code edit of a session.
# Honors global CLAUDE.md: "코딩을 시작하면 state:를 WORKING으로". Only the one line.
# Idempotent + safe: flips ONLY from SCOUT_READY; no-op on WORKING/DONE/BLOCKED or missing file.
# Never fails the tool call.
set +e

F="docs/status/SCOUT.md"
[ -f "$F" ] || F="SCOUT.md"
[ -f "$F" ] || exit 0

first_state=$(grep -m1 -E '^state:' "$F" 2>/dev/null | tr -d '[:space:]')
if [ "$first_state" = "state:SCOUT_READY" ]; then
  awk 'BEGIN{done=0} /^state:/ && !done {sub(/SCOUT_READY/,"WORKING"); done=1} {print}' "$F" > "$F.baton.tmp" 2>/dev/null \
    && mv "$F.baton.tmp" "$F" 2>/dev/null \
    && echo "[scout-baton] state: SCOUT_READY -> WORKING (auto, first edit)"
fi
exit 0
