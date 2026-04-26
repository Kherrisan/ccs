# CCS Dashboard Design System

A page-level design system extracted from the **canonical reference pages** — `home` and `cliproxy` — that already prove the patterns work in production. New pages should adapt to these references, not the other way around.

Some pages legitimately need a bespoke design (the redesigned `health` page is the current example) — when content shape demands custom hierarchy, the system should step out of the way rather than force the page into a wrong-fit archetype.

> Live preview in dev: `bun run dev` then visit `/_styleguide`.

---

## 0. Layout invariants (NEVER VIOLATE)

These rules precede archetype choice. When an archetype seems to require violating them, the archetype is wrong, not the rule. Code review rejects PRs that break §0.

### 0a. Two-column shell, full viewport height

Every Config page is a strict two-column shell:

- **Left column** is the unified identity pane (rail / list). It owns page identity (brand, primary CTA, entity selector, status footer).
- **Left column width is content-fit, not fixed.** The rail is unified in *style* and *primitives* across every Config page, but the actual width adapts to its header content (`w-fit min-w-[240px] max-w-[360px]`). The rail must never overflow or wrap its title — if the rail can't fit "API Profiles" + a "+ New" button on one line at 240px, it grows up to 360px. Beyond that, list-item labels truncate per-item. Pages MUST NOT override this envelope; if a page legitimately needs a wider rail, raise it as a system-wide envelope change (one PR adjusts the cap for everyone).
- **Right column** is the main content (form, or form + json). It fills the remaining width.
- Both columns share the **same top edge**, flush against the global topbar.
- Together they fill `100vh` minus the global topbar — no scrolled-up blank band above either pane, no "first page-height is just header".

### 0b. No horizontal strip below the global topbar

The only horizontal strip allowed at the top of the viewport is the **global topbar** (logo, ClaudeKit / Sponsor badges, connection status, locale, theme).

You MUST NOT stack a second strip below it — no `PageHeader`, no breadcrumb row, no description band, no KPI ribbon — when the body is a `ConfigLayout`. Identity for Config pages lives **inside the left rail**, where it costs zero vertical real estate.

### 0c. Pane top alignment

Within a `ConfigLayout`, all panes (left rail, form, json) share the **same top edge**. A tab bar inside the form pane MUST NOT push the json pane down — they are sibling columns, not parent/child. Tabs belong **inside** the form pane's own scroll area.

### 0d. The cliproxy page is the canonical Config reference

When a Config page disagrees with `pages/cliproxy.tsx` on layout shape, the page is wrong. Anything that produces a blank band above either column, a duplicated identity strip, or a top offset between sibling panes is a §0 violation regardless of which §1 pattern was claimed.

### 0e. Form and JSON panes are user-resizable

The **middle (form) and right (json) panes of `ConfigLayout` MUST be horizontally resizable** by the user via a draggable divider:

