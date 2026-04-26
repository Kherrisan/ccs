/**
 * /_styleguide — DEV-ONLY route showcasing the CCS design system.
 *
 * Renders every primitive in isolation plus composed Config + Monitor archetype demos.
 * Gated by import.meta.env.DEV in App.tsx — never exposed in production builds.
 *
 * All demo data is anonymized (Provider A/B/C, fake metrics) so screenshots are
 * safe to publish in PRs without enabling Privacy mode.
 */
import { useState } from 'react';
import {
  Activity,
  Bot,
  Cloud,
  Cpu,
  Key,
  Plus,
  RefreshCcw,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { PageShell, PageHeader, EmptyState, ErrorState } from '@/components/page-shell';
import {
  ConfigLayout,
  ListPane,
  SectionRail,
  FormPane,
  FormSection,
  JsonPane,
  type ListPaneItem,
  type SectionRailItem,
} from '@/components/config-layout';
import {
  MonitorLayout,
  MonitorGrid,
  MonitorCard,
  KpiRow,
  KpiCard,
} from '@/components/monitor-layout';
import { Field } from '@/components/forms/field';

const DEMO_PROVIDERS: ListPaneItem[] = [
  { id: 'provider-a', label: 'Provider A', badge: '14', icon: <Zap className="size-3.5" /> },
  { id: 'provider-b', label: 'Provider B', badge: '3', icon: <Bot className="size-3.5" /> },
  { id: 'provider-c', label: 'Provider C', badge: '70', icon: <Cloud className="size-3.5" /> },
  { id: 'provider-d', label: 'Provider D', badge: '1', icon: <ShieldCheck className="size-3.5" /> },
];

const DEMO_SECTIONS: SectionRailItem[] = [
  { id: 'general', label: 'General' },
  { id: 'auth', label: 'Authentication' },
  { id: 'routing', label: 'Routing' },
  { id: 'models', label: 'Models' },
  { id: 'tools', label: 'Tools & MCP' },
  { id: 'advanced', label: 'Advanced' },
];

const DEMO_CONFIG = {
  env: {
    ANTHROPIC_BASE_URL: 'https://api.example.local/anthropic',
    ANTHROPIC_AUTH_TOKEN: '••••••••••••••••••••••••',
    API_TIMEOUT_MS: '3000000',
    ANTHROPIC_MODEL: 'demo-1.0',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'demo-1.0',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'demo-1',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'demo-0.5-air',
    DISABLE_TELEMETRY: '1',
    ANTHROPIC_TEMPERATURE: '0.2',
    ANTHROPIC_MAX_TOKENS: '65536',
  },
  routing: {
    strategy: 'weighted-round-robin',
    failover: ['provider-b', 'provider-c'],
  },
  permissions: {
    defaultMode: 'bypassPermissions',
  },
};

export function StyleguidePage() {
  return (
    <div className="space-y-12 bg-muted/20 px-4 py-8 sm:px-8">
      <Intro />

      <PrimitiveSection
        title="1a. HeroBar — single-row dense identity strip (home pattern)"
        anchor="hero-bar"
      >
        <DemoHeroBar />
      </PrimitiveSection>

      <PrimitiveSection
        title="1b. Rail-anchored identity — no top chrome (cliproxy pattern)"
        anchor="rail-anchored"
      >
        <DemoRailAnchored />
      </PrimitiveSection>

      <PrimitiveSection
        title="1c. PageHeader — Monitor-only chrome (NEVER above ConfigLayout)"
        anchor="page-header"
      >
        <DemoPageHeader />
      </PrimitiveSection>

      <PrimitiveSection
        title="2a. Config archetype — multi-entity (rail-anchored, no top chrome)"
        anchor="config-multi"
      >
        <DemoConfigMulti />
      </PrimitiveSection>

      <PrimitiveSection
        title="2b. Config archetype — single-entity (rail-anchored, no top chrome)"
        anchor="config-single"
      >
        <DemoConfigSingle />
      </PrimitiveSection>

      <PrimitiveSection title="3. Monitor archetype" anchor="monitor">
        <DemoMonitor />
      </PrimitiveSection>

      <PrimitiveSection title="4. EmptyState / ErrorState" anchor="states">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={Activity}
            title="No providers yet"
            description="Add your first provider to start routing requests."
            action={
              <Button size="sm">
                <Plus className="size-3.5" /> Add provider
              </Button>
            }
          />
          <ErrorState
            title="Failed to load configuration"
            description="The remote host returned 503. Retry in a moment."
            action={
              <Button size="sm" variant="outline">
                <RefreshCcw className="size-3.5" /> Retry
              </Button>
            }
          />
        </div>
      </PrimitiveSection>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Section helpers
// -----------------------------------------------------------------------------

function Intro() {
  return (
    <header className="mx-auto max-w-4xl space-y-4 text-center">
      <Badge variant="outline" className="font-mono">
        DEV ONLY · /_styleguide
      </Badge>
      <h1 className="text-3xl font-bold tracking-tight">CCS Dashboard Design System</h1>
      <p className="text-muted-foreground">
        Three identity-strip patterns — <strong>HeroBar</strong> (one-row dense, see <code>/</code>{' '}
        home page), <strong>rail-anchored</strong> (no top chrome, see <code>/cliproxy</code>), and{' '}
        <strong>PageHeader</strong> (Monitor-only) — and two body archetypes:{' '}
        <strong>Config</strong> (rail + form + optional JSON) and <strong>Monitor</strong> (KPI row
        + grid).
      </p>
      <div className="mx-auto max-w-3xl rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-left text-sm">
        <p className="mb-2 font-semibold text-destructive">§0 Layout invariants — never violate</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Config pages are a <strong>strict two-column shell</strong>: largest pane on the left
            (rail / list owns identity), main content on the right. Both columns flush against the
            global topbar, filling the viewport.
          </li>
          <li>
            <strong>No second horizontal strip</strong> below the global topbar. No{' '}
            <code>PageHeader</code>, breadcrumb row, description band, or KPI ribbon above a{' '}
            <code>ConfigLayout</code>.
          </li>
          <li>
            Form and JSON panes are <strong>siblings sharing one top edge</strong>. Tab bars live
            inside the form pane&apos;s scroll area, never as a sibling row that offsets the JSON
            pane.
          </li>
          <li>
            <code>pages/cliproxy.tsx</code> is the canonical Config reference. When a Config page
            disagrees with it on layout shape, the page is wrong.
          </li>
          <li>
            The <strong>left rail is content-fit within a unified envelope</strong> (
            <code>w-fit min-w-[240px] max-w-[360px]</code>). Same primitives, same treatment
            everywhere; width adapts to header content so titles never wrap. Pages MUST NOT override
            this envelope.
          </li>
          <li>
            The <strong>form ↔ JSON split is user-resizable</strong> via a draggable divider; the
            rail itself is NOT user-resizable. Min widths: form ≥ 360px, json ≥ 320px. Ratio
            persists in <code>localStorage</code> per-page.
          </li>
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Full spec: <code>ui/docs/design-system.md</code> · revision history:{' '}
        <code>ui/docs/design-decisions.md</code> (current: v1.7, 2026-04-26). Color rules: §5.
      </p>
    </header>
  );
}

function PrimitiveSection({
  title,
  anchor,
  children,
}: {
  title: string;
  anchor: string;
  children: React.ReactNode;
}) {
  return (
    <section id={anchor} className="mx-auto max-w-7xl space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">{children}</div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// HeroBar demo (canonical: pages/home.tsx)
//
// One row packs logo + title + version + ≤4 inline stats. Optional dotted
// background pattern. Stats are clickable when they double as nav entry points.
// Use it for dashboard pages with a clear product identity and ≤4 hero numbers.
// -----------------------------------------------------------------------------

function DemoInlineStat({
  title,
  value,
  icon: Icon,
  variant = 'default',
}: {
  title: string;
  value: string | number;
  icon: typeof Activity;
  variant?: 'default' | 'accent' | 'success' | 'warning';
}) {
  const styles = {
    default: 'bg-muted text-muted-foreground',
    accent: 'bg-accent/15 text-accent',
    success: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  }[variant];
  const valueColor = {
    default: 'text-foreground',
    accent: 'text-accent',
    success: 'text-emerald-700 dark:text-emerald-400',
    warning: 'text-amber-700 dark:text-amber-400',
  }[variant];

  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-lg border bg-card/50 px-4 py-2.5 transition-all hover:-translate-y-0.5 hover:bg-card hover:shadow-sm active:scale-[0.98]"
    >
      <div className={cn('flex size-9 items-center justify-center rounded-md', styles)}>
        <Icon className="size-4" />
      </div>
      <div className="text-left">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
        <p className={cn('font-mono text-lg font-bold leading-tight', valueColor)}>{value}</p>
      </div>
    </button>
  );
}

function DemoHeroBar() {
  return (
    <div className="space-y-6 p-6">
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-background via-background to-muted/30">
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
              backgroundSize: '24px 24px',
            }}
          />
        </div>
        <div className="relative flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Zap className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">Demo Dashboard</h1>
                <Badge variant="outline" className="font-mono text-xs">
                  v1.0.0
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Single-row dense hero — logo + title + version + inline stats
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DemoInlineStat title="Profiles" value={4} icon={Key} variant="accent" />
            <DemoInlineStat title="CLIProxy" value={2} icon={Zap} variant="accent" />
            <DemoInlineStat title="Accounts" value={87} icon={Users} variant="default" />
            <DemoInlineStat title="Health" value="23/43" icon={Activity} variant="warning" />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Body content renders below — no separate KpiRow needed since stats are absorbed into the
        hero strip.
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Rail-anchored identity demo (canonical: pages/cliproxy.tsx)
//
// Page identity (brand + page-level CTA + status) lives inside the left rail of
// a Config 3-pane layout. Zero top chrome. The body archetype gets the full
// vertical viewport. Use for multi-entity Config pages where the rail naturally
// carries the page name.
// -----------------------------------------------------------------------------

function DemoRailAnchored() {
  const [selectedId, setSelectedId] = useState('provider-a');

  const railHeader = (
    <div className="flex h-full flex-col bg-muted/30">
      {/* Brand strip — replaces the global PageHeader */}
      <div className="border-b bg-background p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-5 text-primary" />
            <h1 className="font-semibold">Demo Brand</h1>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <RefreshCw className="size-4" />
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Page subtitle / description</p>
        <Button variant="default" size="sm" className="w-full gap-2">
          <Sparkles className="size-4" /> Quick Setup
        </Button>
      </div>

      {/* Provider list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Providers
          </div>
          <div className="space-y-1">
            {DEMO_PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  selectedId === p.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                )}
              >
                {p.icon}
                <span className="flex-1 truncate">{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.badge}</span>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>

      {/* Footer status */}
      <div className="border-t bg-background p-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>4 providers</span>
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="size-3" /> 1 connected
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[640px] flex-col">
      {/* NOTE: NO PageHeader at the top. Identity is inside the rail. */}
      <ConfigLayout
        storageKey="styleguide.rail-anchored"
        left={railHeader}
        form={
          <FormPane
            header={
              <div className="flex w-full items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Provider A</p>
                  <p className="text-xs text-muted-foreground">
                    Last modified: 4/12/2026 · 14 accounts · synced 2m ago
                  </p>
                </div>
                <Badge variant="outline">connected</Badge>
              </div>
            }
            footer={
              <>
                <Button size="sm">Save</Button>
                <Button size="sm" variant="outline">
                  Test connection
                </Button>
              </>
            }
          >
            <FormSection id="endpoint" title="Endpoint" description="Base URL and auth token.">
              <Field
                label="ANTHROPIC_BASE_URL"
                defaultValue="https://api.example.local/anthropic"
              />
              <Field label="ANTHROPIC_AUTH_TOKEN" defaultValue="••••••••••••••••••••••" />
              <Field label="API_TIMEOUT_MS" defaultValue="3000000" />
            </FormSection>
            <FormSection id="models" title="Models" description="Routing for Opus/Sonnet/Haiku.">
              <Field label="ANTHROPIC_MODEL" defaultValue="demo-1.0" />
              <Field label="ANTHROPIC_DEFAULT_OPUS_MODEL" defaultValue="demo-1.0" />
              <Field label="ANTHROPIC_DEFAULT_SONNET_MODEL" defaultValue="demo-1" />
              <Field label="ANTHROPIC_DEFAULT_HAIKU_MODEL" defaultValue="demo-0.5-air" />
            </FormSection>
            <FormSection id="advanced" title="Advanced">
              <Field label="ANTHROPIC_TEMPERATURE" defaultValue="0.2" />
              <Field label="ANTHROPIC_MAX_TOKENS" defaultValue="65536" />
              <Field label="DISABLE_TELEMETRY" defaultValue="1" />
            </FormSection>
          </FormPane>
        }
        json={<JsonPane title="Raw configuration" data={DEMO_CONFIG} />}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// PageHeader demo — MONITOR-ONLY use (§0b / §1c).
//
// PageHeader stacks a second horizontal strip below the global topbar, which
// costs vertical real estate. That cost is acceptable ONLY when the body is a
// Monitor archetype (KPI row + grid) with NO left rail. NEVER place PageHeader
// above a ConfigLayout — the rail owns identity in Config pages.
// -----------------------------------------------------------------------------

function DemoPageHeader() {
  const tiles: Array<{
    label: string;
    value: string;
    hint: string;
    tone: 'positive' | 'warning' | 'default';
    spark: number[];
  }> = [
    {
      label: 'Active',
      value: '87',
      hint: '▲ 3 vs yesterday',
      tone: 'positive',
      spark: [62, 70, 68, 74, 80, 82, 85, 87],
    },
    {
      label: 'Requests/24h',
      value: '12,481',
      hint: '▲ 6.4%',
      tone: 'positive',
      spark: [40, 55, 48, 60, 70, 75, 82, 90],
    },
    {
      label: 'Errors',
      value: '12',
      hint: '3 quota · 9 transient',
      tone: 'warning',
      spark: [4, 6, 3, 8, 10, 7, 9, 12],
    },
    {
      label: 'Uptime',
      value: '99.98%',
      hint: '30-day window',
      tone: 'default',
      spark: [98, 99, 99, 99, 100, 100, 99, 100],
    },
  ];

  return (
    <div className="flex flex-col">
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
        <strong>Allowed only above Monitor body without a rail.</strong> Never stack above{' '}
        <code>ConfigLayout</code> — see §4a anti-pattern.
      </div>
      <PageShell>
        <PageHeader
          title="Demo Monitor"
          description="Last refresh: 12s ago · 4 sources · viewing live"
          status={<Badge variant="secondary">All systems nominal</Badge>}
          actions={
            <>
              <Button variant="outline" size="sm">
                <RefreshCcw className="size-3.5" /> Refresh
              </Button>
              <Button size="sm">
                <Plus className="size-3.5" /> New source
              </Button>
            </>
          }
        />
        <div className="grid grid-cols-4 gap-3 p-4">
          {tiles.map((t) => {
            const max = Math.max(...t.spark);
            const toneStroke =
              t.tone === 'positive'
                ? 'stroke-emerald-500'
                : t.tone === 'warning'
                  ? 'stroke-amber-500'
                  : 'stroke-foreground/60';
            return (
              <div key={t.label} className="rounded-lg border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t.label}
                </p>
                <p className="mt-1 font-mono text-lg font-bold">{t.value}</p>
                <p className="text-[10px] text-muted-foreground">{t.hint}</p>
                <svg viewBox="0 0 100 24" className="mt-2 h-6 w-full" preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    strokeWidth="1.5"
                    className={cn(toneStroke)}
                    points={t.spark
                      .map((v, i) => `${(i / (t.spark.length - 1)) * 100},${24 - (v / max) * 22}`)
                      .join(' ')}
                  />
                </svg>
              </div>
            );
          })}
        </div>
      </PageShell>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Config (multi-entity) demo — rail-anchored, NO top chrome (§0b / §1b).
//
// Identity (brand + page CTA) lives inside ListPane.header. The two columns
// share one top edge flush against the global topbar; the body fills the
// viewport. Canonical reference: pages/cliproxy.tsx.
// -----------------------------------------------------------------------------

function DemoConfigMulti() {
  const [selectedId, setSelectedId] = useState<string>('provider-a');
  const [search, setSearch] = useState('');

  const filtered = DEMO_PROVIDERS.filter((p) =>
    String(p.label).toLowerCase().includes(search.toLowerCase())
  );

  const railHeader = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">CLIProxy</h2>
        </div>
        <Badge variant="outline" className="text-[10px]">
          4 providers
        </Badge>
      </div>
      <Button size="sm" className="w-full gap-1.5">
        <Plus className="size-3.5" /> New provider
      </Button>
    </div>
  );

  return (
    <div className="flex h-[640px] flex-col">
      {/* NO PageHeader above ConfigLayout — see §4a anti-pattern. */}
      <ConfigLayout
        storageKey="styleguide.config-multi"
        left={
          <ListPane
            header={railHeader}
            items={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search providers…"
            footer={
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{filtered.length} shown</span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="size-3" /> 1 connected
                </span>
              </div>
            }
          />
        }
        form={
          <FormPane
            header={
              <div className="flex w-full items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Provider A</p>
                  <p className="text-xs text-muted-foreground">14 accounts · synced 2m ago</p>
                </div>
                <Badge variant="outline">connected</Badge>
              </div>
            }
            footer={
              <>
                <Button size="sm">Save</Button>
                <Button size="sm" variant="outline">
                  Test connection
                </Button>
              </>
            }
          >
            <FormSection id="general" title="General" description="Display and endpoint.">
              <Field label="Display name" defaultValue="Provider A" />
              <Field
                label="ANTHROPIC_BASE_URL"
                defaultValue="https://api.example.local/anthropic"
              />
              <Field label="ANTHROPIC_AUTH_TOKEN" defaultValue="••••••••••••••••••••••" />
              <Field label="API_TIMEOUT_MS" defaultValue="3000000" />
            </FormSection>
            <FormSection id="models" title="Models" description="Routing per role.">
              <Field label="ANTHROPIC_MODEL" defaultValue="demo-1.0" />
              <Field label="ANTHROPIC_DEFAULT_OPUS_MODEL" defaultValue="demo-1.0" />
              <Field label="ANTHROPIC_DEFAULT_SONNET_MODEL" defaultValue="demo-1" />
              <Field label="ANTHROPIC_DEFAULT_HAIKU_MODEL" defaultValue="demo-0.5-air" />
            </FormSection>
            <FormSection id="auth" title="Authentication & Routing">
              <Field label="Strategy" defaultValue="weighted-round-robin" />
              <Field label="Failover chain" defaultValue="provider-b → provider-c" />
            </FormSection>
            <FormSection id="advanced" title="Advanced">
              <Field label="ANTHROPIC_TEMPERATURE" defaultValue="0.2" />
              <Field label="ANTHROPIC_MAX_TOKENS" defaultValue="65536" />
              <Field label="DISABLE_TELEMETRY" defaultValue="1" />
            </FormSection>
          </FormPane>
        }
        json={<JsonPane title="Raw configuration" data={DEMO_CONFIG} />}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Config (single-entity) demo — rail-anchored, NO top chrome (§0b / §1b).
//
// Identity (brand + version + primary CTA) lives inside SectionRail.header.
// Both columns flush against the global topbar; the form scrolls inside its
// own pane while the rail stays sticky. No PageHeader above the layout.
// -----------------------------------------------------------------------------

function DemoConfigSingle() {
  const railHeader = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Cursor</h2>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          v0.42
        </Badge>
      </div>
      <Button size="sm" variant="outline" className="w-full gap-1.5">
        <Plus className="size-3.5" /> Open editor
      </Button>
    </div>
  );

  return (
    <div className="flex h-[680px] flex-col">
      {/* NO PageHeader above ConfigLayout — see §4a anti-pattern. */}
      <ConfigLayout
        storageKey="styleguide.config-single"
        left={<SectionRail header={railHeader} sections={DEMO_SECTIONS} />}
        form={
          <FormPane
            header={
              <div className="flex w-full items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Cursor IDE</p>
                  <p className="text-xs text-muted-foreground">
                    Last modified: 4/12/2026 · workspace synced
                  </p>
                </div>
                <Badge variant="outline">connected</Badge>
              </div>
            }
            footer={
              <>
                <Button size="sm">Save configuration</Button>
                <Button size="sm" variant="outline">
                  Open editor
                </Button>
              </>
            }
          >
            <FormSection id="general" title="General" description="Endpoint and identity.">
              <Field
                label="ANTHROPIC_BASE_URL"
                defaultValue="https://api.example.local/anthropic"
              />
              <Field label="Default profile" defaultValue="example-profile" />
              <Field label="API_TIMEOUT_MS" defaultValue="3000000" />
            </FormSection>
            <FormSection id="auth" title="Authentication">
              <Field label="Strategy" defaultValue="oauth" />
              <Field label="ANTHROPIC_AUTH_TOKEN" defaultValue="••••••••••••••••••••••" />
            </FormSection>
            <FormSection id="routing" title="Routing">
              <Field label="Strategy" defaultValue="weighted-round-robin" />
              <Field label="Failover chain" defaultValue="provider-b → provider-c" />
            </FormSection>
            <FormSection id="models" title="Models">
              <Field label="ANTHROPIC_MODEL" defaultValue="demo-1.0" />
              <Field label="ANTHROPIC_DEFAULT_OPUS_MODEL" defaultValue="demo-1.0" />
              <Field label="ANTHROPIC_DEFAULT_SONNET_MODEL" defaultValue="demo-1" />
              <Field label="ANTHROPIC_DEFAULT_HAIKU_MODEL" defaultValue="demo-0.5-air" />
            </FormSection>
            <FormSection id="tools" title="Tools & MCP">
              <Field label="MCP endpoint" defaultValue="(none)" />
            </FormSection>
            <FormSection id="advanced" title="Advanced">
              <Field label="ANTHROPIC_TEMPERATURE" defaultValue="0.2" />
              <Field label="ANTHROPIC_MAX_TOKENS" defaultValue="65536" />
              <Field label="DISABLE_TELEMETRY" defaultValue="1" />
            </FormSection>
          </FormPane>
        }
        json={
          <JsonPane
            title="Configuration"
            tabs={[
              { id: 'effective', label: 'Effective', data: DEMO_CONFIG },
              { id: 'override', label: 'Override', data: { strategy: 'failover-only' } },
            ]}
          />
        }
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Monitor demo
// -----------------------------------------------------------------------------

function DemoMonitor() {
  return (
    <div className="flex h-[720px] flex-col">
      <PageHeader
        title="Home"
        status={<Badge variant="secondary">All systems nominal</Badge>}
        actions={
          <Button size="sm" variant="outline">
            <RefreshCcw className="size-3.5" /> Refresh
          </Button>
        }
      />
      <MonitorLayout
        kpis={
          <KpiRow>
            <KpiCard
              label="Active accounts"
              value="87"
              hint="▲ 3 vs yesterday"
              tone="positive"
              icon={<ShieldCheck className="size-4" />}
            />
            <KpiCard
              label="Requests / 24h"
              value="12,481"
              hint="▲ 6.4%"
              tone="positive"
              icon={<Activity className="size-4" />}
            />
            <KpiCard label="Errors" value="12" hint="3 quota, 9 transient" tone="warning" />
            <KpiCard
              label="Uptime"
              value="99.98%"
              hint="30-day"
              icon={<Cpu className="size-4" />}
            />
          </KpiRow>
        }
      >
        <MonitorGrid>
          <MonitorCard
            span={8}
            title="Live account monitor"
            meta="realtime"
            description="Anonymized — Account 1, 2, …"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[42, 58, 31, 81, 12, 96, 24, 19].map((pct, i) => (
                <div key={i} className="rounded-md border bg-muted/30 p-2">
                  <p className="text-xs font-medium">Account {i + 1}</p>
                  <p className="text-[10px] text-muted-foreground">tier · {pct}%</p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded bg-muted">
                    <div
                      className={
                        pct > 80
                          ? 'h-full bg-destructive'
                          : pct > 60
                            ? 'h-full bg-amber-500'
                            : 'h-full bg-emerald-500'
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </MonitorCard>

          <MonitorCard span={4} title="Top providers" meta="24h">
            <ul className="space-y-1.5 text-sm">
              {[
                { name: 'Provider A', share: '62%' },
                { name: 'Provider C', share: '24%' },
                { name: 'Provider B', share: '9%' },
                { name: 'Provider D', share: '5%' },
              ].map((row) => (
                <li
                  key={row.name}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <span>{row.name}</span>
                  <span className="text-xs text-muted-foreground">{row.share}</span>
                </li>
              ))}
            </ul>
          </MonitorCard>

          <MonitorCard span={6} title="Requests" meta="last 24h">
            <div className="flex h-32 items-end gap-1">
              {[14, 22, 30, 38, 28, 35, 42, 55, 48, 60, 70, 64, 78, 82, 90, 88, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-accent/70"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </MonitorCard>

          <MonitorCard span={6} variant="terminal" title="$ ccs health --watch" meta="live">
            <pre className="text-xs leading-relaxed">
              {`[OK] cliproxy        :8317  uptime 14d 02h
[OK] dashboard       :3000  uptime 14d 02h
[OK] qdrant          :6333  uptime 21d 11h
[OK] postgres        :5432  uptime 47d 03h
[!]  ollama-gpu      gpu 78%  vram 9.4/12GB
[OK] runner          self-hosted online`}
            </pre>
          </MonitorCard>
        </MonitorGrid>
      </MonitorLayout>
    </div>
  );
}

// -----------------------------------------------------------------------------
// tiny field helper (extracted to shared component)
// -----------------------------------------------------------------------------
