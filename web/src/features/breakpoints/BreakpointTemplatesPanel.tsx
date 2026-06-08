import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Edit2, X, Check, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  useBreakpointTemplatesStore,
  type BreakpointTemplate,
} from '@/store/breakpointTemplates';

const inputCls =
  'w-full rounded border border-neutral-200 bg-white px-2 py-1 text-[12px] focus:border-blue-400 focus:outline-none';
const btnCls =
  'inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-100';

function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<BreakpointTemplate>;
  onSave: (t: Omit<BreakpointTemplate, 'id'>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<'request' | 'response'>(initial?.type ?? 'response');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [statusCode, setStatusCode] = useState(String(initial?.statusCode ?? '200'));
  const [body, setBody] = useState(initial?.body ?? '');
  const [method, setMethod] = useState(initial?.method ?? '');

  const handleSave = () => {
    if (!name.trim()) return;
    const tmpl: Omit<BreakpointTemplate, 'id'> = {
      name: name.trim(),
      type,
      description: desc.trim() || undefined,
      body: body || undefined,
    };
    if (type === 'response') {
      const sc = parseInt(statusCode, 10);
      if (!isNaN(sc)) tmpl.statusCode = sc;
    }
    if (type === 'request' && method) {
      tmpl.method = method.toUpperCase();
    }
    onSave(tmpl);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="flex items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'request' | 'response')}
          className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px]"
        >
          <option value="response">{t('breakpointTemplates.typeResponse')}</option>
          <option value="request">{t('breakpointTemplates.typeRequest')}</option>
        </select>
        <input
          type="text"
          placeholder={t('breakpointTemplates.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn(inputCls, 'flex-1')}
          autoFocus
        />
      </div>

      <input
        type="text"
        placeholder={t('breakpointTemplates.descPlaceholder')}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        className={inputCls}
      />

      {type === 'response' && (
        <input
          type="number"
          placeholder="Status Code"
          value={statusCode}
          onChange={(e) => setStatusCode(e.target.value)}
          className={cn(inputCls, 'w-24')}
        />
      )}
      {type === 'request' && (
        <input
          type="text"
          placeholder="Method (optional)"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={cn(inputCls, 'w-24')}
        />
      )}

      <textarea
        placeholder={t('breakpointTemplates.bodyPlaceholder')}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className={cn(inputCls, 'resize-y font-mono')}
      />

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnCls}>
          <X className="h-3 w-3" />
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim()}
          className={cn(btnCls, 'border-blue-400 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40')}
        >
          <Check className="h-3 w-3" />
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: BreakpointTemplate }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const updateTemplate = useBreakpointTemplatesStore((s) => s.updateTemplate);
  const deleteTemplate = useBreakpointTemplatesStore((s) => s.deleteTemplate);

  if (editing) {
    return (
      <TemplateForm
        initial={template}
        onSave={(patch) => { updateTemplate(template.id, patch); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="group flex items-start gap-2 rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
              template.type === 'response'
                ? 'bg-violet-100 text-violet-700'
                : 'bg-amber-100 text-amber-700'
            )}
          >
            {template.type === 'response'
              ? t('breakpointTemplates.typeResponse')
              : t('breakpointTemplates.typeRequest')}
          </span>
          <span className="truncate text-[12px] font-medium text-neutral-800">{template.name}</span>
          {template.builtin && (
            <Lock className="h-3 w-3 shrink-0 text-neutral-400" />
          )}
        </div>
        {template.description && (
          <p className="mt-0.5 text-[11px] text-neutral-500 truncate">{template.description}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-neutral-400">
          {template.statusCode != null && <span>Status: {template.statusCode}</span>}
          {template.method && <span>Method: {template.method}</span>}
          {template.body && <span>Body: {template.body.slice(0, 30)}{template.body.length > 30 ? '…' : ''}</span>}
        </div>
      </div>
      {!template.builtin && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            title={t('common.rename')}
          >
            <Edit2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => deleteTemplate(template.id)}
            className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
            title={t('common.delete')}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function BreakpointTemplatesPanel() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const allTemplates = useBreakpointTemplatesStore((s) => s.allTemplates);
  const addTemplate = useBreakpointTemplatesStore((s) => s.addTemplate);

  const templates = allTemplates();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2">
        <span className="text-[13px] font-semibold text-neutral-800">
          {t('breakpointTemplates.title')}
        </span>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className={cn(btnCls, 'border-blue-400 bg-blue-600 text-white hover:bg-blue-700')}
        >
          <Plus className="h-3 w-3" />
          {t('breakpointTemplates.new')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {showForm && (
          <TemplateForm
            onSave={(t) => { addTemplate(t); setShowForm(false); }}
            onCancel={() => setShowForm(false)}
          />
        )}
        {templates.map((tmpl) => (
          <TemplateCard key={tmpl.id} template={tmpl} />
        ))}
        {templates.length === 0 && !showForm && (
          <div className="flex h-32 items-center justify-center text-[12px] text-neutral-400">
            {t('breakpointTemplates.empty')}
          </div>
        )}
      </div>
    </div>
  );
}
