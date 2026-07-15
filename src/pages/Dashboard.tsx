import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Users, CreditCard, Calendar, Activity, QrCode, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../lib/dashboardApi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrainerUtilizationChart } from '../components/TrainerUtilizationChart';
import { Badge } from '../components/ui/badge';
import SessionBalanceWidget from '../components/SessionBalanceWidget';
import { hasClientPermission } from '../lib/permissions';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444'];

function severityVariant(severity: string) {
  if (severity === 'critical') return 'destructive' as const;
  if (severity === 'warning') return 'secondary' as const;
  return 'outline' as const;
}

function moduleLabel(moduleName: string) {
  return moduleName.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [totalMembers, setTotalMembers] = useState(0);
  const [activeSubscriptions, setActiveSubscriptions] = useState(0);
  const [classesToday, setClassesToday] = useState(0);
  const [occupancyRate, setOccupancyRate] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [signupsData, setSignupsData] = useState<any[]>([]);
  const [actionCenter, setActionCenter] = useState<any | null>(null);
  
  // HR KPIs
  const [activeStaffCount, setActiveStaffCount] = useState(0);
  const [understaffedDepts, setUnderstaffedDepts] = useState(0);
  const [pendingContracts, setPendingContracts] = useState(0);
  const [salaryDistData, setSalaryDistData] = useState<any[]>([]);

  const canUseOperationalDashboard = hasClientPermission(profile?.role, 'dashboard.read');

  useEffect(() => {
    if (!profile || !canUseOperationalDashboard) return;

    const fetchDashboardSummary = async () => {
      try {
        const summary = await dashboardApi.getSummary();
        setTotalMembers(summary.kpis.totalMembers);
        setActiveSubscriptions(summary.kpis.activeSubscriptions);
        setClassesToday(summary.kpis.classesToday);
        setOccupancyRate(summary.kpis.occupancyRate);
        setChartData(summary.weeklyClasses);
        setPieData(summary.membershipDistribution);
        setSignupsData(summary.signups);
        setActiveStaffCount(summary.hr.activeStaffCount);
        setUnderstaffedDepts(summary.hr.understaffedDepts);
        setPendingContracts(summary.hr.pendingContracts);
        setSalaryDistData(summary.hr.salaryDistribution);
        const actions = await dashboardApi.getActionCenter();
        setActionCenter(actions);
      } catch (err) {
        console.error('Failed to fetch typed dashboard summary/action center', err);
      }
    };

    fetchDashboardSummary();
  }, [profile, canUseOperationalDashboard]);
  
  if (!profile) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Welcome back, {profile.firstName}</h1>
        <p className="text-slate-500 mt-2">Here's what's happening today.</p>
      </div>

      {/* Session Balance Widget — visible to members with limited plans */}
      <SessionBalanceWidget />

      {canUseOperationalDashboard ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-slate-200 shadow-sm border-t-4 border-t-indigo-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Link to="/members" className="text-sm font-medium text-slate-600 hover:text-indigo-600 hover:underline transition-colors block p-0">
                  Total Members
                </Link>
                <Users className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-800">{totalMembers}</div>
              </CardContent>
            </Card>
            
            <Card className="border-slate-200 shadow-sm border-t-4 border-t-emerald-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Link to="/members?filter=active" className="text-sm font-medium text-slate-600 hover:text-emerald-600 hover:underline transition-colors block p-0">
                  Active Subscriptions
                </Link>
                <CreditCard className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-800">{activeSubscriptions}</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm border-t-4 border-t-amber-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Classes Today</CardTitle>
                <Calendar className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-800">{classesToday}</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm border-t-4 border-t-rose-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Occupancy Rate</CardTitle>
                <Activity className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-800">{occupancyRate}%</div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg text-slate-700">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Smart Action Center
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1">Prioritized operational actions generated from membership, HR, warehouse, finance, support, and notification data.</p>
              </div>
              {actionCenter && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="destructive">{actionCenter.summary.critical} critical</Badge>
                  <Badge variant="secondary">{actionCenter.summary.warning} warning</Badge>
                  <Badge variant="outline">{actionCenter.summary.info} info</Badge>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {!actionCenter ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">Loading action center...</div>
              ) : actionCenter.items.length === 0 ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">No urgent operational actions.</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {actionCenter.items.slice(0, 6).map((item: any) => (
                    <div key={item.id} className="rounded-lg border bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={severityVariant(item.severity)}>{item.severity}</Badge>
                            <Badge variant="outline">{moduleLabel(item.module)}</Badge>
                          </div>
                          <p className="mt-2 font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                        </div>
                        {item.severity === 'info' ? <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-500" /> : <AlertTriangle className="mt-1 h-5 w-5 text-amber-500" />}
                      </div>
                      <Link to={item.actionUrl} className="mt-3 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline">
                        {item.actionLabel}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          
          <div className="grid grid-cols-1 gap-6 mb-6">
            <Card className="border-slate-200 shadow-sm">
               <CardHeader className="bg-slate-50 border-b border-slate-100 pb-3">
                  <CardTitle className="text-lg text-slate-700">HR KPI Metrics</CardTitle>
               </CardHeader>
               <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                     <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-500">Active Duty Staff</p>
                        <p className="text-3xl font-bold text-slate-800">{activeStaffCount}</p>
                        <p className="text-xs text-emerald-600">On shift right now</p>
                     </div>
                     <div className="space-y-1 border-l border-slate-100">
                        <p className="text-sm font-medium text-slate-500">Understaffed Departments</p>
                        <p className="text-3xl font-bold text-slate-800">{understaffedDepts}</p>
                        <p className="text-xs text-rose-600">Based on shift requirements</p>
                     </div>
                     <div className="space-y-1 border-l border-slate-100">
                        <p className="text-sm font-medium text-slate-500">Pending Contracts</p>
                        <p className="text-3xl font-bold text-slate-800">{pendingContracts}</p>
                        <p className="text-xs text-amber-600">Awaiting HR Approval</p>
                     </div>
                  </div>
               </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg text-slate-700">Upcoming Classes (7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="classes" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg text-slate-700">Active Subscriptions Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full flex items-center justify-center">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-slate-400 text-sm">No active subscriptions data available</p>
                  )}
                  {pieData.length > 0 && (
                    <div className="flex flex-col space-y-2 ml-4">
                      {pieData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center text-sm text-slate-600">
                          <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                          {entry.name}: {entry.value}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg text-slate-700">HR Payroll Analytics</CardTitle>
                <p className="text-sm text-slate-500">Department Salary Distribution</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center h-[200px]">
                  {salaryDistData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={salaryDistData}
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {salaryDistData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `$${value.toLocaleString()}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-slate-400 text-sm w-full text-center">No payroll distribution data available</p>
                  )}
                  {salaryDistData.length > 0 && (
                    <div className="flex flex-col space-y-2 ml-4">
                      {salaryDistData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center text-sm text-slate-600">
                          <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                          {entry.name}: ${entry.value.toLocaleString()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg text-slate-700">New Members (Last 12 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={signupsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="signups" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg text-slate-700">Trainer Utilization (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <TrainerUtilizationChart />
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="col-span-1 md:col-span-2 shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg text-slate-700">Upcoming Classes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-slate-500 py-8 text-center border-2 border-dashed border-slate-200 rounded-lg">
                You have no upcoming classes scheduled.
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="text-lg text-slate-700 flex items-center">
                <QrCode className="mr-2 h-5 w-5 text-indigo-500" />
                Access eCard
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center p-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                 {/* Provide basic JSON of member ID. Real app would sign it via Cloud Function */}
                <QRCodeSVG value={JSON.stringify({ userId: profile.id, timestamp: Date.now() })} size={150} />
              </div>
              <p className="text-xs text-slate-500 mt-4 text-center">
                Scan this at the reception to check in.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
