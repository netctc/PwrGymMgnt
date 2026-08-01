import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  DEFAULT_GENERAL_SETTINGS,
  fetchGeneralSettings,
  GENERAL_SETTINGS_UPDATED_EVENT,
  type GeneralSettings,
} from '../lib/generalSettings';

export type SystemSettings = GeneralSettings;

interface SettingsContextType {
  settings: SystemSettings | null;
  loading: boolean;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await fetchGeneralSettings());
    } catch (error) {
      console.error('Failed to load general settings:', error);
      setSettings(DEFAULT_GENERAL_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings();

    const handleSettingsUpdated = (event: Event) => {
      const updated = (event as CustomEvent<GeneralSettings>).detail;
      if (updated) setSettings(updated);
      else void refreshSettings();
    };
    window.addEventListener(GENERAL_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => window.removeEventListener(GENERAL_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
  }, [refreshSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
