# CCS Dashboard Design System

The dashboard ships **two page archetypes**. Every page picks exactly one. All pages share the same outer chrome via `PageShell` + `PageHeader`.

> Live preview in dev: `bun run dev` then visit `/_styleguide`.

---

## 1. The shell — every page

```
PageShell
├─ PageHeader   (title · description · status · actions)
└─ <archetype body>
```

```tsx
<PageShell>
  <PageHeader title="Cliproxy" status={…} actions={…} />
  <ConfigLayout … />     {/* OR <MonitorLayout> */}
</PageShell>
```

Header rules:
- `title` is mandatory; `description` optional 1-line subtitle.
- `status` slot: small badges/chips (e.g. "Running · :8317").
- `actions` slot: button group; **primary action belongs in FormPane footer**, not here, for Config pages.

---

## 2. Config archetype — 3-pane

Used by every page that configures one or more entities (cliproxy, accounts, codex, copilot, cursor, droid, claude-extension, api, shared, profiles).

```
┌──────────┬──────────────────┬──────────┐
│ left     │ form (FormPane)  │ json     │
│ rail     │                  │ (right)  │
└──────────┴──────────────────┴──────────┘
```

One component, prop-controlled left rail:

```tsx
// Multi-entity (cliproxy, accounts, providers)
<ConfigLayout
  left={<ListPane items={…} selectedId={id} onSelect={…} />}
  form={<FormPane>…</FormPane>}
  json={<JsonPane data={…} />}
/>

// Single-entity (codex, copilot, cursor, droid, claude-extension)
<ConfigLayout
  left={<SectionRail sections={…} />}
  form={<FormPane>…</FormPane>}
  json={<JsonPane data={…} />}
/>

// No rail (rare — only if page has neither entities to pick nor sections to navigate)
<ConfigLayout form={<FormPane>…</FormPane>} json={<JsonPane data={…} />} />
```

### Rules

- **Layout**: left 260px / form flex / json 360px on `>=1024px`.
- **<1024px**: collapses to tabs (`Browse | Configure | JSON`).
- **Save action**: lives **only** in `FormPane footer`. Never duplicate in PageHeader.
- **Per-entity actions** (delete, duplicate, sync): ListPane row trailing actions or FormPane header secondary actions — never both.
- **JsonPane is read-only by default**. Pass `editable` prop only on pages that need inline editing (cliproxy is the canonical example).

### SectionRail

For single-entity pages. Provides anchor nav with `IntersectionObserver` scroll-spy. Each item must match the `id` of a `<FormSection id="…">` in the FormPane.

```tsx
<SectionRail
  sections={[
    { id: 'general', label: 'General' },
    { id: 'auth', label: 'Authentication' },
    { id: 'routing', label: 'Routing' },
  ]}
/>

// FormPane:
<FormSection id="general" title="General">…</FormSection>
<FormSection id="auth" title="Authentication">…</FormSection>
```

---

## 3. Monitor archetype — KPI row + 12-col grid

Used by every page that shows live state (home, analytics, health, logs, future status pages).

```
┌────────────────────────────────────────────────┐
│ KpiRow:  [KPI] [KPI] [KPI] [KPI]              │  (optional, ≤4 hero numbers)
├────────────────────────────────────────────────┤
│ MonitorGrid (12-col):                          │
│   <MonitorCard span={8}>  primary viz         │
│   <MonitorCard span={4}>  side widget         │
│   <MonitorCard span={6}>  ...                 │
│   <MonitorCard span={6}>  ...                 │
└────────────────────────────────────────────────┘
```

```tsx
<MonitorLayout
  kpis={
    <KpiRow>
      <KpiCard label="Active accounts" value="87" hint="▲ 3" tone="positive" />
      …
    </KpiRow>
  }
>
  <MonitorGrid>
    <MonitorCard span={8} title="Live monitor">…</MonitorCard>
    <MonitorCard span={4} title="Top providers">…</MonitorCard>
    <MonitorCard span={6} title="Requests" meta="last 24h">…</MonitorCard>
    <MonitorCard span={6} variant="terminal" title="$ ccs health --watch">…</MonitorCard>
  </MonitorGrid>
</MonitorLayout>
```

### Rules

- **KpiRow** only when there are ≤4 hero numbers. More than 4 → use `MonitorCard`s inside the grid instead.
- **One primary viz per page** — span ≥8 cols. Preserves the "punch" of home and analytics.
- **`variant="terminal"`** = dark monospace card, for live-log / `health --watch` aesthetics. Opt-in only.
- **Spans clamp at 6 cols on tablet**, single column on mobile.

---

## 4. When NOT to use either archetype

These remain bespoke:
- `/login` — minimal centered shell, no header/grid.
- Setup wizard — modal overlay, not a page.
- Dialogs — radix `Dialog`, not a layout.

If you find yourself fighting the shell, the answer is usually "this isn't a Config or Monitor page" — talk to the maintainers before inventing a third archetype.

---

## 5. Composing a new page

The recipe for any new page is:

```tsx
import { PageShell, PageHeader } from '@/components/page-shell';
import { ConfigLayout, /*…*/ } from '@/components/config-layout';

export function MyPage() {
  return (
    <PageShell>
      <PageHeader title="My Page" actions={<Actions/>} />
      <ConfigLayout
        left={…}
        form={<FormPane>…</FormPane>}
        json={<JsonPane data={…}/>}
      />
    </PageShell>
  );
}
```

Target LOC for a new page: **~80** for typical config, **~120** for monitor. If your page exceeds 400 LOC it should be split into `pages/<name>/` with section files.

---

## 6. Lint / enforcement

Phase 4 adds a lint rule: every file under `src/pages/*.tsx` (or `src/pages/*/index.tsx`) must import `PageShell`. Until then, code review enforces the contract.

---

## 7. Decisions

See [`design-decisions.md`](./design-decisions.md) for the resolutions of the 6 open questions from the brainstorm phase.
