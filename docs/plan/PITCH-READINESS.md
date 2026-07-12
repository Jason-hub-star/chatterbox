---
tags: [hub, guide]
---

# Pitch Readiness — Judge Risk & Evidence Packet

> SSOT for Alibaba.com CoCreate / investor-demo readiness. Updated: 2026-06-30.
> Purpose: separate what is implemented, what is recorded proof, and what is roadmap.

## BLUF

The pitch risk is not story quality. The risk is proof.

Judges will likely believe the vision, then immediately ask whether two real users can create a room, join, talk, see avatar expressions, and produce a 30-second clip. Until that proof exists, the product can be perceived as a strong landing page plus future platform docs.

## First 5 Minutes

| Moment | Judge Reaction | Risk | Required Response |
|---|---|---|---|
| Open landing | Professional, flecto-grade visual polish | CTA goes to waitlist/Tally, not product | Label "waitlist", "demo video", and "live PoC" separately |
| Watch hero/demo media | Impressive, but may look like a mock | "Is this real-time browser capture?" | Show raw browser capture with URL/time visible |
| Try product path | Wants auth → lobby → GreenRoom → room | Current repo is landing, platform PoC not deployed | Provide recorded E2E PoC or local live demo |
| Ask technical questions | MediaPipe/WebGL/LiveKit/RLS risks are known | Docs without test output feel theoretical | Show test artifacts and logs |
| Ask business questions | VGEN is costly | $10/100 credits loses money at current Seedance cost | Show unit economics and constraint plan |

## Must-Show Evidence

### 1. Real-Time Demo Video

- [ ] Two actors join the same room.
- [ ] Voice is audible both ways.
- [ ] Avatar expression sync is visible.
- [ ] GreenRoom appears before entry.
- [ ] Capture is raw browser footage, not a composited animation.
- [ ] Duration: 30 seconds minimum.

Acceptance: a judge can answer "yes, this ran in a browser" without trusting narration.

### 2. Security Verification

- [ ] RLS test output: non-participant cannot read room messages, participants, recordings, or VGEN jobs.
- [ ] `livekit-token` Edge Function smoke: host gets admin grant, actor gets publish grant, viewer cannot publish data.
- [ ] Block gate smoke: blocked user cannot receive a new LiveKit token for the same room.
- [ ] `npm audit` or dependency audit output for the actual platform repo.

Acceptance: security claims are backed by command output, not only policy prose.

### 3. Unit Economics Sheet

- [ ] DAU 100 / 1K / 10K cost and revenue table.
- [ ] VGEN cost per second, per clip, per monthly active creator.
- [ ] Break-even price for 100 credits.
- [ ] JPY display and Japan-local payment roadmap.
- [ ] Generation limits: daily, room, per-action.

Acceptance: the pitch acknowledges that Seedance cost dominates and shows a constraint strategy.

### 4. Japan / Legal Roadmap

- [ ] Japan APPI/data handling review owner and date.
- [ ] Age gate and youth protection flow.
- [ ] 二次創作 / parody / copyright policy draft.
- [ ] AI-generated content disclosure and moderation flow.
- [ ] Data residency map: Supabase, LiveKit, R2, fal.ai.

**담당자·기한 로드맵** (확정 아님 — 주인님 배정 필요)

| 항목 | 담당자 | 기한 | 상태 |
|------|--------|------|------|
| APPI review & compliance | TBD | 2026-07-15 | TODO |
| Age gate / youth protection | TBD | 2026-07-22 | TODO |
| 二次創作 / parody policy draft | TBD | 2026-07-22 | TODO |
| AI-generated content disclosure | TBD | 2026-07-22 | TODO |

Acceptance: Japan launch is shown as a staged compliance plan, not just translation.

## Top 10 Judge Questions

