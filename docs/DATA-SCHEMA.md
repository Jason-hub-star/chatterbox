---
tags: [hub, schema]
---

# Data Schema

> Canonical schema hub. The implementation detail is split by ownership so readers load only the relevant contract.
> Updated: 2026-07-12. The pre-split source, including the current polls changes, is preserved byte-for-byte in [the legacy snapshot](archive/DATA-SCHEMA-legacy-2026-07-12.md).

## How To Use This Hub

- Existing `DATA-SCHEMA.md` and `§` references remain valid through the compatibility map below.
- New references should target the smallest relevant file under [schema/](schema/_INDEX.md).
- The schema validation scripts aggregate every schema module. Do not add a table definition to this hub.

## Compatibility Map

| Legacy section | Canonical module |
|---|---|
| §0 Naming SSOT; §1.1-§1.5 | [Core tables](schema/01-core-tables.md) |
| §1.6-§1.14 | [Content and economy](schema/02-content-and-economy.md) |
| §1.15-§1.25 | [Safety, social, and engagement](schema/03-safety-social-engagement.md) |
| §2 and §2.1-§2.5 | [LiveKit protocol](schema/04-livekit-protocol.md) |
| §3-§6 | [Storage, access, and indexes](schema/05-storage-access-indexes.md) |
| §7-§8 and PENDING | [Types, migration, and pending work](schema/06-types-migration-pending.md) |

## Canonical Modules

| Module | Scope | Size target |
|---|---|---:|
| [Core tables](schema/01-core-tables.md) | Naming; users, rooms, participants, models, scripts | <500 lines |
| [Content and economy](schema/02-content-and-economy.md) | Messages, scenes, VGEN, credits, recordings, DUB | <500 lines |
| [Safety, social, and engagement](schema/03-safety-social-engagement.md) | Presets, moderation, relationships, artifacts, reservations, polls | <500 lines |
| [LiveKit protocol](schema/04-livekit-protocol.md) | DataChannel types and event rules | <300 lines |
| [Storage, access, and indexes](schema/05-storage-access-indexes.md) | Storage paths, RLS, Realtime, indexes | <300 lines |
| [Types, migration, and pending work](schema/06-types-migration-pending.md) | TypeScript shapes, phased migration, pending inventory | <400 lines |

## Maintenance Rules

1. Preserve the existing section number and heading when changing a module; downstream references use them as stable identifiers.
2. Put new tables in the ownership module, then update the migration, affected contract/state machine, and `GAP-MATRIX.md` when the change is a product decision.
3. Run `npm run docs:check`, `npm run docs:check:strict`, `npm run docs:links`, and `npm run docs:health` after changing modules.
4. The legacy snapshot is evidence only. Never edit it; create a new dated snapshot before a future structural split.
