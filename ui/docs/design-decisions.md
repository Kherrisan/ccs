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

## How to revisit

If a decision turns out wrong in practice, update this doc and bump the affected primitive — don't silently drift. Each row above should be appended with a "Revised: <date> · <reason>" line if changed.
