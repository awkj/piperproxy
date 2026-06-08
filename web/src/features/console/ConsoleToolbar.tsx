import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Trash2, Search, Minimize2, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConsoleStore, useDistinctLogIds, useFilteredEntries } from './store';
import { KNOWN_LEVELS, type ConsoleLevel } from './types';
import { exportEntriesAsJson, exportEntriesAsLog, parseLogDump } from './exportLog';

const LEVEL_OPTIONS: ReadonlyArray<ConsoleLevel | 'all'> = ['all', ...KNOWN_LEVELS];

const ALL_LOG_IDS_VALUE = '__all__';
const EMPTY_LOG_ID_VALUE = '__empty__';

export function ConsoleToolbar() {
  const { t } = useTranslation();
  const paused = useConsoleStore((s) => s.paused);
  const togglePaused = useConsoleStore((s) => s.togglePaused);
  const clear = useConsoleStore((s) => s.clear);
  const filterText = useConsoleStore((s) => s.filterText);
  const setFilterText = useConsoleStore((s) => s.setFilterText);
  const levelFilter = useConsoleStore((s) => s.levelFilter);
  const setLevelFilter = useConsoleStore((s) => s.setLevelFilter);
  const logIdFilter = useConsoleStore((s) => s.logIdFilter);
  const setLogIdFilter = useConsoleStore((s) => s.setLogIdFilter);
  const collapseAll = useConsoleStore((s) => s.collapseAll);
  const totalCount = useConsoleStore((s) => s.entries.length);
  const importEntries = useConsoleStore((s) => s.importEntries);

  const distinctLogIds = useDistinctLogIds();
  const filteredEntries = useFilteredEntries();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const logIdSelectValue =
    logIdFilter === null
      ? ALL_LOG_IDS_VALUE
      : logIdFilter === ''
        ? EMPTY_LOG_ID_VALUE
        : logIdFilter;

  const onLogIdChange = (raw: string) => {
    if (raw === ALL_LOG_IDS_VALUE) setLogIdFilter(null);
    else if (raw === EMPTY_LOG_ID_VALUE) setLogIdFilter('');
    else setLogIdFilter(raw);
  };

  // 如果当前选中的 logId 已经不在 buffer 中（可能被 clear 或 trim 掉了），
  // 把它作为一个临时 option 附加到列表里，避免下拉显示空值。
  const logIdOptions = (() => {
    const opts = [...distinctLogIds];
    if (logIdFilter !== null && !opts.includes(logIdFilter)) {
      opts.push(logIdFilter);
    }
    return opts;
  })();

  const exportCount = filteredEntries.length;

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const entries = parseLogDump(text);
      if (entries.length === 0) {
        // 静默：没有可导入条目
        return;
      }
      importEntries(entries);
    } catch (err) {
      // 简单 alert 提示，避免拉一个完整 toast 系统
      // eslint-disable-next-line no-alert
      window.alert(
        t('console.importFailed', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={togglePaused}
        title={paused ? t('console.resume') : t('console.pause')}
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        {paused ? t('console.resume') : t('console.pause')}
      </Button>
      <Button variant="ghost" size="sm" onClick={clear} title={t('console.clear')}>
        <Trash2 className="h-3.5 w-3.5" />
        {t('console.clear')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={collapseAll}
        title={t('console.collapseAll')}
      >
        <Minimize2 className="h-3.5 w-3.5" />
        {t('console.collapseAll')}
      </Button>

      <select
        value={levelFilter}
        onChange={(e) => setLevelFilter(e.target.value as ConsoleLevel | 'all')}
        className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs focus:border-brand-500 focus:outline-none"
        title={t('console.levelFilter')}
      >
        {LEVEL_OPTIONS.map((lv) => (
          <option key={lv} value={lv}>
            {t(`console.level.${lv}`)}
          </option>
        ))}
      </select>

      <select
        value={logIdSelectValue}
        onChange={(e) => onLogIdChange(e.target.value)}
        className="h-8 max-w-[160px] truncate rounded-md border border-neutral-300 bg-white px-2 text-xs focus:border-brand-500 focus:outline-none"
        title={t('console.logIdFilter')}
      >
        <option value={ALL_LOG_IDS_VALUE}>{t('console.logId.all')}</option>
        {logIdOptions.map((id) => (
          <option
            key={id === '' ? EMPTY_LOG_ID_VALUE : id}
            value={id === '' ? EMPTY_LOG_ID_VALUE : id}
          >
            {id === '' ? t('console.logId.empty') : id}
          </option>
        ))}
      </select>

      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder={t('console.filterPlaceholder')}
          spellCheck={false}
          className="h-8 w-full rounded-md border border-neutral-300 bg-white pl-7 pr-3 text-xs focus:border-brand-500 focus:outline-none"
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={exportCount === 0}
            title={t('console.export')}
          >
            <Download className="h-3.5 w-3.5" />
            {t('console.export')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs">
          <DropdownMenuItem onSelect={() => exportEntriesAsLog(filteredEntries)}>
            {t('console.exportLog')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exportEntriesAsJson(filteredEntries)}>
            {t('console.exportJson')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleImportClick}
        title={t('console.import')}
      >
        <Upload className="h-3.5 w-3.5" />
        {t('console.import')}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />

      <span className="whitespace-nowrap text-xs text-neutral-500">
        {logIdFilter !== null || levelFilter !== 'all' || filterText.trim() !== ''
          ? t('console.filteredCount', { filtered: exportCount, total: totalCount })
          : t('console.totalCount', { count: totalCount })}
      </span>
    </div>
  );
}
