export const LOCALIZATION_STORAGE_KEY = 'powergym.locale';

export const SUPPORTED_LOCALES = [
  {
    code: 'en',
    label: 'English',
    nativeLabel: 'English',
    direction: 'ltr',
    htmlLang: 'en',
    intlLocale: 'en-US',
  },
  {
    code: 'fr',
    label: 'French',
    nativeLabel: 'Français',
    direction: 'ltr',
    htmlLang: 'fr',
    intlLocale: 'fr-FR',
  },
  {
    code: 'ar',
    label: 'Arabic',
    nativeLabel: 'العربية',
    direction: 'rtl',
    htmlLang: 'ar',
    intlLocale: 'ar-LB',
  },
  {
    code: 'es',
    label: 'Spanish',
    nativeLabel: 'Español',
    direction: 'ltr',
    htmlLang: 'es',
    intlLocale: 'es-ES',
  },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]['code'];
export type TextDirection = (typeof SUPPORTED_LOCALES)[number]['direction'];

const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.some((locale) => locale.code === value);
}

export function getLocaleConfig(locale: SupportedLocale) {
  return SUPPORTED_LOCALES.find((candidate) => candidate.code === locale) || SUPPORTED_LOCALES[0];
}

export function getLocaleDirection(locale: SupportedLocale): TextDirection {
  return getLocaleConfig(locale).direction;
}

export function resolveLocale(candidate?: string | null): SupportedLocale {
  if (!candidate) return DEFAULT_LOCALE;
  const normalized = candidate.toLowerCase();
  if (isSupportedLocale(normalized)) return normalized;
  const languagePrefix = normalized.split('-')[0];
  return isSupportedLocale(languagePrefix) ? languagePrefix : DEFAULT_LOCALE;
}

export function resolveInitialLocale(options: {
  storedLocale?: string | null;
  browserLocale?: string | null;
} = {}): SupportedLocale {
  if (isSupportedLocale(options.storedLocale)) return options.storedLocale;
  return resolveLocale(options.browserLocale);
}
