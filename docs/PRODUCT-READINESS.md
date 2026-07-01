---
tags: [hub, guide]
---

# Product Readiness — UX, Trust, Ops Launch Gate

> SSOT for user-facing readiness. Updated: 2026-06-30.
> Scope: usability, trust, security impact, operations, and launch blockers. This is not a replacement for [[PITCH-READINESS]]; pitch readiness focuses on judge evidence, while this document focuses on user experience and service safety.

## BLUF

The product docs are strong enough for Sprint 0 / PoC development. They are not yet enough for public launch.

The strongest parts are onboarding, GreenRoom, fallback thinking, mobile viewer routing, and safety transparency. The weak points are the landing-to-product gap, mobile actor limitations, cold start, rehearsal feedback, host failover UX, manual support/refund flows, and unverified P0 security implementation.

## Readiness Verdict

| Stage | Verdict | Reason |
|---|---|---|
| Sprint 0 development | Ready | Feature, contract, API, store, schema, and milestone docs are linked and pass strict checks |
| Pitch PoC | Conditionally ready | Needs 30s real browser E2E capture and security/unit-economics evidence |
| Closed alpha | Not yet | Needs auth/room/GreenRoom/LiveKit/RLS smoke, account trust flows, support channel setup |
| Public launch | Not ready | Needs implemented security gates, automated refund/export/delete, Japan legal/payment decisions |

## Strong UX Areas

| Area | What Works Well | Source |
|---|---|---|
| Onboarding | Invite fast-track, direct full onboarding, progressive returning-user path | [[ONBOARDING-FLOW]], [[AuthPage]], [[LobbyPage]] |
| GreenRoom | Avatar, mic, speaker, background preview before entry; static-avatar/voice/viewer fallback | [[GreenRoom]] |
| Mobile | Mobile is not hard-blocked; it is routed to viewer/chat/reaction mode | [[FEATURE-SPEC]], [[MobileViewer]] |
| Landing content | Copy and localization are centralized in `src/content/content.ts` / locales | [[CONTENT-GUIDE]], [[PROJECT-STATUS]] |
| Safety transparency | Camera/mic, recording badge, data location summary, report/block/appeal UI are specified | [[MODERATION-OPS]], [[SecurityPolicies]] |

## User-Facing Gaps

| Gap | User Impact | Severity | Current State | Required Fix |
|---|---|---|---|---|
| Landing does not lead to a live product | User feels excitement, then only sees waitlist/Tally | P0 pitch / P1 launch | Landing CTA points to preregistration | Add demo video/PoC CTA or always-on watch-only demo room |
| Temporary copy and missing share polish | Lower trust when shared to judges/users | P1 | `PROJECT-STATUS` notes `〔仮〕`, OG/favicon missing | Finalize copy, OG image, favicon, 404/meta |
| Mobile actor limitation | Japan mobile-first audience may feel excluded | P1 | Mobile MVP is viewer-only | Make mobile viewer excellent; state desktop actor positioning clearly |
| Cold start / empty room | Solo user may end in an empty room | P1 | Demo room and first-room template planned | Always-on demo room, seed rooms, templates, guided first script |
| No practice partner | Solo user cannot rehearse while waiting for friends | P1 | Demo room is watch-focused | Add public practice room or AI/recorded partner loop |
| Weak rehearsal feedback | Actor cannot tell if timing, overlap, or voice delivery worked | P1 | ROOM-14 covers mode/roles, not feedback | Add 10s replay, turn timing, overlap markers, reaction highlights |
| Tracking confidence unclear | User sees avatar moving but cannot judge if calibration is good enough | P1 | GreenRoom pass/fail exists | Add tracking quality gauge and expression replay |
| Host single failure point | Room feels fragile if host disconnects mid-performance | P1 | HostAuthority exists, UX details pending | Add temporary host, reconnect restoration, viewer-safe holding state |
| Seed content shortage | User reaches room creation but has no script or prompt to start with | P1 | First-room template planned | Seed 5-10 scripts with duration/difficulty/required roles |
| Account delete/export not implemented | Trust risk for privacy-sensitive users | P0 launch | Contract/API specified; implementation pending | Implement `data-export-request`, `soft_delete_user`, Settings UI |
| Refund is manual | Credit loss feels unsafe; operator error risk | P0 launch | API surface specifies automated refund; support doc still has manual fallback | Implement transactional refund Edge Function and support fallback only |
| Accessibility priority mismatch | Disabled users may be excluded | P1 launch | Accessibility policy exists; some feature priority is later | Minimum keyboard/focus/caption checks before alpha |

