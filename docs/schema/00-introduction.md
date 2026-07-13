---
tags: [hub]
---

# Data Schema — snack-web Supabase + LiveKit Protocol

> Derived from state-machines/_INDEX.md and PLATFORM-ARCHITECTURE.md
> Updated: 2026-07-01 · P0 보안 감사 반영: room_secrets/room_invites 분리, RLS room 상관 검증, R2 signed URL 원칙 · 토큰 무효화 주석 §1.3 (G-37·G-44) · 녹화/DUB 동의 §1.11·§1.12 (G-39·G-43) · 메시지 멱등성 §1.6 (C5) · 멀티탭 정책 §1.3 (C17·G-51) · chat seq §2.3 · authority_epoch 12타입 §2.1 (G-45) · R2 Cascade §1.2 (G-50) · obs_viewer_tokens §1.17은 P2 방송 송출 옵션 전용 · DataChannel SSOT 4개(`room-authority`, `chat`, `script-cue`, `blendshape`)
<!-- opencode: 2026-06-29 - §1.17 obs_viewer_tokens 테이블 신설 (OBS P2 방송 송출 옵션, 비인증 뷰어 차단). Coded with OpenCode; high-cost model review recommended. -->

---

