# CCS Dashboard Design System

A page-level design system extracted from the **canonical reference pages** — `home` and `cliproxy` — that already prove the patterns work in production. New pages should adapt to these references, not the other way around.

Health is the second-tier reference for pages whose content shape (gauge + KPIs + group accordions) doesn't fit either canonical hero — it uses the `MonitorLayout` archetype.

> Live preview in dev: `bun run dev` then visit `/_styleguide`.

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

### 1c. `PageHeader` — title-row chrome

**Canonical reference:** `pages/health.tsx`

```
┌────────────────────────────────────────────────────────────────────┐
│ Title  [v-badge]                              [action] [action]    │
│ Description / last-update / status info                            │
└────────────────────────────────────────────────────────────────────┘
```

Traditional title row with description and trailing actions.

**Use it when:**
- The page does NOT fit either canonical hero
- The description carries genuinely non-redundant context (last refresh, page hierarchy, filter state, version)
- Body archetype below benefits from a clear identity strip

**API:** `<PageHeader title description status actions />` — title + description on left, status badges + action buttons on right.

### Decision table

| Page shape | Identity strip |
|------------|---------------|
| Dashboard / overview with ≤4 hero stats | **HeroBar** (home pattern) |
| Multi-entity Config (3-pane: list/form/json) | **Rail-anchored** (cliproxy pattern, no top chrome) |
| Single-entity Config OR Monitor with a real hero viz | **PageHeader** + body archetype |
| Wizard / login / dialog | None — bespoke shell |

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
- `<1024px`: collapses to tabs (Browse | Configure | JSON)
- `JsonPane` is read-only by default; opt-in `editable` for cliproxy-style inline editing

### 2b. Monitor — KPI row + 12-col grid

**Canonical reference:** `pages/health.tsx`

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

```tsx
// Example: a new dashboard-style page
<PageShell>
  <HeroBar … />            {/* or PageHeader, or rail-anchored identity */}
  <MonitorLayout … />      {/* or ConfigLayout */}
</PageShell>
```

Target LOC for a new page: **~80** for typical config, **~120** for monitor with hero strip. Target LOC for an outlier rewrite: **<400**.

---

## 4. When NOT to use either archetype

These remain bespoke and are out of scope:
- `/login` — minimal centered shell
- Setup wizard — modal overlay
- Dialogs — Radix `Dialog`

---

## 5. Decisions

See [`design-decisions.md`](./design-decisions.md) for the resolved open questions and the v1.1 revision rationale.