## Security Risks as User Harm

| Risk | User Harm | Launch Gate |
|---|---|---|
| LiveKit token weakness | Outsider can enter active room and hear/see participants | `livekit-token` smoke + block/disabled participant tests |
| RLS room mismatch | Other rooms' messages, recordings, VGEN jobs can leak | RLS automated tests for participant/non-participant |
| Password hash exposure | Private room can be brute-forced client-side | `room_secrets` server-only access verified |
| Invite code lifetime | Revoked/expired links may keep working | invite expiry/revocation/use-count tests |
| FAL key exposure | Cost abuse and provider account compromise | no `VITE_FAL_KEY`; VGEN only through Edge |
| R2 public URL | Recordings/generated assets leak outside allowed visibility | signed URL endpoint only |
| Audio uplink silence | User thinks they are heard but no one hears them | heartbeat/status indicator |
| WebGL context loss | Avatar freezes or ghost speaker appears | single Pixi Application strategy + recovery UI |
| Browser/network crash during recording | User loses performance or dub track | local backup recording chunks + resumable upload |
| Reaction abuse | Room UI overload and noisy experience | whitelist, TTL, rate limit |
| Onboarding token gate | Unready users enter room with wrong permissions | GreenRoom/onboarding token gate tests |
| MediaPipe COOP/COEP | Tracking or assets break due to cross-origin isolation | real-domain PoC before pitch/public demo |

## Operations Gaps

| Area | Current Plan | Gap | Fix |
|---|---|---|---|
| Support | Discord + Tally MVP; Japan channels planned | Discord is too narrow for general/Japan users | Add email form, X DM, LINE decision before Japan alpha |
| Moderation | Daily 10:00 KST review, 72h appeal SLA | No staffing/coverage plan | Name operator coverage and Japanese-language review path |
| Refund/account actions | Some docs still mention manual SQL fallback | Manual SQL is unsafe as normal operation | Use Edge Functions as default; SQL only break-glass |
| SRE/on-call | Monitoring and incident playbook exist | Role assignment/on-call not fixed | Add named owner for alpha windows |
| Japan legal | Checklist exists | APPI/age/二次創作/data residency unresolved | Gate Japan launch on legal review outputs |

## Priority Order

1. Landing proof path: expose either 30s E2E PoC video or always-on watch-only demo CTA.
2. Mobile viewer excellence: iOS Safari viewer, chat, reaction, audio-start UX.
3. Cold-start play path: public practice room, AI/recorded partner loop, and seed scripts.
4. Invitation quick path: link → OAuth → role → viewer/quick-ready → room in 15 seconds.
5. Trust flows: account delete, data export, automatic credit refund, local backup recording.
6. P0 security verification: LiveKit token, RLS, R2 signed URL, FAL Edge-only.
7. Japan readiness: age gate, 二次創作 policy, JPY/payment roadmap, local support channels.

## Go / No-Go Gates

### Sprint 0 Go

- [x] Feature/spec/contracts/API boundaries exist.
- [x] Strict docs gate passes.
- [x] ChatterBox scaffold path is defined.
- [ ] Actual scaffold created.

### Closed Alpha Go

- [ ] Auth login works.
- [ ] Two users join one room with LiveKit token.
- [ ] Non-participant RLS tests fail as expected.
- [ ] GreenRoom fallback is visible.
- [ ] Data export/delete UI is reachable or clearly labeled unavailable.
- [ ] Support intake channel is live.

### Public Launch Go

- [ ] All P0 security gates implemented and tested.
- [ ] R2 signed URL and provider secret boundaries verified.
- [ ] Credit refund is automatic and idempotent.
- [ ] Account deletion and data export are self-serve.
- [ ] Landing CTA truthfully separates live product, demo video, and waitlist.
- [ ] Japan launch items are either implemented or explicitly out of scope.

## Related Docs

- [[PITCH-READINESS]] — judge/investor evidence readiness.
- [[API-SURFACE]] — server boundary for refund, export, block, report, VGEN, recording.
- [[MILESTONES]] — implementation acceptance criteria.
- [[PROJECT-STATUS]] — current landing status and known landing polish gaps.
- [[SUPPORT-PLAYBOOK]] — current support scripts and fallback handling.
- [[MODERATION-OPS]] — moderation workflow and Japan policy gate.
- [[COST-ESTIMATE]] — VGEN cost and credit UX.
