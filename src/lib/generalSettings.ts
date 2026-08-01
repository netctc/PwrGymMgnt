export interface GeneralSettings {
  gymName: string;
  staffRoles: string[];
  departments: string[];
  rooms: string[];
  ecardTitle: string;
  ecardNote: string;
  ecardBackgroundImage: string;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  gymName: 'POWERPULSE GYM',
  staffRoles: ['admin', 'manager', 'reception', 'cashier', 'trainer', 'accounting', 'warehouse_manager', 'hr', 'support'],
  departments: ['Sales', 'Management', 'Training', 'Operations', 'Finance'],
  rooms: ['Personal Training Area', 'Sala A', 'Sala B', 'Box Exterior'],
  ecardTitle: 'PowerGym QR e-Card',
  ecardNote: 'Present this QR e-card at reception for access validation.',
  ecardBackgroundImage: '',
};

async function readResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Settings request failed (${response.status})`);
  return { ...DEFAULT_GENERAL_SETTINGS, ...(data.settings || {}) } as GeneralSettings;
}

export async function fetchGeneralSettings() {
  return readResponse(await fetch('/api/settings/general'));
}

export async function saveGeneralSettings(settings: GeneralSettings) {
  return readResponse(await fetch('/api/settings/general', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }));
}

export const GENERAL_SETTINGS_UPDATED_EVENT = 'powergym:general-settings-updated';
