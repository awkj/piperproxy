import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/ui';

// ——— util: UTF-8 safe Base64 ———
function base64Encode(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1: string) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

function base64Decode(b64: string): string {
  return decodeURIComponent(
    atob(b64)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
}

// ——— util: copy to clipboard ———
function useCopied(timeout = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), timeout);
      } catch {
        // ignore
      }
    },
    [timeout]
  );
  return { copied, copy };
}

// ——— shared ToolPane layout ———
interface ToolPaneProps {
  input: string;
  output: string;
  onInputChange: (v: string) => void;
  inputLabel: string;
  outputLabel: string;
  actions: React.ReactNode;
  inputPlaceholder?: string;
  outputPlaceholder?: string;
  error?: string;
}

function ToolPane({
  input,
  output,
  onInputChange,
  inputLabel,
  outputLabel,
  actions,
  inputPlaceholder,
  outputPlaceholder,
  error,
}: ToolPaneProps) {
  const { t } = useTranslation();
  const { copied, copy } = useCopied();

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-neutral-600">{inputLabel}</label>
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={inputPlaceholder}
          className="h-32 resize-none rounded-md border border-neutral-300 bg-white p-2 font-mono text-xs text-neutral-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          spellCheck={false}
        />
      </div>

      <div className="flex flex-wrap gap-2">{actions}</div>

      {error && (
        <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">{error}</p>
      )}

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-neutral-600">{outputLabel}</label>
          <button
            type="button"
            onClick={() => copy(output)}
            disabled={!output}
            title={t('common.copy')}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t('common.copied') : t('common.copy')}
          </button>
        </div>
        <textarea
          readOnly
          value={output}
          placeholder={outputPlaceholder}
          className="flex-1 resize-none rounded-md border border-neutral-200 bg-neutral-50 p-2 font-mono text-xs text-neutral-700"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// ——— URL codec tool ———
function UrlTool() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const encode = () => {
    setError('');
    setOutput(encodeURIComponent(input));
  };

  const decode = () => {
    setError('');
    try {
      setOutput(decodeURIComponent(input));
    } catch {
      setError(t('tools.url.decodeError'));
    }
  };

  return (
    <ToolPane
      input={input}
      output={output}
      onInputChange={(v) => { setInput(v); setOutput(''); setError(''); }}
      inputLabel={t('tools.url.inputLabel')}
      outputLabel={t('tools.url.outputLabel')}
      inputPlaceholder={t('tools.url.placeholder')}
      error={error}
      actions={
        <>
          <Button size="sm" variant="primary" onClick={encode} disabled={!input}>
            {t('tools.url.encode')}
          </Button>
          <Button size="sm" variant="default" onClick={decode} disabled={!input}>
            {t('tools.url.decode')}
          </Button>
        </>
      }
    />
  );
}

// ——— Base64 tool ———
function Base64Tool() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const encode = () => {
    setError('');
    try {
      setOutput(base64Encode(input));
    } catch {
      setError(t('tools.base64.encodeError'));
    }
  };

  const decode = () => {
    setError('');
    try {
      setOutput(base64Decode(input));
    } catch {
      setError(t('tools.base64.decodeError'));
    }
  };

  return (
    <ToolPane
      input={input}
      output={output}
      onInputChange={(v) => { setInput(v); setOutput(''); setError(''); }}
      inputLabel={t('tools.base64.inputLabel')}
      outputLabel={t('tools.base64.outputLabel')}
      inputPlaceholder={t('tools.base64.placeholder')}
      error={error}
      actions={
        <>
          <Button size="sm" variant="primary" onClick={encode} disabled={!input}>
            {t('tools.base64.encode')}
          </Button>
          <Button size="sm" variant="default" onClick={decode} disabled={!input}>
            {t('tools.base64.decode')}
          </Button>
        </>
      }
    />
  );
}

// ——— JSON tool ———
function JsonTool() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const format = () => {
    setError('');
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const minify = () => {
    setError('');
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <ToolPane
      input={input}
      output={output}
      onInputChange={(v) => { setInput(v); setOutput(''); setError(''); }}
      inputLabel={t('tools.json.inputLabel')}
      outputLabel={t('tools.json.outputLabel')}
      inputPlaceholder={t('tools.json.placeholder')}
      error={error}
      actions={
        <>
          <Button size="sm" variant="primary" onClick={format} disabled={!input}>
            {t('tools.json.format')}
          </Button>
          <Button size="sm" variant="default" onClick={minify} disabled={!input}>
            {t('tools.json.minify')}
          </Button>
        </>
      }
    />
  );
}

// ——— Tabs ———
type ToolTab = 'url' | 'base64' | 'json';

const TOOL_TABS: ToolTab[] = ['url', 'base64', 'json'];

const TOOL_COMPONENTS: Record<ToolTab, React.ComponentType> = {
  url: UrlTool,
  base64: Base64Tool,
  json: JsonTool,
};

// ——— Drawer shell ———
export function ToolsDrawer() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.toolsOpen);
  const setOpen = useUIStore((s) => s.setToolsOpen);
  const [activeTab, setActiveTab] = useState<ToolTab>('url');

  if (!open) return null;

  const ActiveTool = TOOL_COMPONENTS[activeTab];

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">{t('tools.title')}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('common.close')}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-200 px-2">
          {TOOL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                activeTab === tab
                  ? 'border-b-2 border-brand-600 text-brand-600'
                  : 'text-neutral-500 hover:text-neutral-800'
              )}
            >
              {t(`tools.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Tool content */}
        <div className="flex-1 overflow-auto p-4">
          <ActiveTool />
        </div>
      </div>
    </>
  );
}
