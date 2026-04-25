# Design System — Decisions Log

The 6 open questions from the brainstorm phase, resolved before implementation.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Storybook vs in-app `/_styleguide` | **In-app `/_styleguide`** | Zero-config, lives in the repo, gated by `import.meta.env.DEV`. Storybook is a heavy second build pipeline for marginal benefit at this scale. |
| 2 | Archetype B name (Monitor vs Dashboard) | **Monitor** | "Dashboard" is the whole product. "Monitor" matches existing health/analytics framing and avoids overloading the term. |
| 3 | JsonPane editability scope | **Read-only by default**, opt-in `editable` prop | Cliproxy is the only page that genuinely needs in-pane editing today. Opt-in keeps the API safe for codex/copilot/cursor (read-only). |
| 4 | Health terminal aesthetic | **Keep** as `MonitorCard variant="terminal"` | Preserves the `ccs health --watch` feel. Implemented as opt-in variant, not a separate primitive. |
| 5 | i18n key namespace convention | **Per-page namespaces** (`pages.<name>.*`) + shared (`common.*`) | Current i18n already uses ad-hoc per-page keys; this just formalizes it. Primitives use `common.*` so they're translation-stable across pages. |
| 6 | SectionRail activation | **Scroll-spy** via `IntersectionObserver` | Preserves long-form config feel + shows all validation errors at once. Click-to-switch hides errors in inactive sections, which is worse UX for forms. |

---

## v1.1 revision (2026-04-25) — identity-strip patterns

Phase 2 attempted to migrate `home` and `cliproxy` to a one-size-fits-all `PageShell + PageHeader` chrome. Both regressed on density:

- **home** had a single-row hero (logo + title + version + 4 inline stats) — splitting it into a stacked PageHeader + KpiRow doubled vertical footprint and lost scannability
- **cliproxy** had identity in the left rail — adding a top PageHeader duplicated branding and stole ~80px from the 3-pane body

**Resolution:** the design system is restructured around three identity-strip patterns extracted from the existing canonical references:

| # | Pattern | Reference | When |
|---|---------|-----------|------|
| 7a | `HeroBar` (1-row dense) | `pages/home.tsx` | Dashboard pages with ≤4 hero stats |
| 7b | Rail-anchored identity (no top chrome) | `pages/cliproxy.tsx` | Multi-entity Config pages where rail carries brand |
| 7c | `PageHeader` (current) | `pages/health.tsx` | Pages where description / status info is non-redundant |

Phase 2's home + cliproxy migrations are reverted. Health stays migrated (Monitor archetype + PageHeader works there). Future page migrations adapt to whichever pattern fits, NOT the other way around.

**Why bottom-up:** the existing references already proved their patterns work in production. The job of the design system is to formalize what works, not impose what should.

---

## v1.2 revision (2026-04-25) — health redesign and bespoke pattern

After the v1.1 restructure, the `health` page received a separate, focused redesign per a dedicated handoff brief (`plans/reports/handoff-260425-1417-health-page-redesign.md`). The redesign went bespoke:

- New domain components: `HealthStatusRibbon`, `HealthPriorityCard`, `HealthPriorityList`, `HealthAuditSection`
- Severity-driven layout: priority surfaces (errors/warnings) at the top with prominent fix affordances, audit accordion below
- Dynamic colored background tied to overall status, glassmorphic accents
- No `PageShell`, no `PageHeader`, no `MonitorLayout` — full custom shell

**Resolution:** add a fourth identity-strip pattern — **§1d Bespoke** — for pages whose content shape doesn't fit the three primary patterns. The v1.1 row's claim that "health stays migrated (Monitor archetype + PageHeader works there)" no longer holds; corrected here.

**Side effects:**
- `PageHeader` lost its canonical reference (was health). New reference TBD when another page adopts it.
- `MonitorLayout` lost its canonical reference. Primitives remain available for future Monitor pages.
- `Bespoke` is explicitly an escape hatch — not a default. Code review enforces "you tried the three patterns first."

---

## How to revisit

If a decision turns out wrong in practice, update this doc and bump the affected primitive — don't silently drift. Each row above should be appended with a "Revised: <date> · <reason>" line if changed.
