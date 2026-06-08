import { useTranslation } from 'react-i18next';

interface PlaceholderProps {
  module: string;
}

export function Placeholder({ module }: PlaceholderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
      {t('placeholders.comingSoon', { module })}
    </div>
  );
}
