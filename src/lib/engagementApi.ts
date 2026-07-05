export type NotificationItem = {
  id: string;
  userId?: string | null;
  role?: string | null;
  title: string;
  body: string;
  type: string;
  channel: string;
  linkUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  ticketNumber: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string | null;
  inquiryType: string;
  priority: string;
  subject: string;
  description: string;
  status: string;
  assignedTo?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
};

export type SupportTicketMessage = {
  id: string;
  ticketId: string;
  authorEmail?: string | null;
  authorRole?: string | null;
  message: string;
  visibility: string;
  createdAt: string;
};

export type DeploymentCheck = {
  key: string;
  label: string;
  category: string;
  status: 'pass' | 'warning' | 'fail' | string;
};

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
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload as T;
}

export const engagementApi = {
  listNotifications: (params: { unreadOnly?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.unreadOnly) query.set('unreadOnly', 'true');
    const suffix = query.toString() ? `?${query}` : '';
    return apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>(`/api/engagement/notifications${suffix}`);
  },

  markNotificationRead: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/engagement/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),

  markAllNotificationsRead: () =>
    apiRequest<{ success: boolean }>('/api/engagement/notifications/read-all', { method: 'POST' }),

  createNotification: (notification: Partial<NotificationItem>) =>
    apiRequest<{ id: string }>('/api/engagement/notifications', { method: 'POST', body: notification }),

  getContactChannels: () =>
    apiRequest<{ channels: { email: string; phone: string; whatsapp: string; officeHours: string } }>('/api/engagement/contact-channels'),

  listSupportTickets: (params: { status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    const suffix = query.toString() ? `?${query}` : '';
    return apiRequest<{ tickets: SupportTicket[] }>(`/api/engagement/support/tickets${suffix}`);
  },

  createSupportTicket: (ticket: {
    name: string;
    email: string;
    phone?: string;
    type: string;
    priority?: string;
    subject?: string;
    description: string;
  }) => apiRequest<{ ticket: SupportTicket }>('/api/engagement/support/tickets', { method: 'POST', body: ticket }),

  getSupportTicket: (id: string) =>
    apiRequest<{ ticket: SupportTicket; messages: SupportTicketMessage[] }>(`/api/engagement/support/tickets/${encodeURIComponent(id)}`),

  addSupportMessage: (id: string, message: string) =>
    apiRequest<{ id: string }>(`/api/engagement/support/tickets/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: { message },
    }),

  updateSupportTicketStatus: (id: string, status: string) =>
    apiRequest<{ success: boolean; status: string }>(`/api/engagement/support/tickets/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      body: { status },
    }),

  getDeploymentReadiness: () =>
    apiRequest<{ checks: DeploymentCheck[]; generatedAt: string }>('/api/engagement/deployment-readiness'),
};
