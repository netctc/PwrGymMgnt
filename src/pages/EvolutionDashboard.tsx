import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Activity, Users, CreditCard, Calendar, DoorOpen, Layers, TrendingUp, RefreshCw } from 'lucide-react';

type DashboardData = {
  enabled: boolean;
  subscriptions: { total: number; active: number; expired: number; cancelled: number; suspended: number };
  plans: { total: number; individual: number; family: number; group: number; corporate: number };
  affiliations: { total: number; active: number };
  sessions: { totalIncluded: number; totalConsumed: number; totalReserved: number; totalAvailable: number; totalExpired: number; totalRefunds: number; consumptionRate: number };
  cycles: { active: number; totalAllocated: number };
  access: { todayTotal: number; todayAuthorized: number; todayDenied: number; weekTotal: number; weekAuthorized: number };
  outbox: { pending: number; failed: number };
  recentMovements: Array<{ type: string; count: number }>;
  flags: Array<{ key: string; enabled: boolean }>;
};

function KpiCard({ icon, title, value, subtitle, color = 'indigo' }: { icon: ReactNode; title: string; value: string | number; subtitle?: string; color?: string }) {
  const colorMap: Record<string, string> = { indigo: 'bg-indigo-50 text-indigo-600', green: 'bg-green-50 text-green-600', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', purple: 'bg-purple-50 text-purple-600' };
  return (
    <div className="bg-white rounded-xl border p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.indigo}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{title}</p>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

export default function EvolutionDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [trends, setTrends] = useState<Array<{ day: string; total: number; authorized: number; denied: number }>>([]);
  const [topConsumers, setTopConsumers] = useState<Array<{ memberId: string; name: string; sessionsConsumed: number }>>([]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [summaryRes, trendsRes, consumersRes] = await Promise.all([
        fetch('/api/v2/dashboard/summary', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/v2/dashboard/access-trends', { credentials: 'include' }).then(r => r.json()).catch(() => ({ trends: [] })),
        fetch('/api/v2/dashboard/top-consumers', { credentials: 'include' }).then(r => r.json()).catch(() => ({ topConsumers: [] })),
      ]);
      setData(summaryRes);
      setTrends(trendsRes.trends || []);
      setTopConsumers(consumersRes.topConsumers || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadDashboard(); }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading evolution dashboard...</div>;
  if (!data || !data.enabled) return (
    <div className="p-8 text-center">
      <p className="text-slate-500 mb-4">Evolution system is not active. Enable ENABLE_NEW_SUBSCRIPTION_MODEL flag.</p>
      <Button onClick={() => window.location.href = '/subscriptions?tab=flags'}>Go to Feature Flags</Button>
    </div>
  );

  return (
    <div className="p-2 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Evolution Dashboard</h1>
        <Button variant="outline" size="sm" onClick={loadDashboard}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      {/* KPIs Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard icon={<CreditCard className="h-5 w-5" />} title="Active Subscriptions" value={data.subscriptions.active} subtitle={`${data.subscriptions.total} total`} />
        <KpiCard icon={<Users className="h-5 w-5" />} title="Active Affiliations" value={data.affiliations.active} subtitle={`${data.affiliations.total} total`} color="green" />
        <KpiCard icon={<Layers className="h-5 w-5" />} title="Plan Versions" value={data.plans.total} subtitle={`${data.plans.family + data.plans.group + data.plans.corporate} multi-user`} color="purple" />
        <KpiCard icon={<Calendar className="h-5 w-5" />} title="Active Cycles" value={data.cycles.active} subtitle={`${data.cycles.totalAllocated} sessions allocated`} />
        <KpiCard icon={<DoorOpen className="h-5 w-5" />} title="Access Today" value={data.access.todayAuthorized} subtitle={`${data.access.todayDenied} denied`} color="green" />
        <KpiCard icon={<TrendingUp className="h-5 w-5" />} title="Consumption Rate" value={`${data.sessions.consumptionRate}%`} subtitle="of included sessions" color={data.sessions.consumptionRate > 80 ? 'red' : 'amber'} />
      </div>

      {/* Session Balance Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h3 className="font-bold text-slate-900 mb-4">Session Balance (System-wide)</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-green-50 rounded-xl"><p className="text-xl font-bold text-green-700">{data.sessions.totalAvailable}</p><p className="text-xs text-green-600">Available</p></div>
              <div className="text-center p-3 bg-blue-50 rounded-xl"><p className="text-xl font-bold text-blue-700">{data.sessions.totalConsumed}</p><p className="text-xs text-blue-600">Consumed</p></div>
              <div className="text-center p-3 bg-amber-50 rounded-xl"><p className="text-xl font-bold text-amber-700">{data.sessions.totalReserved}</p><p className="text-xs text-amber-600">Reserved</p></div>
              <div className="text-center p-3 bg-slate-50 rounded-xl"><p className="text-xl font-bold text-slate-700">{data.sessions.totalIncluded}</p><p className="text-xs text-slate-500">Included</p></div>
              <div className="text-center p-3 bg-red-50 rounded-xl"><p className="text-xl font-bold text-red-700">{data.sessions.totalExpired}</p><p className="text-xs text-red-600">Expired</p></div>
              <div className="text-center p-3 bg-purple-50 rounded-xl"><p className="text-xl font-bold text-purple-700">{data.sessions.totalRefunds}</p><p className="text-xs text-purple-600">Refunds</p></div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h3 className="font-bold text-slate-900 mb-4">Access Trends (Last 7 Days)</h3>
            {trends.length === 0 ? <p className="text-sm text-slate-400">No access data yet.</p> : (
              <div className="space-y-2">
                {trends.map((t) => (
                  <div key={t.day} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-20">{t.day.slice(5)}</span>
                    <div className="flex-1 flex gap-1 h-5">
                      <div className="bg-green-400 rounded-sm" style={{ width: `${Math.max(2, (t.authorized / Math.max(t.total, 1)) * 100)}%` }} title={`${t.authorized} authorized`} />
                      <div className="bg-red-400 rounded-sm" style={{ width: `${Math.max(1, (t.denied / Math.max(t.total, 1)) * 100)}%` }} title={`${t.denied} denied`} />
                    </div>
                    <span className="text-xs font-medium text-slate-700 w-10 text-right">{t.total}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Recent Movements */}
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h3 className="font-bold text-slate-900 mb-3">Movements (24h)</h3>
            {data.recentMovements.length === 0 ? <p className="text-sm text-slate-400">No movements.</p> : (
              <div className="space-y-2">
                {data.recentMovements.map((m) => (
                  <div key={m.type} className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{m.type}</Badge>
                    <span className="text-sm font-semibold">{m.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Consumers */}
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h3 className="font-bold text-slate-900 mb-3">Top Consumers (30d)</h3>
            {topConsumers.length === 0 ? <p className="text-sm text-slate-400">No data.</p> : (
              <div className="space-y-2">
                {topConsumers.slice(0, 5).map((c, i) => (
                  <div key={c.memberId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                      <span className="text-sm">{c.name || c.memberId}</span>
                    </div>
                    <span className="text-sm font-semibold">{c.sessionsConsumed}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Health */}
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h3 className="font-bold text-slate-900 mb-3">System Health</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Outbox Pending</span>
                <Badge variant={data.outbox.pending > 10 ? 'destructive' : 'default'}>{data.outbox.pending}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Outbox Failed</span>
                <Badge variant={data.outbox.failed > 0 ? 'destructive' : 'default'}>{data.outbox.failed}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Week Access</span>
                <span className="text-sm font-medium">{data.access.weekTotal}</span>
              </div>
              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">Feature Flags</p>
                {data.flags.map((f) => (
                  <div key={f.key} className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-500 font-mono">{f.key.replace('ENABLE_', '')}</span>
                    <span className={`w-2 h-2 rounded-full ${f.enabled ? 'bg-green-500' : 'bg-slate-300'}`} />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
