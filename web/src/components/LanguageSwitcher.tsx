import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n';

const LABELS: Record<Locale, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
};

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage as Locale) ?? 'en-US';
  return (
    <select
      value={current}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
      className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm"
    >
      {SUPPORTED_LOCALES.map((lng) => (
        <option key={lng} value={lng}>
          {LABELS[lng]}
        </option>
      ))}
    </select>
  );
}
