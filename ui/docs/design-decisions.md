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

## v1.7 revision (2026-04-26) — PR-Agent feedback: enforce mins, require storageKey, broaden sensitive heuristic

Three substantive issues surfaced by upstream PR review on PR #1109. Each is encoded in code + spec:

**Width floor — pixel claim was unenforceable.** The previous spec wording said "form ≥ 360px / json ≥ 320px" but `react-resizable-panels` v3 only accepts percentage `minSize`. On a 1280px viewport this could let a user drag a pane down to ~250px — well below the documented floor. Resolution: bump `minSize` from 25 to **30**, restate the floor as percentage (≥ 30% of body width after the rail), document the actual 300–360px range across realistic viewports, note the v3 API constraint, and leave the door open for a future `onResize` clamp if hard pixel floors become necessary.

**`storageKey` was no longer optional.** The previous default `storageKey="ccs.config-layout"` meant any `<ConfigLayout>` without an explicit key would share localStorage state with every other Config page — split ratios bleeding across unrelated pages. Resolution: make `storageKey` REQUIRED in the `ConfigLayout` props (no default). TypeScript now enforces explicit per-page keys. Pages MUST pass e.g. `storageKey="config-layout.cliproxy"` — this is checked at compile time, not at runtime.

**Sensitive-field heuristic was too narrow.** The previous regex `AUTH_TOKEN|API_KEY|SECRET|PASSWORD|PRIVATE_KEY` missed common secret names: `ACCESS_TOKEN`, `REFRESH_TOKEN`, `BEARER_TOKEN`, `CLIENT_SECRET`, `CLIENT_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, GCP/Azure/GitHub/OpenAI/Anthropic variants, `JWT`, `OAUTH`, `CREDENTIAL`, `PAT`, `WEBHOOK_SECRET`, `HMAC_KEY`, `SIGNING_KEY`, `SSH_KEY`. Resolution: extract the heuristic to `src/lib/sensitive-label.ts` (`isSensitiveLabel(label)`) and broaden the pattern to cover all of those; case-insensitive; tolerates `_`/`-` separators. The Field component imports the shared helper. Adding a new pattern means editing one regex; every consumer inherits.

The shared helper is the Single Source of Truth so future drift can't reintroduce per-component heuristics that disagree with each other.

---

## v1.6 revision (2026-04-26) — content-fit rail (unified envelope, not fixed width)

Live review of the rail-anchored pattern on the API Profiles page surfaced a regression: at the previously-mandated fixed `260px` rail width, the rail header "API Profiles" wrapped onto two lines, the description band wrapped, and the action buttons crowded each other — i.e. the rail was overflowing its own content even though the system mandated that exact width.

**Decision:** the left rail is **unified across pages but content-fit**, not fixed-width. Same primitives, same style treatment (§5), same vertical structure (header → search → list → footer) — but the *width* adapts to its header content within a unified envelope:

- `w-fit` — natural width grows to the largest atomic header element (title + buttons stay on one row)
- `min-w-[240px]` — floor so a sparse rail (e.g. 1-section SectionRail with no badges) doesn't squeeze controls
- `max-w-[360px]` — cap so the rail never dominates the body when an entity label is unusually long; per-item `truncate` inside `ListPane` handles labels beyond that

Pages MUST NOT override this envelope. If a page legitimately needs a wider rail, that is a system-wide envelope change (one PR raises the cap for everyone — uniformity is the point).

**Why not user-resizable?** The form↔json split *is* user-resizable (§0e) because users have different reading-vs-editing preferences mid-task. The rail isn't, because rail content is page-author-controlled and should be sized by the page author at design time. Letting users drag the rail width adds drag affordances inside an identity strip (visual noise) without solving a real recurring need.

**Encoded as §0a** in `design-system.md` (mandatory layout invariant; the prior "fixed minimum width" wording in §0e was rewritten to reference the new envelope). `ConfigLayout` ships the envelope as `<aside className="w-fit min-w-[240px] max-w-[360px] …">` so every Config page inherits the behaviour for free — pages MUST NOT roll their own rail width.

---

## v1.5 revision (2026-04-26) — color & accent treatment for body panes

User feedback during v1.4 styleguide review: the form and JSON panes both rendered as flat white surfaces with no visual hierarchy or accent presence — the panes were technically correct but visually inert and indistinguishable from one another.

**Decision:** apply a structured accent treatment using only the existing Pampas/Crail palette tokens — no new hues introduced. The treatment is encoded into the primitives (`FormPane`, `FormSection`, `JsonPane`) so every Config page inherits the look automatically; pages MUST NOT roll their own bg/border/accent overrides.

**Concrete changes:**

- `FormSection` gains a 2px Crail leading-edge stripe (`before:bg-accent/30`, brightens to `accent/70` on hover) and a 1.5px accent dot prefixing each title — the "1-accent-dot rule"
- `FormPane` header gains a 1px `accent/40` top strip and a `from-card to-card/70` gradient; body wrapper uses `bg-muted/20` so FormSections (`bg-card/60`) read as elevated cards rather than floating; footer uses `bg-muted/40` to anchor the primary save action
- `JsonPane` shell shifts to `bg-muted/30` so the right pane is visually recessed compared to the form pane (active editing surface) → recessed reading surface; header gets the same 1px Crail strip + accent dot + a status pill (`editable` in accent tones, `read only` in neutral tones)
- The inner `<pre>` block in `JsonView` sits inside a `bg-card/80` `shadow-inner` well — gives the code a subtle embossed feel rather than floating on a flat surface
- New **§5 Color & accent usage** in `design-system.md` codifies the rules: token table, the 1-accent-dot rule, sibling-pane differentiation, status pill spec, error/destructive scope, and a 6-point checklist for new panes

**Why it matters:**

- The user is not a designer and asked for guardrails they can follow. §5's checklist + token table is meant to be copy-pastable so future page authors don't need taste — they follow the rules
- Keeping the palette intact (Pampas + Crail only) means brand consistency is preserved while every pane gains depth
- The accent dot/stripe pattern is recognizable: any Config page will now read as "CCS-shaped" at a glance, even before the user reads a single label

**Constraints:**

- No raw Tailwind colors (`bg-blue-*`, `text-emerald-*`, etc.) anywhere except the existing health-priority bespoke page (§1d) and severity-driven semantics
- All elevation done via `bg-card`, `bg-muted/*`, and `bg-card/*` opacity steps — never via shadow alone
- Hover states change opacity of an existing token, never hue

---

## v1.4 revision (2026-04-26) — resizable form / json split

User feedback during v1.3 styleguide review: a single fixed form/json ratio cannot serve both editing (wide form) and reading (wide json) — env blocks like the GLM provider example demand a wide form to enter long values, while debugging effective configuration demands a wide json pane.

**Decision:** the **form (middle) and json (right) panes of `ConfigLayout` are user-resizable** via a draggable horizontal divider. Left rail width stays fixed (rail owns identity and doesn't compete for body width). User's chosen ratio persists in `localStorage` per-page (`ccs.config-layout.<page>.split`).

**Constraints:**

- Minimum widths enforced (form ≥ 360px, json ≥ 320px) — neither pane collapses to unreadable
- Default split: form `flex-1`, json `~38–42%` of remaining width
- When `json` prop is omitted, form fills remaining width and no divider renders
- Below `<1024px` the layout collapses to tabs (existing behaviour); divider is irrelevant
- Resize handle is keyboard-accessible (arrow keys move 16px increments, Home/End jump to min/max)

**Encoded as §0e** in `design-system.md` (mandatory layout invariant) plus a rule update in §2a Config archetype. Implementation lives in `ConfigLayout` so every Config page inherits the behaviour for free — pages MUST NOT roll their own resize logic.

**Why an invariant, not a feature flag:** the canonical reference (`cliproxy`) and every migrated provider page show env blocks where one pane is consistently more interesting than the other depending on the task. A fixed ratio is wrong by construction; making the split adjustable is closer to "how IDEs already work" and removes a recurring papercut without expanding the design surface.

---

## v1.3 revision (2026-04-26) — layout invariants and rail-anchored default for Config

Phase 3 + Phase 4 (PR #1105) migrated 12 Config pages to the §1c `PageHeader` pattern stacked above `ConfigLayout`. Live review of the API Profiles page exposed the regression:

- The global topbar (ClaudeKit / Sponsor / Connected / locale / theme) already occupies one horizontal strip
- Adding `PageHeader` ("API Profiles" + description) below it creates a **second strip** that costs ~80px of vertical real estate
- The form pane's tab bar (`Environment / Info & Usage`) pushes the json pane down by another ~40px, so the right column starts well below the left
- Net effect: a large blank L-shaped band wraps the body, the canonical `cliproxy` "no top chrome, body fills viewport" feel is lost, and identity is duplicated between PageHeader and the rail

**Resolution:**

1. New mandatory **§0 Layout invariants** in `design-system.md` — two-column shell, full viewport height, no second horizontal strip, sibling panes share one top edge, `cliproxy.tsx` is the canonical Config reference
2. `§1c PageHeader` is **explicitly disallowed** above any `ConfigLayout`. It is reserved for Monitor pages with no left rail
3. Decision table updated: **all** Config pages (single-entity AND multi-entity) use `§1b Rail-anchored`. The previous row "Single-entity Config OR Monitor → PageHeader" is removed
4. New **§4 Anti-patterns** section documents the four concrete failure modes with rejected code samples (PageHeader-over-ConfigLayout, tab-bar offsetting json pane, redundant description band, blank band above columns)
5. Phase 3 + Phase 4 page migrations that adopted `PageHeader` are now **non-canonical** until refactored to rail-anchored. PR #1105 is held; merging requires a follow-up commit that strips `PageHeader` from every migrated Config page and folds identity into the rail

**Why:** the canonical reference (`cliproxy`) already proved rail-anchored works for dense provider configs. Phase 3 forgot the bottom-up principle from v1.1 ("the design system is restructured around three identity-strip patterns extracted from the existing canonical references") and re-imposed top-down chrome on pages whose left rail already carries identity. v1.3 reasserts the principle and encodes the layout invariants so the rule cannot drift again silently.

**Side effects:**

- `PageHeader` loses its remaining canonical references (Phase 3+4 pages) until a Monitor-without-rail page adopts it
- The `/_styleguide` Intro is updated to surface §0 invariants prominently
- Phase 3 + Phase 4 retrospective report should be filed in `plans/reports/` documenting which pages need rail-anchor refactor and the LOC delta

---

## How to revisit

If a decision turns out wrong in practice, update this doc and bump the affected primitive — don't silently drift. Each row above should be appended with a "Revised: <date> · <reason>" line if changed.
