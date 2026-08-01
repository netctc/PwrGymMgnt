export type Employee = {
  id: string;
  employeeCode?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  employmentStatus: string;
  contractType: string;
  hireDate?: string;
  baseSalary: number;
  payFrequency: string;
  allowanceHousing: number;
  allowanceTransport: number;
  allowanceMedical: number;
  deductionTax: number;
  deductionInsurance: number;
  vacationDaysRemaining: number;
  linkedUserId?: string;
  linkedUsername?: string;
  linkedUserRole?: string;
  linkedUserStatus?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  data?: Record<string, unknown>;
};

export type StaffShift = {
  id: string;
  userId: string;
  startTime: string;
  endTime: string;
  notes?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeName?: string;
  workDate: string;
  checkIn?: string;
  checkOut?: string;
  hoursWorked: number;
  status: string;
  notes?: string;
};

export type PayrollRun = {
  id: string;
  runMonth: string;
  status: string;
  employeeCount: number;
  totalBase: number;
  totalAllowances: number;
  totalBonuses: number;
  totalDeductions: number;
  totalNetPay: number;
  createdBy?: string;
  approvedBy?: string;
  paidAt?: string | null;
  createdAt?: string | null;
};

export type PayrollItem = {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  baseSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  attendanceDeduction: number;
  netPay: number;
  status: string;
  paidAt?: string | null;
  runMonth?: string;
};

export class HrPayrollApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HrPayrollApiError';
    this.status = status;
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
    throw new HrPayrollApiError(payload.error || `Request failed with ${response.status}`, response.status);
  }
  return payload as T;
}

function toQuery(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export const hrPayrollApi = {
  listEmployees: (params: { search?: string; status?: string } = {}) =>
    apiRequest<{ employees: Employee[] }>(`/api/hr/employees${toQuery(params)}`),

  createEmployee: (payload: Partial<Employee> & { createUserAccount?: boolean; userAccount?: Record<string, unknown> }) =>
    apiRequest<{ employee: Employee; user?: unknown }>('/api/hr/employees', { method: 'POST', body: payload }),

  updateEmployee: (id: string, payload: Partial<Employee> & { createUserAccount?: boolean; userAccount?: Record<string, unknown> }) =>
    apiRequest<{ employee: Employee; user?: unknown }>(`/api/hr/employees/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),

  updateEmployeeAccess: (id: string, payload: { role: string; password?: string }) =>
    apiRequest<{ employee: Employee }>(`/api/hr/employees/${encodeURIComponent(id)}/access`, { method: 'PUT', body: payload }),

  deleteEmployee: (id: string) =>
    apiRequest<{ ok: true; deactivated: true }>(`/api/hr/employees/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listShifts: (params: { employeeId?: string } = {}) =>
    apiRequest<{ shifts: StaffShift[] }>(`/api/hr/shifts${toQuery(params)}`),

  createShift: (payload: Omit<StaffShift, 'id'>) =>
    apiRequest<{ shift: StaffShift }>('/api/hr/shifts', { method: 'POST', body: payload }),

  createBulkShifts: (shifts: Array<Omit<StaffShift, 'id'>>) =>
    apiRequest<{ shifts: StaffShift[] }>('/api/hr/shifts/bulk', { method: 'POST', body: { shifts } }),

  updateShift: (id: string, payload: Omit<StaffShift, 'id'>) =>
    apiRequest<{ shift: StaffShift }>(`/api/hr/shifts/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),

  deleteShift: (id: string) =>
    apiRequest<{ ok: true }>(`/api/hr/shifts/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listAttendance: (params: { employeeId?: string; from?: string; to?: string } = {}) =>
    apiRequest<{ attendance: AttendanceRecord[] }>(`/api/hr/attendance${toQuery(params)}`),

  upsertAttendance: (payload: Partial<AttendanceRecord>) =>
    apiRequest<{ attendance: AttendanceRecord }>('/api/hr/attendance', { method: 'POST', body: payload }),

  listPayrollRuns: () => apiRequest<{ payrollRuns: PayrollRun[] }>('/api/hr/payroll/runs'),

  createPayrollRun: (payload: { runMonth: string; defaultBonus?: number; additionalDeduction?: number; replaceExisting?: boolean }) =>
    apiRequest<{ payrollRun: PayrollRun; items: PayrollItem[] }>('/api/hr/payroll/runs', { method: 'POST', body: payload }),

  getPayrollRun: (id: string) =>
    apiRequest<{ payrollRun: PayrollRun; items: PayrollItem[] }>(`/api/hr/payroll/runs/${encodeURIComponent(id)}`),

  approvePayrollRun: (id: string) =>
    apiRequest<{ payrollRun: PayrollRun }>(`/api/hr/payroll/runs/${encodeURIComponent(id)}/approve`, { method: 'POST' }),

  markPayrollRunPaid: (id: string) =>
    apiRequest<{ payrollRun: PayrollRun }>(`/api/hr/payroll/runs/${encodeURIComponent(id)}/mark-paid`, { method: 'POST' }),

  listPayrollHistory: (month?: string) =>
    apiRequest<{ items: PayrollItem[] }>(`/api/hr/payroll/history${toQuery({ month })}`),
};
