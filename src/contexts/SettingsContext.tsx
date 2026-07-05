import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

export interface SystemSettings {
  gymName: string;
  staffRoles: string[];
  departments: string[];
  rooms: string[];
}

interface SettingsContextType {
  settings: SystemSettings | null;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, 'settings', 'general');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings({
          gymName: data.gymName || 'POWERPULSE GYM',
          staffRoles: Array.isArray(data.staffRoles) ? data.staffRoles : ['admin', 'manager', 'reception', 'cashier', 'trainer', 'accounting', 'warehouse_manager', 'hr', 'support'],
          departments: Array.isArray(data.departments) ? data.departments : ['Sales', 'Management', 'Training', 'Operations', 'Finance'],
          rooms: Array.isArray(data.rooms) ? data.rooms : ['Personal Training Area', 'Sala A', 'Sala B', 'Box Exterior'],
        });
      } else {
        setSettings({
          gymName: 'POWERPULSE GYM',
          staffRoles: ['admin', 'manager', 'reception', 'cashier', 'trainer', 'accounting', 'warehouse_manager', 'hr', 'support'],
          departments: ['Sales', 'Management', 'Training', 'Operations', 'Finance'],
          rooms: ['Personal Training Area', 'Sala A', 'Sala B', 'Box Exterior'],
        });
      }
      setLoading(false);
    }, (error) => {
      console.error("Failed to load settings from firestore:", error);
      // Fallback
      setSettings({
        gymName: 'POWERPULSE GYM',
        staffRoles: ['admin', 'manager', 'reception', 'cashier', 'trainer', 'accounting', 'warehouse_manager', 'hr', 'support'],
        departments: ['Sales', 'Management', 'Training', 'Operations', 'Finance'],
        rooms: ['Personal Training Area', 'Sala A', 'Sala B', 'Box Exterior'],
      });
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
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
