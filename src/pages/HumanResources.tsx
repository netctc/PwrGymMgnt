import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Briefcase, CalendarCheck, CheckCircle2, DollarSign, Loader2, Plus, RefreshCw, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Employee, PayrollItem, PayrollRun, hrPayrollApi } from '../lib/hrPayrollApi';
import ScreenReportActions from '../components/ScreenReportActions';

const EMPLOYEE_USER_ROLES = ['admin', 'manager', 'warehouse_manager', 'accounting', 'cashier', 'reception', 'trainer'];

const EMPLOYEE_USER_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  warehouse_manager: 'Warehouse Manager',
  accounting: 'Accounting',
  cashier: 'Cashier',
  reception: 'Reception',
  trainer: 'Trainer',
};

const emptyEmployeeUserAccountForm = {
  username: '',
  password: '',
  role: 'trainer',
  status: 'active',
};

const emptyEmployeeForm: Partial<Employee> = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  department: 'General',
  jobTitle: '',
  employmentStatus: 'active',
  contractType: 'full-time',
  hireDate: new Date().toISOString().slice(0, 10),
  baseSalary: 0,
  payFrequency: 'monthly',
  allowanceHousing: 0,
  allowanceTransport: 0,
  allowanceMedical: 0,
  deductionTax: 0,
  deductionInsurance: 0,
  vacationDaysRemaining: 0,
};

const today = new Date().toISOString().slice(0, 10);
const currentMonth = new Date().toISOString().slice(0, 7);

function money(value: number | undefined) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value || 0));
}

