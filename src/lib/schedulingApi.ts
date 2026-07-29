export type SchedulingPerson = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  role?: string;
  status?: string;
};

export type ClassSession = {
  id: string;
  title: string;
  trainerId?: string | null;
  trainerName?: string;
  capacity: number;
  enrolledCount: number;
  startTime: string;
  endTime: string;
  room: string;
  status: string;
  type?: string;
  level?: string;
  branch?: string;
};

export type ClassBooking = {
  id: string;
  classId: string;
  memberId: string;
  memberName?: string;
  status: string;
  bookedAt?: string;
  cancelledAt?: string | null;
};

export type PrivateClassSession = {
  id: string;
  seriesId?: string | null;
  memberId: string;
  memberName?: string;
  trainerId: string;
  trainerName?: string;
  startTime: string;
  endTime: string;
  room: string;
  status: string;
  level?: string;
  branch?: string;
  notes?: string;
};

export type SchedulingConflict = {
  type?: string;
  id?: string;
  title?: string;
  reason?: string;
  startTime?: string | null;
  endTime?: string | null;
  date?: string;
  conflicts?: SchedulingConflict[];
};

export class SchedulingApiError extends Error {
  status: number;
  conflicts: SchedulingConflict[];

  constructor(message: string, status: number, conflicts: SchedulingConflict[] = []) {
    super(message);
    this.name = 'SchedulingApiError';
    this.status = status;
    this.conflicts = conflicts;
  }
}

type ApiOptions = Omit<RequestInit, 'body'> & { body?: BodyInit | Record<string, unknown> | null };

async function apiRequest<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body as BodyInit | null | undefined;

  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SchedulingApiError(payload.error || `Request failed with ${response.status}`, response.status, payload.conflicts || []);
  }
  return payload as T;
}

function toQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export const schedulingApi = {
  getResources: () =>
    apiRequest<{
      members: SchedulingPerson[];
      limitedMembers: SchedulingPerson[];
      trainers: SchedulingPerson[];
      rooms: string[];
    }>('/api/scheduling/resources'),

  listClasses: (params: { from?: string; to?: string; trainerId?: string; branch?: string; type?: string; status?: string } = {}) =>
    apiRequest<{ classes: ClassSession[] }>(`/api/scheduling/classes${toQuery(params)}`),

  createClass: (payload: {
    title: string;
    trainerId?: string;
    trainerName?: string;
    capacity: number;
    startTime: string;
    durationMinutes: number;
    room: string;
    type?: string;
    level?: string;
    branch?: string;
    allowConflicts?: boolean;
  }) => apiRequest<{ classSession: ClassSession }>('/api/scheduling/classes', { method: 'POST', body: payload }),

  updateClass: (id: string, payload: Partial<ClassSession> & { durationMinutes?: number; allowConflicts?: boolean }) =>
    apiRequest<{ classSession: ClassSession }>(`/api/scheduling/classes/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),

  cancelClass: (id: string) =>
    apiRequest<{ success: boolean; status: string }>(`/api/scheduling/classes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listBookings: (classId: string) =>
    apiRequest<{ bookings: ClassBooking[] }>(`/api/scheduling/classes/${encodeURIComponent(classId)}/bookings`),

  createBooking: (classId: string, payload: { memberId: string; memberName?: string; allowConflicts?: boolean }) =>
    apiRequest<{ booking: ClassBooking }>(`/api/scheduling/classes/${encodeURIComponent(classId)}/bookings`, {
      method: 'POST',
      body: payload,
    }),

  cancelBooking: (bookingId: string) =>
    apiRequest<{ success: boolean; status: string }>(`/api/scheduling/bookings/${encodeURIComponent(bookingId)}`, { method: 'DELETE' }),

  listPrivateClasses: (params: {
    from?: string;
    to?: string;
    trainerId?: string;
    memberId?: string;
    status?: string;
    classType?: string;
    page?: number;
    pageSize?: number;
    audit?: boolean;
  } = {}) =>
    apiRequest<{
      privateClasses: PrivateClassSession[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }>(`/api/scheduling/private-classes${toQuery(params)}`),

  createPrivateClasses: (payload: {
    memberId: string;
    memberName?: string;
    trainerId: string;
    trainerName?: string;
    startDate: string;
    endDate: string;
    selectedDays: number[];
    startTime: string;
    durationMinutes: number;
    room: string;
    level?: string;
    branch?: string;
    notes?: string;
    allowConflicts?: boolean;
  }) => apiRequest<{ seriesId: string; privateClasses: PrivateClassSession[] }>('/api/scheduling/private-classes', { method: 'POST', body: payload }),

  cancelPrivateClass: (id: string, scope: 'single' | 'series' = 'single') =>
    apiRequest<{ success: boolean; status: string; scope: string }>(
      `/api/scheduling/private-classes/${encodeURIComponent(id)}${toQuery({ scope })}`,
      { method: 'DELETE' },
    ),

  updatePrivateClass: (id: string, payload: Partial<PrivateClassSession> & { durationMinutes?: number; allowConflicts?: boolean }) =>
    apiRequest<{ privateClass: PrivateClassSession }>(`/api/scheduling/private-classes/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),
};
