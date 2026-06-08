import { useTranslation } from 'react-i18next';
import { ConsoleToolbar } from './ConsoleToolbar';
import { ConsoleLogList } from './ConsoleLogList';
import { useConsolePolling } from './useConsolePolling';

export function ConsolePanel() {
  const { t } = useTranslation();
  const { error } = useConsolePolling();

  return (
    <div className="flex h-full flex-col">
      <ConsoleToolbar />
      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
          {t('console.fetchError')}
        </div>
      ) : null}
      <ConsoleLogList />
    </div>
  );
}

export default ConsolePanel;
