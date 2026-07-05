import { Languages } from 'lucide-react';
import { useLocalization } from '../contexts/LocalizationContext';
import type { SupportedLocale } from '../i18n/config';

export default function LanguageSwitcher() {
  const { locale, setLocale, supportedLocales, t, direction } = useLocalization();

  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-500" title={t('app.language')}>
      <Languages className="h-4 w-4 text-slate-400" aria-hidden="true" />
      <span className="sr-only">{t('app.language')}</span>
      <select
        value={locale}
        dir={direction}
        aria-label={t('app.language')}
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-[#6bfb53] focus:ring-2 focus:ring-[#6bfb53]/30"
        onChange={(event) => setLocale(event.target.value as SupportedLocale)}
      >
        {supportedLocales.map((language) => (
          <option key={language.code} value={language.code}>
            {language.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
