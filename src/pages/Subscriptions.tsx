import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { CreditCard, Users, Layers, Activity, ToggleLeft, ToggleRight, Shield } from 'lucide-react';
import { formatDate } from '../lib/formatDate';
import DateInput from '../components/DateInput';
import { subscriptionsV2Api, type PlanVersion, type SubscriptionV2, type Affiliation, type SessionBalance, type FeatureFlag } from '../lib/subscriptionsV2Api';
import { useAuth } from '../contexts/AuthContext';
import { hasClientPermission } from '../lib/permissions';

type SectionId = 'plans' | 'subscriptions' | 'affiliations' | 'flags';

const sections: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
  { id: 'plans', label: 'Plan Versions', icon: <Layers className="h-4 w-4" /> },
  { id: 'subscriptions', label: 'Subscriptions', icon: <CreditCard className="h-4 w-4" /> },
  { id: 'affiliations', label: 'Affiliations', icon: <Users className="h-4 w-4" /> },
  { id: 'flags', label: 'Feature Flags', icon: <Shield className="h-4 w-4" /> },
];

export default function Subscriptions() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = (searchParams.get('tab') as SectionId) || 'plans';
  const setSection = (s: SectionId) => setSearchParams(s === 'plans' ? {} : { tab: s });

  const [loading, setLoading] = useState(false);
  const [planVersions, setPlanVersions] = useState<PlanVersion[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionV2[]>([]);
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [error, setError] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [pvRes, flagsRes] = await Promise.all([
        subscriptionsV2Api.listPlanVersions().catch(() => ({ planVersions: [] })),
        subscriptionsV2Api.listFeatureFlags().catch(() => ({ flags: [] })),
      ]);
      setPlanVersions(pvRes.planVersions);
      setFlags(flagsRes.flags);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadSubscriptions = async () => {
    try {
      const res = await subscriptionsV2Api.listSubscriptions({ memberId: memberSearch || undefined });
      setSubscriptions(res.subscriptions);
    } catch { setSubscriptions([]); }
  };

  const loadAffiliations = async () => {
    if (!memberSearch) { setAffiliations([]); return; }
    try {
      const res = await subscriptionsV2Api.listAffiliations(memberSearch);
      setAffiliations(res.affiliations);
    } catch { setAffiliations([]); }
  };

  useEffect(() => { void loadData(); }, []);
  useEffect(() => { if (section === 'subscriptions') loadSubscriptions(); }, [section, memberSearch]);
  useEffect(() => { if (section === 'affiliations') loadAffiliations(); }, [section, memberSearch]);

  const toggleFlag = async (key: string, current: boolean) => {
    try {
      await subscriptionsV2Api.toggleFeatureFlag(key, !current);
      toast.success(`Flag ${key} ${!current ? 'enabled' : 'disabled'}`);
      await loadData();
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="p-2 space-y-4">
      {/* Navigation tabs */}
      <div className="flex items-center gap-2 bg-white rounded-xl p-2 shadow-sm border border-slate-100">
        {sections.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${section === s.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>}

      {/* Plan Versions */}
      {section === 'plans' && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Plan Versions</h2>
            <p className="text-sm text-slate-500 mb-6">Immutable snapshots of plan conditions. Each subscription references a specific version.</p>
            {loading ? <p className="text-slate-500">Loading...</p> : planVersions.length === 0 ? (
              <p className="text-slate-400 text-sm">No plan versions found. Enable the ENABLE_NEW_SUBSCRIPTION_MODEL flag and create a plan version.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Plan</th>
                      <th className="text-left px-4 py-3 font-semibold">Type</th>
                      <th className="text-center px-4 py-3 font-semibold">Version</th>
                      <th className="text-right px-4 py-3 font-semibold">Price</th>
                      <th className="text-center px-4 py-3 font-semibold">Members</th>
                      <th className="text-center px-4 py-3 font-semibold">Sessions</th>
                      <th className="text-center px-4 py-3 font-semibold">Distribution</th>
                      <th className="text-center px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {planVersions.map((pv) => (
                      <tr key={pv.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{pv.name}</td>
                        <td className="px-4 py-3"><Badge variant="outline">{pv.planType}</Badge></td>
                        <td className="px-4 py-3 text-center">v{pv.versionNumber}</td>
                        <td className="px-4 py-3 text-right">{pv.price} {pv.currency}</td>
                        <td className="px-4 py-3 text-center">{pv.maxMembers}</td>
                        <td className="px-4 py-3 text-center">{pv.sessionsUnlimited ? '∞' : pv.sessionsPerCycle}</td>
                        <td className="px-4 py-3 text-center">{pv.distributionModel}</td>
                        <td className="px-4 py-3 text-center"><Badge variant={pv.status === 'active' ? 'default' : 'secondary'}>{pv.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscriptions */}
      {section === 'subscriptions' && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Subscriptions V2</h2>
            <div className="flex items-end gap-3 mb-6">
              <div className="flex-1"><Label>Member ID</Label><Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Filter by member ID" /></div>
              <Button onClick={loadSubscriptions}>Search</Button>
            </div>
            {subscriptions.length === 0 ? (
              <p className="text-slate-400 text-sm">No subscriptions found.</p>
            ) : (
              <div className="space-y-3">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{sub.planName}</p>
                        <p className="text-xs text-slate-500">{sub.planType} • {formatDate(sub.startDate)} – {formatDate(sub.endDate)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>{sub.status}</Badge>
                        <span className="text-sm text-slate-600">{sub.pricePaid} {sub.currency}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500 flex gap-4">
                      <span>Max members: {sub.maxMembers}</span>
                      <span>Sessions: {sub.sessionsUnlimited ? '∞' : `${sub.sessionsPerCycle}/cycle`}</span>
                      <span>Distribution: {sub.distributionModel}</span>
                      {sub.legacySubscriptionId && <span className="text-amber-600">Migrated from legacy</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Affiliations */}
      {section === 'affiliations' && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Member Affiliations</h2>
            <div className="flex items-end gap-3 mb-6">
              <div className="flex-1"><Label>Member ID</Label><Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Enter member ID to view affiliations" /></div>
              <Button onClick={loadAffiliations}>Search</Button>
            </div>
            {!memberSearch ? (
              <p className="text-slate-400 text-sm">Enter a member ID to view their affiliations.</p>
            ) : affiliations.length === 0 ? (
              <p className="text-slate-400 text-sm">No affiliations found for this member.</p>
            ) : (
              <div className="space-y-3">
                {affiliations.map((aff) => (
                  <div key={aff.id} className="border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{aff.planName} {aff.isPrimary && <Badge variant="default" className="ml-2">Primary</Badge>}</p>
                        <p className="text-xs text-slate-500">{aff.planType} • Role: {aff.role} • {formatDate(aff.startDate)} – {formatDate(aff.endDate)}</p>
                      </div>
                      <Badge variant={aff.status === 'active' ? 'default' : aff.status === 'expired' ? 'destructive' : 'secondary'}>{aff.status}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-slate-500 flex gap-4">
                      <span>Sessions: {aff.sessionsUnlimited ? '∞ unlimited' : 'Limited (see balance)'}</span>
                      <span>Subscription: {aff.subscriptionStatus}</span>
                      <span>Priority: {aff.consumptionPriority}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Feature Flags */}
      {section === 'flags' && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Feature Flags</h2>
            <p className="text-sm text-slate-500 mb-6">Control activation of new features. Changes take effect within 30 seconds.</p>
            <div className="space-y-3">
              {flags.map((flag) => (
                <div key={flag.id} className="flex items-center justify-between border rounded-xl p-4">
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-900">{flag.key}</p>
                    <p className="text-xs text-slate-500">{flag.description}</p>
                  </div>
                  <button onClick={() => toggleFlag(flag.key, flag.enabled)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${flag.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {flag.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    {flag.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}
              {flags.length === 0 && <p className="text-slate-400 text-sm">No feature flags found. Run migrations first.</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
