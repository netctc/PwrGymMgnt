import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  LOCALIZATION_STORAGE_KEY,
  SUPPORTED_LOCALES,
  getLocaleConfig,
  getLocaleDirection,
  isSupportedLocale,
  resolveInitialLocale,
  type SupportedLocale,
  type TextDirection,
} from '../i18n/config';
import { interpolate, translate, type TranslationKey } from '../i18n/translations';
import { observeStaticTextLocalization } from '../i18n/staticText';

interface LocalizationContextType {
  locale: SupportedLocale;
  direction: TextDirection;
  supportedLocales: typeof SUPPORTED_LOCALES;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  formatDateTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string) => string;
}

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

function getBrowserLocale(): string | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.languages?.[0] || navigator.language || null;
}

function getStoredLocale(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LOCALIZATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistLocale(locale: SupportedLocale) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALIZATION_STORAGE_KEY, locale);
  } catch {
    // Ignore storage restrictions in privacy modes; the current in-memory value still works.
  }
}

export function LocalizationProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => resolveInitialLocale({
    storedLocale: getStoredLocale(),
    browserLocale: getBrowserLocale(),
  }));

  const localeConfig = getLocaleConfig(locale);
  const direction = getLocaleDirection(locale);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = localeConfig.htmlLang;
    document.documentElement.dir = direction;
    document.documentElement.dataset.locale = locale;
  }, [direction, locale, localeConfig.htmlLang]);

  useEffect(() => observeStaticTextLocalization(locale), [locale]);

  const setLocale = (nextLocale: SupportedLocale) => {
    if (!isSupportedLocale(nextLocale)) return;
    setLocaleState(nextLocale);
    persistLocale(nextLocale);
  };

  const value = useMemo<LocalizationContextType>(() => {
    const intlLocale = localeConfig.intlLocale;
    return {
      locale,
      direction,
      supportedLocales: SUPPORTED_LOCALES,
      setLocale,
      t: (key, values) => interpolate(translate(locale, key), values),
      formatDateTime: (value, options = {}) => new Intl.DateTimeFormat(intlLocale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        ...options,
      }).format(new Date(value)),
      formatNumber: (value, options = {}) => new Intl.NumberFormat(intlLocale, options).format(value),
      formatCurrency: (value, currency = 'USD') => new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency,
      }).format(value),
    };
  }, [direction, locale, localeConfig.intlLocale]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
}
