import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import {
  Check,
  CheckCircle,
  ChevronRight,
  ClipboardCopy,
  HelpCircle,
  Loader2,
  Play,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import {
  fetchSetupTargets,
  fetchDiagnostics,
  runSetupTest,
  SETUP_TARGETS_URL,
  type SetupTarget,
  type TargetCategory,
  type Snippet,
  type ShellVariant,
} from '@/api/setup';

// ── Category display config ─────────────────────────────────────────────────

const CATEGORY_ORDER: TargetCategory[] = [
  'runtime',
  'client',
  'device',
  'framework',
  'environment',
];

// ── Snippet display ─────────────────────────────────────────────────────────

const SHELL_LABELS: Record<ShellVariant, string> = {
  bash: 'bash',
  zsh: 'zsh',
  fish: 'fish',
  powershell: 'PowerShell',
  cmd: 'cmd',
};

function SnippetBlock({ snippets }: { snippets: Snippet[] }) {
  const { t } = useTranslation();
  const [activeShell, setActiveShell] = useState<ShellVariant>(
    snippets[0]?.shell ?? 'bash',
  );
  const [copied, setCopied] = useState(false);

  const active = snippets.find((s) => s.shell === activeShell) ?? snippets[0];

  const handleCopy = () => {
    if (!active) return;
    navigator.clipboard.writeText(active.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (!active) return null;

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50">
      {snippets.length > 1 && (
        <div className="flex items-center gap-1 border-b border-neutral-200 px-3 py-1.5">
          {snippets.map((s) => (
            <button
              key={s.shell}
              onClick={() => setActiveShell(s.shell)}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-mono transition-colors',
                activeShell === s.shell
                  ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-700',
              )}
            >
              {SHELL_LABELS[s.shell] ?? s.shell}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-neutral-800">
          {active.content}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
          title={t('common.copy')}
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Run Test button ─────────────────────────────────────────────────────────

function RunTestSection({ target }: { target: SetupTarget }) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!target.testScript) return null;

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await runSetupTest(target.id);
      setResult({ ok: r.ok, msg: r.ok ? r.output : r.error || r.output });
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {t('setup.runTest')}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={handleRun}
          disabled={running}
          className="gap-1.5"
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {running ? t('setup.testing') : t('setup.verify')}
        </Button>
        {result && (
          <div
            className={cn(
              'flex items-center gap-1 text-sm',
              result.ok ? 'text-green-600' : 'text-red-600',
            )}
          >
            {result.ok ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <span className="line-clamp-1 max-w-xs">{result.msg}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Trust Diagnostics ───────────────────────────────────────────────────────

function DiagnosticsSection() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const DIAGNOSE_URL = 'api/setup/diagnose';
  const { data, isLoading, mutate } = useSWR(
    show ? DIAGNOSE_URL : null,
    fetchDiagnostics,
    { revalidateOnFocus: false },
  );

  const statusIcon = (s: string) => {
    if (s === 'ok') return <ShieldCheck className="h-4 w-4 text-green-500" />;
    if (s === 'missing') return <ShieldAlert className="h-4 w-4 text-red-500" />;
    return <HelpCircle className="h-4 w-4 text-yellow-500" />;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t('setup.diagnostics')}
        </div>
        <button
          onClick={() => {
            setShow((p) => !p);
            if (show) mutate(undefined);
          }}
          className="text-xs text-brand-600 hover:underline"
        >
          {show ? t('common.close') : t('setup.runDiagnostics')}
        </button>
      </div>
      {show && (
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : data ? (
            <div className="space-y-2">
              <div className="text-xs text-neutral-400">{t('setup.platform')}: {data.os}</div>
              {data.items.map((item) => (
                <div key={item.name} className="flex items-start gap-2">
                  {statusIcon(item.status)}
                  <div>
                    <div className="text-sm font-medium text-neutral-800">
                      {item.name}
                    </div>
                    <div className="text-xs text-neutral-500">{item.message}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Target detail pane ──────────────────────────────────────────────────────

function TargetDetail({ target }: { target: SetupTarget }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5 p-5">
      <div>
        <div className="text-lg font-semibold text-neutral-900">{target.name}</div>
        {target.docs && (
          <p className="mt-1 text-sm text-neutral-600">{target.docs}</p>
        )}
      </div>

      {target.snippets.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t('setup.snippet')}
          </div>
          <SnippetBlock snippets={target.snippets} />
        </div>
      )}

      <RunTestSection target={target} />

      <DiagnosticsSection />
    </div>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

function TargetSidebar({
  targets,
  selectedId,
  onSelect,
  search,
  onSearchChange,
}: {
  targets: SetupTarget[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const { t } = useTranslation();

  const filtered = useMemo(() => {
    if (!search) return targets;
    const q = search.toLowerCase();
    return targets.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [targets, search]);

  const grouped = useMemo(() => {
    const map = new Map<TargetCategory, SetupTarget[]>();
    for (const cat of CATEGORY_ORDER) {
      const items = filtered.filter((t) => t.category === cat);
      if (items.length > 0) map.set(cat, items);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50">
      <div className="p-2">
        <div className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('setup.searchPlaceholder')}
            className="w-full bg-transparent text-xs outline-none placeholder:text-neutral-400"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {Array.from(grouped.entries()).map(([cat, items]) => (
          <div key={cat}>
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              {t(`setup.category.${cat}`)}
            </div>
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-1.5 text-sm transition-colors',
                  selectedId === item.id
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-neutral-700 hover:bg-neutral-200/50',
                )}
              >
                <span>{item.name}</span>
                {selectedId === item.id && (
                  <ChevronRight className="h-3.5 w-3.5 text-brand-500" />
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

export function SetupPanel() {
  const { t } = useTranslation();
  const { data, isLoading } = useSWR(SETUP_TARGETS_URL, fetchSetupTargets, {
    revalidateOnFocus: false,
  });
  const targets = data?.targets ?? [];

  const [selectedId, setSelectedId] = useState<string | null>('nodejs');
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => targets.find((t) => t.id === selectedId) ?? targets[0] ?? null,
    [targets, selectedId],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <TargetSidebar
        targets={targets}
        selectedId={selectedId ?? selected?.id ?? null}
        onSelect={setSelectedId}
        search={search}
        onSearchChange={setSearch}
      />
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <TargetDetail target={selected} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            {t('setup.selectTarget')}
          </div>
        )}
      </div>
    </div>
  );
}