function employeeName(employee: Pick<Employee, 'firstName' | 'lastName'>) {
  return `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Unnamed employee';
}

function statusBadge(status: string) {
  const normalized = status || 'draft';
  const variant = normalized === 'paid' || normalized === 'active' ? 'default' : normalized === 'approved' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{normalized.replace(/_/g, ' ')}</Badge>;
}

export default function HumanResources() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'employees';
  const activeTab = ['employees', 'attendance', 'payroll'].includes(requestedTab) ? requestedTab : 'employees';
  const updateActiveTab = (value: string) => setSearchParams({ tab: value });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [payrollItems, setPayrollItems] = useState<PayrollItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [showEmployeeDialog, setShowEmployeeDialog] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState<Partial<Employee>>(emptyEmployeeForm);
  const [createUserForEmployee, setCreateUserForEmployee] = useState(false);
  const [employeeUserAccountForm, setEmployeeUserAccountForm] = useState(emptyEmployeeUserAccountForm);
  const [attendanceEmployeeId, setAttendanceEmployeeId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [attendanceStatus, setAttendanceStatus] = useState('present');
  const [attendanceHours, setAttendanceHours] = useState('8');
  const [attendanceNotes, setAttendanceNotes] = useState('');
  const [runMonth, setRunMonth] = useState(currentMonth);
  const [defaultBonus, setDefaultBonus] = useState('0');
  const [additionalDeduction, setAdditionalDeduction] = useState('0');
  const canCreateUserForCurrentEmployee = !editingEmployeeId || !employeeForm.linkedUserId;

  const activeEmployees = useMemo(() => employees.filter((employee) => employee.employmentStatus === 'active'), [employees]);
  const monthlyPayrollTotal = useMemo(() => payrollRuns.find((run) => run.runMonth === currentMonth)?.totalNetPay || 0, [payrollRuns]);
  const averageSalary = useMemo(() => {
    if (activeEmployees.length === 0) return 0;
    return activeEmployees.reduce((sum, employee) => sum + Number(employee.baseSalary || 0), 0) / activeEmployees.length;
  }, [activeEmployees]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [employeeResult, runResult] = await Promise.all([
        hrPayrollApi.listEmployees({ search, status: statusFilter }),
        hrPayrollApi.listPayrollRuns(),
      ]);
      setEmployees(employeeResult.employees);
      setPayrollRuns(runResult.payrollRuns);
      if (runResult.payrollRuns.length > 0 && !selectedRun) {
        await loadPayrollRun(runResult.payrollRuns[0].id);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load HR data');
    } finally {
      setLoading(false);
    }
  };

  const loadPayrollRun = async (id: string) => {
    try {
      const result = await hrPayrollApi.getPayrollRun(id);
      setSelectedRun(result.payrollRun);
      setPayrollItems(result.items);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load payroll run');
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateEmployee = () => {
    setEditingEmployeeId(null);
    setEmployeeForm(emptyEmployeeForm);
    setCreateUserForEmployee(false);
    setEmployeeUserAccountForm(emptyEmployeeUserAccountForm);
    setShowEmployeeDialog(true);
  };

  const openEditEmployee = (employee: Employee) => {
    setEditingEmployeeId(employee.id);
    setEmployeeForm(employee);
    setCreateUserForEmployee(false);
    setEmployeeUserAccountForm(emptyEmployeeUserAccountForm);
    setShowEmployeeDialog(true);
  };

  const updateEmployeeForm = (key: keyof Employee, value: string | number) => {
    setEmployeeForm((current) => ({ ...current, [key]: value }));
  };

  const updateEmployeeUserAccountForm = (key: keyof typeof emptyEmployeeUserAccountForm, value: string) => {
    setEmployeeUserAccountForm((current) => ({ ...current, [key]: value }));
  };

  const saveEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...employeeForm,
        baseSalary: Number(employeeForm.baseSalary || 0),
        allowanceHousing: Number(employeeForm.allowanceHousing || 0),
        allowanceTransport: Number(employeeForm.allowanceTransport || 0),
        allowanceMedical: Number(employeeForm.allowanceMedical || 0),
        deductionTax: Number(employeeForm.deductionTax || 0),
        deductionInsurance: Number(employeeForm.deductionInsurance || 0),
        vacationDaysRemaining: Number(employeeForm.vacationDaysRemaining || 0),
        ...(createUserForEmployee ? {
          createUserAccount: true,
          userAccount: employeeUserAccountForm,
        } : {}),
      };
      if (editingEmployeeId) {
        await hrPayrollApi.updateEmployee(editingEmployeeId, payload);
        toast.success(createUserForEmployee ? 'Employee updated and linked user account created' : 'Employee updated');
      } else {
        await hrPayrollApi.createEmployee(payload);
        toast.success(createUserForEmployee ? 'Employee and linked user account created' : 'Employee created');
      }
      setShowEmployeeDialog(false);
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save employee');
    } finally {
      setSaving(false);
    }
  };

  const saveAttendance = async () => {
    if (!attendanceEmployeeId) {
      toast.error('Select an employee first');
      return;
    }
    setSaving(true);
    try {
      await hrPayrollApi.upsertAttendance({
        employeeId: attendanceEmployeeId,
        workDate: attendanceDate,
        status: attendanceStatus,
        hoursWorked: Number(attendanceHours || 0),
        notes: attendanceNotes,
      });
      toast.success('Attendance saved');
      setAttendanceNotes('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const generatePayroll = async () => {
    setSaving(true);
    try {
      const result = await hrPayrollApi.createPayrollRun({
        runMonth,
        defaultBonus: Number(defaultBonus || 0),
        additionalDeduction: Number(additionalDeduction || 0),
        replaceExisting: true,
      });
      setSelectedRun(result.payrollRun);
      setPayrollItems(result.items);
      toast.success('Payroll generated');
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate payroll');
    } finally {
      setSaving(false);
    }
  };

  const approvePayroll = async () => {
    if (!selectedRun) return;
    setSaving(true);
    try {
      const result = await hrPayrollApi.approvePayrollRun(selectedRun.id);
      setSelectedRun(result.payrollRun);
      await loadData();
      toast.success('Payroll approved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve payroll');
    } finally {
      setSaving(false);
    }
  };

  const markPayrollPaid = async () => {
    if (!selectedRun) return;
    setSaving(true);
    try {
      const result = await hrPayrollApi.markPayrollRunPaid(selectedRun.id);
      setSelectedRun(result.payrollRun);
      await loadData();
      toast.success('Payroll marked as paid');
    } catch (error: any) {
      toast.error(error.message || 'Failed to mark payroll as paid');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">HR & Payroll</h1>
          <p className="text-sm text-muted-foreground">Manage employees, attendance, contracts, salary rules, payroll runs, and approvals.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={openCreateEmployee}>
            <Plus className="mr-2 h-4 w-4" /> Add employee
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{activeEmployees.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average base salary</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{money(averageSalary)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This month payroll</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{money(monthlyPayrollTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payroll runs</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{payrollRuns.length}</div></CardContent>
        </Card>
      </div>

      <ScreenReportActions
        reportIds={['employee-profiles', 'payroll-runs', 'payroll-items']}
        params={{ status: statusFilter, q: search }}
        title="HR and payroll PDFs"
        description="Generate employee profile and payroll reports directly from HR filters."
      />

      <Tabs value={activeTab} onValueChange={updateActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Employee directory</CardTitle>
              <CardDescription>Search and maintain employee salary, contract, and allowance records.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 md:flex-row">
                <Input placeholder="Search employees" value={search} onChange={(event) => setSearch(event.target.value)} className="md:max-w-sm" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={loadData} disabled={loading}>Apply</Button>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading HR data...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Base salary</TableHead>
                      <TableHead>Allowances</TableHead>
                      <TableHead>Deductions</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>User account</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell>
                          <div className="font-medium">{employeeName(employee)}</div>
                          <div className="text-xs text-muted-foreground">{employee.email || employee.employeeCode || 'No email/code'}</div>
                        </TableCell>
                        <TableCell>{employee.department || 'General'}</TableCell>
                        <TableCell>{employee.contractType}</TableCell>
                        <TableCell>{money(employee.baseSalary)}</TableCell>
                        <TableCell>{money((employee.allowanceHousing || 0) + (employee.allowanceTransport || 0) + (employee.allowanceMedical || 0))}</TableCell>
                        <TableCell>{money((employee.deductionTax || 0) + (employee.deductionInsurance || 0))}</TableCell>
                        <TableCell>{statusBadge(employee.employmentStatus)}</TableCell>
                        <TableCell>
                          {employee.linkedUserId ? (
                            <div>
                              <div className="text-sm font-medium">@{employee.linkedUsername || 'linked'}</div>
                              <div className="text-xs text-muted-foreground">{EMPLOYEE_USER_ROLE_LABELS[employee.linkedUserRole || ''] || employee.linkedUserRole} · {employee.linkedUserStatus}</div>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">Not linked</span>}
                        </TableCell>
                        <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => openEditEmployee(employee)}>Edit</Button></TableCell>
                      </TableRow>
                    ))}
                    {employees.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No employees found.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Attendance capture</CardTitle>
              <CardDescription>Record daily attendance. Absent and unpaid leave entries are deducted during payroll generation.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2 lg:col-span-2">
                <Label>Employee</Label>
                <Select value={attendanceEmployeeId} onValueChange={setAttendanceEmployeeId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {activeEmployees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employeeName(employee)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={attendanceStatus} onValueChange={setAttendanceStatus}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="paid_leave">Paid leave</SelectItem>
                    <SelectItem value="unpaid_leave">Unpaid leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input type="number" value={attendanceHours} onChange={(event) => setAttendanceHours(event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2 lg:col-span-4">
                <Label>Notes</Label>
                <Textarea value={attendanceNotes} onChange={(event) => setAttendanceNotes(event.target.value)} placeholder="Optional attendance note" />
              </div>
              <div className="flex items-end">
                <Button onClick={saveAttendance} disabled={saving} className="w-full"><CheckCircle2 className="mr-2 h-4 w-4" /> Save attendance</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Generate payroll</CardTitle>
                <CardDescription>Create a monthly payroll run from active employees, salary rules, allowances, deductions, and attendance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Run month</Label>
                  <Input type="month" value={runMonth} onChange={(event) => setRunMonth(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Default bonus per employee</Label>
                  <Input type="number" value={defaultBonus} onChange={(event) => setDefaultBonus(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Additional deduction per employee</Label>
                  <Input type="number" value={additionalDeduction} onChange={(event) => setAdditionalDeduction(event.target.value)} />
                </div>
                <Button onClick={generatePayroll} disabled={saving || activeEmployees.length === 0} className="w-full">Generate payroll</Button>
                <div className="space-y-2 pt-2">
                  <Label>Recent runs</Label>
                  <div className="space-y-2">
                    {payrollRuns.map((run) => (
                      <button
                        key={run.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm hover:bg-muted"
                        onClick={() => loadPayrollRun(run.id)}
                      >
                        <span>{run.runMonth}</span>
                        <span className="flex items-center gap-2">{money(run.totalNetPay)} {statusBadge(run.status)}</span>
                      </button>
                    ))}
                    {payrollRuns.length === 0 && <p className="text-sm text-muted-foreground">No payroll runs yet.</p>}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>{selectedRun ? `Payroll ${selectedRun.runMonth}` : 'Payroll details'}</CardTitle>
                  <CardDescription>{selectedRun ? `${selectedRun.employeeCount} employees, net payroll ${money(selectedRun.totalNetPay)}` : 'Select or generate a payroll run.'}</CardDescription>
                </div>
                {selectedRun && (
                  <div className="flex gap-2">
                    {statusBadge(selectedRun.status)}
                    <Button size="sm" variant="outline" onClick={approvePayroll} disabled={saving || selectedRun.status !== 'draft'}>Approve</Button>
                    <Button size="sm" onClick={markPayrollPaid} disabled={saving || selectedRun.status === 'paid'}>Mark paid</Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Allowances</TableHead>
                      <TableHead>Bonus</TableHead>
                      <TableHead>Deductions</TableHead>
                      <TableHead>Net pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.employeeName}</TableCell>
                        <TableCell>{item.department || 'General'}</TableCell>
                        <TableCell>{money(item.baseSalary)}</TableCell>
                        <TableCell>{money(item.allowances)}</TableCell>
                        <TableCell>{money(item.bonus)}</TableCell>
                        <TableCell>{money(item.deductions)}</TableCell>
                        <TableCell>{money(item.netPay)}</TableCell>
                      </TableRow>
                    ))}
                    {payrollItems.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No payroll items selected.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showEmployeeDialog} onOpenChange={setShowEmployeeDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingEmployeeId ? 'Edit employee' : 'Add employee'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEmployee} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>First name</Label><Input required value={employeeForm.firstName || ''} onChange={(event) => updateEmployeeForm('firstName', event.target.value)} /></div>
            <div className="space-y-2"><Label>Last name</Label><Input required value={employeeForm.lastName || ''} onChange={(event) => updateEmployeeForm('lastName', event.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={employeeForm.email || ''} onChange={(event) => updateEmployeeForm('email', event.target.value)} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={employeeForm.phone || ''} onChange={(event) => updateEmployeeForm('phone', event.target.value)} /></div>
            <div className="space-y-2"><Label>Employee code</Label><Input value={employeeForm.employeeCode || ''} onChange={(event) => updateEmployeeForm('employeeCode', event.target.value)} /></div>
            <div className="space-y-2"><Label>Department</Label><Input value={employeeForm.department || ''} onChange={(event) => updateEmployeeForm('department', event.target.value)} /></div>
            <div className="space-y-2"><Label>Job title</Label><Input value={employeeForm.jobTitle || ''} onChange={(event) => updateEmployeeForm('jobTitle', event.target.value)} /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={employeeForm.employmentStatus || 'active'} onValueChange={(value) => updateEmployeeForm('employmentStatus', value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contract type</Label>
              <Select value={employeeForm.contractType || 'full-time'} onValueChange={(value) => updateEmployeeForm('contractType', value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full-time">Full-time</SelectItem>
                  <SelectItem value="part-time">Part-time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="temporary">Temporary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Hire date</Label><Input type="date" value={employeeForm.hireDate || ''} onChange={(event) => updateEmployeeForm('hireDate', event.target.value)} /></div>
            <div className="space-y-2"><Label>Base salary</Label><Input type="number" value={employeeForm.baseSalary || 0} onChange={(event) => updateEmployeeForm('baseSalary', Number(event.target.value))} /></div>
            <div className="space-y-2"><Label>Housing allowance</Label><Input type="number" value={employeeForm.allowanceHousing || 0} onChange={(event) => updateEmployeeForm('allowanceHousing', Number(event.target.value))} /></div>
            <div className="space-y-2"><Label>Transport allowance</Label><Input type="number" value={employeeForm.allowanceTransport || 0} onChange={(event) => updateEmployeeForm('allowanceTransport', Number(event.target.value))} /></div>
            <div className="space-y-2"><Label>Medical allowance</Label><Input type="number" value={employeeForm.allowanceMedical || 0} onChange={(event) => updateEmployeeForm('allowanceMedical', Number(event.target.value))} /></div>
            <div className="space-y-2"><Label>Tax deduction</Label><Input type="number" value={employeeForm.deductionTax || 0} onChange={(event) => updateEmployeeForm('deductionTax', Number(event.target.value))} /></div>
            <div className="space-y-2"><Label>Insurance deduction</Label><Input type="number" value={employeeForm.deductionInsurance || 0} onChange={(event) => updateEmployeeForm('deductionInsurance', Number(event.target.value))} /></div>
            {canCreateUserForCurrentEmployee ? (
              <div className="md:col-span-2 rounded-lg border bg-slate-50 p-4 space-y-4">
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={createUserForEmployee}
                    onChange={(event) => setCreateUserForEmployee(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-semibold text-slate-900">Create User Account for this Employee</span>
                    <span className="block text-xs text-muted-foreground">Creates a linked login with this employee's name/email and the credentials below. One employee can only be linked to one user.</span>
                  </span>
                </label>
                {createUserForEmployee && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input required={createUserForEmployee} value={employeeUserAccountForm.username} onChange={(event) => updateEmployeeUserAccountForm('username', event.target.value)} placeholder="employee.username" />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input required={createUserForEmployee} type="password" value={employeeUserAccountForm.password} onChange={(event) => updateEmployeeUserAccountForm('password', event.target.value)} placeholder="Upper/lower/number/symbol" />
                    </div>
                    <div className="space-y-2">
                      <Label>Assigned role</Label>
                      <Select value={employeeUserAccountForm.role} onValueChange={(value) => updateEmployeeUserAccountForm('role', value)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EMPLOYEE_USER_ROLES.map((role) => <SelectItem key={role} value={role}>{EMPLOYEE_USER_ROLE_LABELS[role]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>User status</Label>
                      <Select value={employeeUserAccountForm.status} onValueChange={(value) => updateEmployeeUserAccountForm('status', value)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="md:col-span-2 text-xs text-muted-foreground">Employee email is required when creating a login. Passwords are stored only as salted hashes in the database.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="md:col-span-2 rounded-lg border bg-slate-50 p-4 text-sm text-slate-600">
                This employee is already linked to @{employeeForm.linkedUsername || 'a user account'}. Manage the existing login from Settings → User Maintenance.
              </div>
            )}
            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowEmployeeDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save employee</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
