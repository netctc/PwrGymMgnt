/**
 * Client API for Biometric Profiles management.
 */

export type BiometricConsent = {
  id: string;
  personType: string;
  personId: string;
  consentType: string;
  granted: boolean;
  grantedAt: string | null;
  withdrawnAt: string | null;
  legalBasis: string | null;
  purpose: string | null;
  recordedBy: string;
};

export type BiometricProfile = {
  id: string;
  personType: string;
  personId: string;
  status: string;
  qualityScore: number | null;
  enrolledAt: string | null;
  enrolledBy: string;
  enrolledAtBranch: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
  lastRecognitionAt: string | null;
  version: number;
};

export type DeletionJob = {
  id: string;
  profileId: string;
  personType: string;
  personId: string;
  reason: string;
  status: string;
  requestedBy: string;
  requestedAt: string | null;
  completedAt: string | null;
};

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(url, { credentials: 'include', ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload as T;
}

export const biometricsApi = {
  // Consents
  listConsents: (personId: string) =>
    apiRequest<{ consents: BiometricConsent[] }>(`/api/biometrics/consents?personId=${encodeURIComponent(personId)}`),

  grantConsent: (payload: { personType: string; personId: string; legalBasis?: string; purpose?: string }) =>
    apiRequest<{ consent: BiometricConsent }>('/api/biometrics/consents', {
      method: 'POST',
      body: JSON.stringify({ ...payload, granted: true }),
    }),

  withdrawConsent: (payload: { personType: string; personId: string }) =>
    apiRequest<{ consent: BiometricConsent }>('/api/biometrics/consents', {
      method: 'POST',
      body: JSON.stringify({ ...payload, granted: false }),
    }),

  // Profiles
  listProfiles: (params: { personId?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.personId) query.set('personId', params.personId);
    if (params.status) query.set('status', params.status);
    const suffix = query.toString();
    return apiRequest<{ profiles: BiometricProfile[] }>(`/api/biometrics/profiles${suffix ? `?${suffix}` : ''}`);
  },

  enrollProfile: (payload: { personType: string; personId: string; templateReference: string; qualityScore?: number; branch?: string }) =>
    apiRequest<{ profile: BiometricProfile }>('/api/biometrics/profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  revokeProfile: (id: string, reason?: string) =>
    apiRequest<{ ok: boolean }>(`/api/biometrics/profiles/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  deleteProfile: (id: string) =>
    apiRequest<{ ok: boolean; deletionJobId: string }>(`/api/biometrics/profiles/${encodeURIComponent(id)}/delete`, {
      method: 'POST',
      body: '{}',
    }),

  // Deletion Jobs
  listDeletionJobs: () =>
    apiRequest<{ jobs: DeletionJob[] }>('/api/biometrics/deletion-jobs'),
};
