---
tags: [schema, index]
---

# Schema Module Index

Read [../DATA-SCHEMA.md](../DATA-SCHEMA.md) first for legacy section routing and maintenance rules.

| File | Legacy sections | Ownership |
|---|---|---|
| [00-introduction.md](00-introduction.md) | Source header | Preserved source metadata |
| [01-core-tables.md](01-core-tables.md) | §0, §1.1-§1.5 | Identity, rooms, participants, scripts |
| [02-content-and-economy.md](02-content-and-economy.md) | §1.6-§1.14 | Content, VGEN, credits, recordings, DUB |
| [03-safety-social-engagement.md](03-safety-social-engagement.md) | §1.15-§1.25 | Safety, social, engagement, polls |
| [04-livekit-protocol.md](04-livekit-protocol.md) | §2-§2.5 | LiveKit DataChannel protocol |
| [05-storage-access-indexes.md](05-storage-access-indexes.md) | §3-§6 | Storage, RLS, Realtime, indexes |
| [06-types-migration-pending.md](06-types-migration-pending.md) | §7-§8, PENDING | App shapes, migration path, open work |

The modules contain lossless source ranges from the legacy snapshot. `scripts/check-schema-split.mjs` verifies that concatenating them reproduces the snapshot byte-for-byte.