| # | Question | Current Best Answer | Evidence Needed |
|---|---|---|---|
| 1 | Can two users act together live? | Not yet as deployed product; PoC proof required | 30s E2E browser capture |
| 2 | What can iPhone users do? | Viewer/chat/reaction first; actor mode is desktop-first | Mobile viewer demo + iOS fallback doc |
| 3 | VGEN cost vs user price? | Current target price is below raw generation cost | COST-ESTIMATE + unit sheet |
| 4 | How much DAU to earn $1K/month? | Depends on creation limits and subscription mix | Revenue/cost model |
| 5 | Who moderates UGC/AI content? | Automated filters + human queue are designed | MODERATION-OPS + staffing plan |
| 6 | Is Supabase RLS tested? | Designed, not enough without test output | RLS test script/log |
| 7 | Where is user data stored? | Supabase/LiveKit/R2/fal.ai split | Data residency diagram |
| 8 | Japan payment beyond Stripe? | Roadmap only | JPY/payment options table |
| 9 | Why not CustomCast/REALITY/Discord Stage? | Collaborative acting + browser room + VGEN clip loop | competitor slide + demo |
| 10 | Can the team finish Phase 4 in 5.5 weeks? | Phase plan exists; proof depends on Phase 0/1 velocity | first-week shipped scaffold + PoC |

## Risk Register

| Risk | Severity | Why It Matters | Mitigation | Source |
|---|---|---|---|---|
| Landing/platform gap | P0 | Waitlist CTA can make product feel non-existent | Separate "waitlist", "demo video", "live PoC" CTAs | [[MILESTONES]] |
| MediaPipe COOP/COEP | P0 | SharedArrayBuffer/cross-origin isolation can break LiveKit/Supabase/R2 assets | PoC with real asset domains before pitch | [[PLATFORM-SECURITY-RISKS-B]], [[MediaPipeConfig]] |
| RLS implementation drift | P0 | One loose policy can expose room data | RLS test suite before demo | [[SecurityPolicies]], [[DATA-SCHEMA]] |
| Low-end 6-person WebGL | P1 | Target users may have ordinary laptops | N=2 pitch demo first; N=4/6 stress later | [[MILESTONES]], [[PLATFORM-ARCHITECTURE]] |
| iOS actor limitation | P1 | Japan is mobile-first | Position mobile as viewer/reaction first; actor desktop-first | [[MobileViewer]], [[FEATURE-SPEC]] |
| VGEN unit economics | P0 | Raw generation cost can exceed price | Limit duration/frequency, show break-even, test subscription | [[COST-ESTIMATE]], [[VgenCostAnalysis]] |
| Japan payments | P1 | Stripe/KRW/USD alone weakens Japan launch story | JPY display + local payment roadmap | [[COST-ESTIMATE]] |
| Japan legal readiness | P1 | APPI, copyright, age, AI content concerns | Legal review gate and policy drafts | [[MODERATION-OPS]], [[CommunityGuidelines]] |
| Moderation staffing | P1 | UGC platforms need human handling | Show queue SLA and initial operator plan | [[MODERATION-OPS]], [[SUPPORT-PLAYBOOK]] |
| Cold start | P1 | Friend-based product suffers without friends | Demo rooms, templates, future AI/bot partner roadmap | [[FEATURE-SPEC]], [[GAP-MATRIX]] |

## Pitch Story Boundaries

Use three labels consistently:

| Label | Meaning | Allowed Evidence |
|---|---|---|
| `Live now` | Deployed and usable by a judge | URL + account + direct interaction |
| `PoC proven` | Works locally or staging, recorded raw | Browser capture + logs |
| `Designed` | Spec/docs complete, not implemented | Linked docs and roadmap |

Never present a mock UI as live product behavior. Use "product vision mock" or "planned UI" labels when showing landing/theater-preview assets.

## 14-Day Rescue Plan

| Day | Outcome | Proof |
|---|---|---|
| D-14~D-12 | ChatterBox scaffold, auth, route shell | repo path, build log |
| D-11~D-9 | LiveKit token + 2 users join room | token smoke output, screen recording |
| D-8~D-6 | Minimal avatar expression sync | 2-browser capture |
| D-5~D-4 | GreenRoom + mobile viewer fallback | screenshots |
| D-3 | RLS/security smoke pack | test output |
| D-2 | unit economics + Japan legal/payment one-pagers | PDF/sheet |
| D-1 | full 30s demo rehearse | final capture |

## Related Docs

- [[MILESTONES]] — Phase and Pitch Demo Gate.
- [[API-SURFACE]] — server boundary and Edge Function map.
- [[COST-ESTIMATE]] — generation cost and Japan credit UX.
- [[MODERATION-OPS]] — moderation, Japan policy gate, user safety UI.
- [[MonitoringDashboard]] — product analytics and APAC launch quality gate.
- [[PLATFORM-SECURITY-RISKS-B]] — technical risk register.