- The left rail is **unified across pages but content-fit** — same envelope, same primitives, but the actual width adapts to its header content. Constraints: `min-w-[240px]` (floor — header controls never squeeze into a wrap) and `max-w-[360px]` (cap — rail can't dominate the body even when an entity label is unusually long; per-item `truncate` inside `ListPane` handles labels beyond that). The rail is NOT user-resizable — only the form↔json split is.
- The form ↔ json divider is the **only adjustable split**. Users frequently want a wide form for entering env values OR a wide json pane for reading effective config — never both at the design-time defaults.
- **Default ratio: form ~45% / json ~55%** of the body width remaining after the rail. The json pane is **slightly larger by default** because the canonical cliproxy reference shows users spend more time reading effective configuration than editing one field at a time. Persist the user's chosen ratio **per page** via `react-resizable-panels` `autoSaveId` — `ConfigLayout`'s `storageKey` prop is **required**, no default, so each page must pass a stable identifier (e.g. `storageKey="config-layout.cliproxy"`). A shared default would bleed split-ratio state across unrelated pages, so the type system enforces explicit keys.
- Each pane has an enforced **minimum size of 30%** of the resizable container (the body width after the rail), via `react-resizable-panels`' percentage-based `minSize`. On a 1280px viewport with a 280px rail this lands around 300px per pane — readable but not generous; on standard 1500px+ viewports it lands at 360px+, the practical comfort floor. The library's `minSize` API does NOT support pixel values in v3; if hard pixel floors become necessary later, layer a `onResize` clamp on top.
- When the json pane is omitted (`json={undefined}`), the form expands to fill the remaining width — no divider rendered.
- Below the `<1024px` breakpoint the layout collapses to tabs (Browse / Configure / JSON) — resizing is irrelevant in tab mode.

This satisfies the recurring need to widen one pane to inspect a long env block or read raw configuration without losing the rail-anchored shell.

---

## 1. Identity-strip patterns (pick one per page)

Three patterns cover every page in the dashboard. The choice depends on what your page already has.

### 1a. `HeroBar` — single-row dense hero

**Canonical reference:** `pages/home.tsx`

```
┌────────────────────────────────────────────────────────────────────┐
│ [logo]  Title  [version]   ┃  [Stat] [Stat] [Stat] [Stat]          │
└────────────────────────────────────────────────────────────────────┘
```

One row packs logo + title + version + ≤4 inline stats. Optional subtle dotted-pattern background. Stats are clickable when they double as navigation entry points.

**Use it when:**
- The page is a dashboard / monitor with a clear product identity
- ≤4 hero stats summarize the page in numbers
- Vertical real estate matters (this is half the height of a stacked PageHeader + KpiRow)

**Building blocks:**
- `<HeroSection version={…}/>` — logo + title + subtitle from `components/layout/hero-section.tsx`
- `<InlineStat title value icon variant onClick/>` — clickable stat tile (extracted from `home.tsx`); promote to a shared primitive when a 2nd page adopts it

### 1b. Rail-anchored identity — no top chrome

**Canonical reference:** `pages/cliproxy.tsx`

```
┌──────────┬─────────────────────────────────────────────────────────┐
│ ⚡ Brand  │                                                         │
│ subtitle │                                                         │
│ [QSetup] │  full-height 3-pane body                                │
│          │                                                         │
│ • prov A │  (form + raw json fill the entire viewport)             │
│ • prov B │                                                         │
│  …       │                                                         │
│ [status] │                                                         │
└──────────┴─────────────────────────────────────────────────────────┘
```

Page identity (brand + page-level CTA + status) lives **inside the left rail**. Zero top chrome — the body archetype gets the full vertical viewport.

**Use it when:**
- The page is a multi-entity Config (3-pane: list / form / json)
- The rail naturally carries the page name (you'd duplicate it in a top header)
- Vertical real estate is at a premium because the body has dense form content

**Building blocks:**
- The left rail's own header section (in-place markup, no extracted primitive yet — keep it bespoke until a 2nd page adopts the pattern)
- Recommended order in the rail: brand strip → primary CTA → entity list → status widget → footer summary

### 1c. `PageHeader` — title-row chrome (Monitor-only)

**Canonical reference:** none yet (was `health.tsx` until its bespoke redesign — see §1d).

```
┌────────────────────────────────────────────────────────────────────┐
│ Title  [v-badge]                              [action] [action]    │
│ Description / last-update / status info                            │
└────────────────────────────────────────────────────────────────────┘
```

Traditional title row with description and trailing actions.

**MUST NOT use:** above any `ConfigLayout`. See §0b. This includes single-entity Config, multi-entity Config, and any list/form/json layout. Use **§1b Rail-anchored** instead — the rail owns identity, the body fills the viewport.

**Use it when (Monitor only):**
- The body archetype is **Monitor** (KPI row + grid) and the page has **no left rail**
- The description carries genuinely non-redundant context (last refresh, page hierarchy, filter state, version)
- A `HeroBar` (§1a) does not fit because the page has more than 4 hero numbers or no clean inline-stat shape

**API:** `<PageHeader title description status actions />` — title + description on left, status badges + action buttons on right.

### 1d. Bespoke — full custom design

**Canonical reference:** `pages/health.tsx`

When a page's content shape demands its own hierarchy (priority-driven sections, dynamic backgrounds tied to status, custom card primitives like `HealthStatusRibbon` / `HealthPriorityCard`), the design system gets out of the way. Bespoke pages still respect global concerns (privacy mode, theme, sidebar) but build their own layout from scratch.

**Use it when:**
- None of the three patterns above fits without distorting the content
- The page's information hierarchy is genuinely unique (e.g. severity-driven priority surfaces with secondary audit lists)
- A bespoke implementation will be clearly better than forcing a fit

**Cost:** higher LOC, no reuse, no consistency — only justified when content demands it.

### Decision table

| Page shape | Identity strip |
|------------|---------------|
| Dashboard / overview with ≤4 hero stats | **HeroBar** (home pattern) |
| Single-entity Config (rail + form + optional json) | **Rail-anchored** (cliproxy pattern, no top chrome) |
| Multi-entity Config (3-pane: list/form/json) | **Rail-anchored** (cliproxy pattern, no top chrome) |
| Monitor with a hero viz **and no left rail** | **PageHeader** + Monitor body |
| Severity / priority-driven page with custom hierarchy | **Bespoke** (health pattern) |
| Wizard / login / dialog | None — bespoke shell |

> **Rule of thumb:** if your page has a left rail at all, it uses §1b Rail-anchored. `PageHeader` is reserved for the narrow case of a Monitor without a rail.

---

## 2. Body archetypes

### 2a. Config — 3-pane

**Canonical reference:** `pages/cliproxy.tsx`

```
┌──────────┬──────────────────┬──────────┐
│ left     │ form (FormPane)  │ json     │
│ rail     │                  │ (right)  │
└──────────┴──────────────────┴──────────┘
```

Left rail = `ListPane` (multi-entity) or `SectionRail` (single-entity, with `IntersectionObserver` scroll-spy). Form and JSON panes are middle and right respectively.

```tsx
<ConfigLayout
  left={<ListPane …/>}            // multi-entity
  // OR
  left={<SectionRail …/>}         // single-entity
  form={<FormPane>…</FormPane>}
  json={<JsonPane data={…} />}
/>
```

**Rules:**
- Save action lives **only** in `FormPane` footer
- Form ↔ json split is **user-resizable** with persisted ratio (see §0e). Left rail width is fixed.
- `<1024px`: collapses to tabs (Browse | Configure | JSON) — divider is hidden in tab mode
- `JsonPane` is read-only by default; opt-in `editable` for cliproxy-style inline editing

### 2b. Monitor — KPI row + 12-col grid

**Canonical reference:** none in this PR. Health used to be the reference but went bespoke (§1d). The primitives (`MonitorLayout`, `KpiRow`, `KpiCard`, `MonitorGrid`, `MonitorCard`) ship and remain available; first page to genuinely need them becomes the next reference.

```
┌────────────────────────────────────────┐
│ KpiRow (≤4 hero numbers)               │
├────────────────────────────────────────┤
│ MonitorGrid (12-col):                  │
│   <MonitorCard span={…}/>              │
└────────────────────────────────────────┘
```

```tsx
<MonitorLayout kpis={<KpiRow>…</KpiRow>}>
  <MonitorGrid>
    <MonitorCard span={6} variant="terminal" title=…>…</MonitorCard>
  </MonitorGrid>
</MonitorLayout>
```

**Rules:**
- `KpiRow` only when ≤4 hero numbers; more → group inside the grid
- One primary viz per page, span ≥8 cols
- `variant="terminal"` for live-log / `health --watch` aesthetics

---

## 3. Composing a new page

**Config page (default for any provider / profile / account / api management page):**

```tsx
<PageShell>
  <ConfigLayout
    left={<ListPane … />}     // rail owns identity (§1b) — brand, CTA, list, status
    form={<FormPane …/>}      // tabs (if any) live INSIDE this pane's scroll area
    json={<JsonPane …/>}      // optional; same top edge as form (§0c)
  />
</PageShell>
```

No `PageHeader`. No description band. The rail header carries the brand and section name; the rail footer carries status / counts.

**Dashboard / home page (no rail):**

```tsx
<PageShell>
  <HeroBar … />               // §1a — one row, ≤4 inline stats
  <MonitorLayout … />         // optional grid below
</PageShell>
```

**Monitor page without a rail:**

```tsx
<PageShell>
  <PageHeader title description actions /> {/* §1c — only valid here */}
  <MonitorLayout kpis={<KpiRow … />}>
    <MonitorGrid>…</MonitorGrid>
  </MonitorLayout>
</PageShell>
```

Target LOC for a new page: **~80** for typical config, **~120** for monitor with hero strip. Target LOC for an outlier rewrite: **<400**.

---

## 4. Anti-patterns (REJECT IN REVIEW)

### 4a. `PageHeader` stacked above `ConfigLayout`

❌ DO NOT:

```tsx
<PageShell>
  <PageHeader title="API Profiles" description="Premium APIs, local runtimes, custom endpoints" />
  <ConfigLayout left={…} form={…} json={…} />
</PageShell>
```

The PageHeader steals ~80px from the body, duplicates identity the rail already carries, and pushes the form + json panes below the fold. Use rail-anchored identity (§1b) — move the title into the rail header and remove the description band entirely. See §0b.

### 4b. Tab bar offsetting sibling panes

❌ DO NOT place a tab bar (e.g. `Environment / Info & Usage`) at the top of the form pane such that the json pane on the right starts ~40–60px lower. Form and json are **siblings** sharing one top edge (§0c). Tabs belong **inside** the form pane's scroll area, not above it as a separate row.

### 4c. Description bands that repeat the rail

❌ DO NOT add a description below the title that simply restates what the left rail's items already convey ("Premium APIs, local runtimes, custom endpoints" when the rail already lists those entities). If the rail shows it, the band is noise.

### 4d. Blank vertical band above either column

❌ DO NOT introduce padding, spacing, or a wrapper that produces a >24px blank band between the global topbar and the top of either column. The two columns of a `ConfigLayout` are flush against the global topbar (§0a). If a wrapper requires that band, the wrapper is wrong.

---

## 5. Color & accent usage

The CCS palette is **Pampas (warm cream) + Crail (terracotta orange)**, defined in `src/index.css` as CSS variables. **Never introduce new hues.** Every visual decision routes through these tokens:

| Token | Role | When to use |
|-------|------|-------------|
| `--background` (Pampas) | Page canvas | Outermost shell only |
| `--card` | Elevated surface | FormPane shell, JSON header bar, cards |
| `--card/60`, `--card/80` | Soft elevation | FormSection bg, gradient header tails |
| `--muted/20`, `--muted/30`, `--muted/40` | Pane wash, footer anchor, JSON shell | Differentiating sibling panes without a hard border |
| `--accent` (Crail) | Identity / focus | Section dot, top-edge 1px strip, primary CTA, status pill on key chrome |
| `--accent/30`, `--accent/40` | Whisper accent | Vertical stripe on FormSection edge, top-edge strip on header bars |
| `--accent/10` | Tint background | Status pill bg ("editable", "sensitive", "connected") |
| `--muted-foreground` | Secondary text | Field labels, descriptions, hint copy |
| `--destructive` | Error / danger | Form errors, "delete account" buttons, anti-pattern callouts |
| `--ring` | Focus outlines | NEVER override per-component — let `focus-visible:ring-*` use the token |

### 5a. The 1-accent-dot rule

Each FormSection gets **exactly one accent dot** (1.5px circle, `bg-accent`) prefixing its title, and **one 2px Crail stripe** on the leading edge. These are the only places `--accent` saturates inside the body.

The header bars (FormPane, JsonPane) carry a 1px `accent/40` strip at the top edge — a quiet tie-back to the Save button at the bottom.

If a section needs more attention (e.g. a connected status), use an **outline pill** with `bg-accent/10` + `text-accent` + `border-accent/30`, never a filled `bg-accent` block in the body.

### 5b. Differentiating sibling panes

Form pane (`bg-card`) and JSON pane (`bg-muted/30`) MUST be visually distinct without a hard border line:

- **Form pane** = elevated card surface, active editing zone
- **JSON pane** = recessed muted surface, read-only inspection zone

Inside the JSON pane, the `<pre>` block uses `bg-card/80` with `shadow-inner` so the code sits in a subtle embossed well — the user can tell at a glance which side is "yours to edit" and which is "computed for you to read".

### 5c. Status pills

Use small uppercase pills (10px font, `tracking-wider`, `rounded`, 1px border) for status. Two tones:

- **Active / accent**: `border-accent/40 bg-accent/10 text-accent` — for `editable`, `connected`, `sensitive`, `default`
- **Neutral / muted**: `border-border bg-muted/60 text-muted-foreground` — for `read only`, `unset`, `disabled`

Do not use `bg-emerald-*` / `bg-amber-*` / `bg-blue-*` for status unless the semantic IS the color (e.g. health severity tiers in §1d Bespoke). Default to the palette tokens.

### 5d. Errors and danger

`--destructive` is the **only** red in the system. Use it for:
- Inline form validation errors (`text-destructive` for messages, `border-destructive/40` on bad inputs)
- Anti-pattern callouts in docs (the `§0 invariants` callout in `/_styleguide` uses it)
- Truly destructive button actions ("Delete account", "Reset config")

Never tint a description band, an info banner, or a hover state with `--destructive`.

### 5e. Quick checklist for a new pane

- [ ] FormSections use `bg-card/60` with the leading accent stripe + accent dot before each title
- [ ] FormPane header has a 1px `accent/40` top strip and a `from-card to-card/70` gradient
- [ ] FormPane footer uses `bg-muted/40` to anchor the primary save action
- [ ] JsonPane shell uses `bg-muted/30`; header uses `bg-card/80` with the accent dot + status pill
- [ ] No raw `text-blue-500`, `bg-green-100`, etc. — only palette tokens
- [ ] Hover states change opacity of existing tokens, not hue (e.g. `before:bg-accent/30 hover:before:bg-accent/70`)

### 5f. Interactive states (the three-tier intensity ladder)

Every interactive element uses the same intensity ladder for accent presence:

| State | Accent intensity | Example |
|-------|------------------|---------|
| Default | `accent/30` | FormSection leading stripe at rest |
| Hover / scan | `accent/70` | FormSection stripe on mouse-over (peripheral cue) |
| Focus / active | `accent` solid + soft ring | FormSection on `focus-within`, ListPane selected row |

`FormSection` implements all three: stripe goes `30 → 70 → 100`, plus a soft `ring-accent/20` and shadow lift on focus-within. The user always knows which group "owns" their cursor.

`ListPane` selected row uses the same ladder: 3px Crail stripe on the leading edge + `bg-accent/10` row tint + accent-tinted icon and badge. Hover gives a `accent/30` stripe preview without the row tint. This visually links the selected entity to the FormSection treatment on the right.

Sticky headers (`FormPane.header`) include a soft inset bottom shadow so when the body scrolls under, depth is preserved without a hard divider line.

### 5g. Sensitive fields

Fields whose label matches the heuristic in `src/lib/sensitive-label.ts` (`isSensitiveLabel(label)`) are **automatically** rendered as sensitive. The pattern covers the common conventions: `AUTH_TOKEN | ACCESS_TOKEN | REFRESH_TOKEN | BEARER_TOKEN | API_KEY | API_TOKEN | API_SECRET | CLIENT_ID | CLIENT_SECRET | AWS_ACCESS_KEY_ID | AWS_SECRET_ACCESS_KEY | GCP/AZURE/GITHUB/GITLAB/OPENAI/ANTHROPIC/GEMINI variants of the above | PRIVATE_KEY | SSH_KEY | JWT | OAUTH | CREDENTIAL | PAT | PASSWORD | PASSPHRASE | WEBHOOK_SECRET | HMAC_KEY | SIGNING_KEY`. The match is case-insensitive and tolerates `_` / `-` separators. If the heuristic doesn't match a label that IS a credential, pass `sensitive` explicitly. Adding a new pattern means editing one regex in `sensitive-label.ts` — every consumer (Field, MaskedInput callers that delegate, future helpers) picks it up automatically.

The treatment:

- Lock glyph (`lucide-react/Lock`) prefixing the label, tinted `accent/70`
- "sensitive" status pill on the right of the label row (accent tones per §5c)
- `<input type="password">` by default with a reveal/hide eye-toggle on the right edge
- Focus ring uses `ring-accent/40` + `border-accent/50` (vs. neutral `ring-ring` for ordinary fields) — the only place a default focus ring is overridden

Pages MUST NOT roll their own sensitive-field UI. If the heuristic doesn't match a label, pass `sensitive` explicitly.

### 5h. Raw configuration content

JSON content inside `JsonPane` renders **plain** — no inline syntax highlighting from this design system. A dedicated JSON viewer with its own color coding will replace the `<pre>` in a follow-up; until then the **chrome** of the pane (shell, header strip, accent dot, status pill, embossed code well) carries the §5 treatment, and the **content** stays uncolored. Pages MUST NOT add inline JSON tints in the meantime.

---

## 6. When NOT to use either archetype

These remain bespoke and are out of scope:
- `/login` — minimal centered shell
- Setup wizard — modal overlay
- Dialogs — Radix `Dialog`

---

## 7. Decisions

See [`design-decisions.md`](./design-decisions.md) for the resolved open questions and the v1.1 / v1.2 / v1.3 / v1.4 / v1.5 / v1.6 / v1.7 revision rationale.
