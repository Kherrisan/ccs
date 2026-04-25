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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  endpoint: 'https://example.local:8317',
  strategy: 'weighted-round-robin',
  accounts: 14,
  failover: ['provider-b', 'provider-c'],
  timeout_ms: 30000,
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
        title="1c. PageHeader — title + description + actions (health pattern)"
        anchor="page-header"
      >
        <DemoPageHeader />
      </PrimitiveSection>

      <PrimitiveSection
        title="2a. Config archetype — multi-entity (ListPane)"
        anchor="config-multi"
      >
        <DemoConfigMulti />
      </PrimitiveSection>

      <PrimitiveSection
        title="2b. Config archetype — single-entity (SectionRail)"
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
    <header className="mx-auto max-w-4xl space-y-3 text-center">
      <Badge variant="outline" className="font-mono">
        DEV ONLY · /_styleguide
      </Badge>
      <h1 className="text-3xl font-bold tracking-tight">CCS Dashboard Design System</h1>
      <p className="text-muted-foreground">
        Three identity-strip patterns — <strong>HeroBar</strong> (one-row dense, see <code>/</code>{' '}
        home page), <strong>rail-anchored</strong> (no top chrome, see <code>/cliproxy</code>), and{' '}
        <strong>PageHeader</strong> (title + description + actions, see <code>/health</code>) — and
        two body archetypes: <strong>Config</strong> (3-pane: list / form / JSON) and{' '}
        <strong>Monitor</strong> (KPI row + grid). Pick the identity strip that matches your
        page&apos;s shape; pick the body archetype your content needs.
      </p>
      <p className="text-xs text-muted-foreground">
        See <code>ui/docs/design-system.md</code> for the decision table.
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
        left={railHeader}
        form={
          <FormPane
            header={<p className="text-sm font-semibold">Provider A</p>}
            footer={<Button size="sm">Save</Button>}
          >
            <FormSection id="general" title="General">
              <Field label="Endpoint" defaultValue="https://example.local:8317" />
            </FormSection>
          </FormPane>
        }
        json={<JsonPane title="Effective" data={DEMO_CONFIG} />}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// PageHeader demo (canonical: pages/health.tsx)
//
// Traditional title row with description and trailing actions. Use when the
// page does NOT fit either canonical hero AND the description carries
// non-redundant context (last refresh, page hierarchy, filter state, version).
// -----------------------------------------------------------------------------

function DemoPageHeader() {
  return (
    <PageShell>
      <PageHeader
        title="Demo Page"
        description="PageShell + PageHeader provide consistent chrome for every page."
        status={<Badge variant="secondary">Running</Badge>}
        actions={
          <>
            <Button variant="outline" size="sm">
              Refresh
            </Button>
            <Button size="sm">
              <Plus className="size-3.5" /> New
            </Button>
          </>
        }
      />
      <div className="p-6 text-sm text-muted-foreground">Page body renders below the header.</div>
    </PageShell>
  );
}

// -----------------------------------------------------------------------------
// Config (multi-entity) demo
// -----------------------------------------------------------------------------

function DemoConfigMulti() {
  const [selectedId, setSelectedId] = useState<string>('provider-a');
  const [search, setSearch] = useState('');

  const filtered = DEMO_PROVIDERS.filter((p) =>
    String(p.label).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[640px] flex-col">
      <PageHeader
        title="CLIProxy"
        status={<Badge variant="secondary">Multi-entity demo</Badge>}
        actions={
          <Button size="sm">
            <Plus className="size-3.5" /> New provider
          </Button>
        }
      />
      <ConfigLayout
        left={
          <ListPane
            items={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search providers…"
            footer={
              <Button variant="outline" size="sm" className="w-full">
                <Plus className="size-3.5" /> Add provider
              </Button>
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
            <FormSection id="general" title="General" description="Endpoint and routing strategy.">
              <Field label="Display name" defaultValue="Provider A" />
              <Field label="Endpoint" defaultValue="https://example.local:8317" />
            </FormSection>
            <FormSection id="auth" title="Authentication">
              <Field label="Strategy" defaultValue="weighted-round-robin" />
            </FormSection>
          </FormPane>
        }
        json={<JsonPane title="Effective" data={DEMO_CONFIG} />}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Config (single-entity) demo
// -----------------------------------------------------------------------------

function DemoConfigSingle() {
  return (
    <div className="flex h-[680px] flex-col">
      <PageHeader
        title="Cursor"
        description="Single-entity config with SectionRail."
        status={<Badge variant="secondary">v0.42 · connected</Badge>}
        actions={
          <Button size="sm">
            <Plus className="size-3.5" /> Open editor
          </Button>
        }
      />
      <ConfigLayout
        left={<SectionRail sections={DEMO_SECTIONS} />}
        form={
          <FormPane footer={<Button size="sm">Save configuration</Button>}>
            <FormSection id="general" title="General" description="Top-level identity.">
              <Field label="Endpoint" defaultValue="https://example.local:8317" />
              <Field label="Default profile" defaultValue="example-profile" />
            </FormSection>
            <FormSection id="auth" title="Authentication">
              <Field label="Strategy" defaultValue="oauth" />
            </FormSection>
            <FormSection id="routing" title="Routing">
              <Field label="Strategy" defaultValue="weighted-round-robin" />
              <Field label="Failover chain" defaultValue="provider-b → provider-c" />
            </FormSection>
            <FormSection id="models" title="Models">
              <Field label="Default model" defaultValue="model-x" />
            </FormSection>
            <FormSection id="tools" title="Tools & MCP">
              <Field label="MCP endpoint" defaultValue="(none)" />
            </FormSection>
            <FormSection id="advanced" title="Advanced">
              <Field label="Timeout (ms)" defaultValue="30000" />
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
// tiny field helper
// -----------------------------------------------------------------------------

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Input defaultValue={defaultValue} className="font-mono text-sm" />
    </div>
  );
}
