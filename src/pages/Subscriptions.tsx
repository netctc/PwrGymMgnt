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

  // Plan creation form
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState({ planId: '', name: '', planType: 'individual', price: '0', currency: 'USD', durationDays: '30', maxMembers: '1', sessionsUnlimited: true, sessionsPerCycle: '20', cycleFrequency: 'monthly', distributionModel: 'individual', carryoverEnabled: false });

  // Subscription creation form
  const [showSubForm, setShowSubForm] = useState(false);
  const [subForm, setSubForm] = useState({ planVersionId: '', holderMemberId: '', startDate: '' });

  // Subscription detail / members management
  const [selectedSub, setSelectedSub] = useState<SubscriptionV2 | null>(null);
  const [subMembers, setSubMembers] = useState<Array<{ id: string; memberId: string; role: string; status: string; firstName: string; lastName: string; email: string }>>([]);
  const [newMemberId, setNewMemberId] = useState('');

  // Session balances
  const [balances, setBalances] = useState<SessionBalance[]>([]);

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

  const handleCreatePlan = async () => {
    try {
      if (!planForm.planId || !planForm.name) { toast.error('Plan ID and name required'); return; }
      await subscriptionsV2Api.createPlanVersion({
        planId: planForm.planId,
        name: planForm.name,
        planType: planForm.planType as any,
        price: Number(planForm.price),
        currency: planForm.currency,
        durationDays: Number(planForm.durationDays),
        maxMembers: Number(planForm.maxMembers),
        sessionsUnlimited: planForm.sessionsUnlimited,
        sessionsPerCycle: planForm.sessionsUnlimited ? undefined : Number(planForm.sessionsPerCycle),
        cycleFrequency: planForm.cycleFrequency,
        distributionModel: planForm.distributionModel as any,
        carryoverEnabled: planForm.carryoverEnabled,
      });
      toast.success('Plan version created');
      setShowPlanForm(false);
      await loadData();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleCreateSubscription = async () => {
    try {
      if (!subForm.planVersionId || !subForm.holderMemberId) { toast.error('Select plan and member'); return; }
      await subscriptionsV2Api.createSubscription({
        planVersionId: subForm.planVersionId,
        holderMemberId: subForm.holderMemberId,
        startDate: subForm.startDate || undefined,
      });
      toast.success('Subscription created');
      setShowSubForm(false);
      await loadSubscriptions();
    } catch (err: any) { toast.error(err.message); }
  };

  const openSubDetail = async (sub: SubscriptionV2) => {
    setSelectedSub(sub);
    try {
      const res = await subscriptionsV2Api.listSubscriptionMembers(sub.id);
      setSubMembers(res.members);
    } catch { setSubMembers([]); }
    try {
      const res = await subscriptionsV2Api.listSessionBalances({ subscriptionId: sub.id });
      setBalances(res.balances);
    } catch { setBalances([]); }
  };

  const handleAddMember = async () => {
    if (!selectedSub || !newMemberId.trim()) return;
    try {
      await subscriptionsV2Api.addSubscriptionMember(selectedSub.id, { memberId: newMemberId.trim() });
      toast.success('Member added');
      setNewMemberId('');
      await openSubDetail(selectedSub);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedSub) return;
    try {
      await subscriptionsV2Api.removeSubscriptionMember(selectedSub.id, memberId);
      toast.success('Member removed');
      await openSubDetail(selectedSub);
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Plan Versions</h2>
              <Button size="sm" onClick={() => setShowPlanForm(!showPlanForm)}>{showPlanForm ? 'Cancel' : '+ Create Plan Version'}</Button>
            </div>

            {showPlanForm && (
              <div className="mb-6 p-4 border rounded-xl bg-slate-50 space-y-4">
                <p className="font-semibold text-sm text-slate-700">New Plan Version</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div><Label>Plan ID (from existing plans)</Label><Input value={planForm.planId} onChange={(e) => setPlanForm({ ...planForm, planId: e.target.value })} placeholder="plan_..." /></div>
                  <div><Label>Name</Label><Input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Premium Monthly" /></div>
                  <div><Label>Type</Label><select className="h-10 w-full rounded-md border px-3 text-sm" value={planForm.planType} onChange={(e) => setPlanForm({ ...planForm, planType: e.target.value })}><option value="individual">Individual</option><option value="family">Family</option><option value="group">Group</option><option value="corporate">Corporate</option></select></div>
                  <div><Label>Price</Label><Input type="number" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} /></div>
                  <div><Label>Duration (days)</Label><Input type="number" value={planForm.durationDays} onChange={(e) => setPlanForm({ ...planForm, durationDays: e.target.value })} /></div>
                  <div><Label>Max Members</Label><Input type="number" value={planForm.maxMembers} onChange={(e) => setPlanForm({ ...planForm, maxMembers: e.target.value })} /></div>
                  <div><Label>Sessions</Label><select className="h-10 w-full rounded-md border px-3 text-sm" value={planForm.sessionsUnlimited ? 'unlimited' : 'limited'} onChange={(e) => setPlanForm({ ...planForm, sessionsUnlimited: e.target.value === 'unlimited' })}><option value="unlimited">Unlimited</option><option value="limited">Limited</option></select></div>
                  {!planForm.sessionsUnlimited && <div><Label>Sessions/Cycle</Label><Input type="number" value={planForm.sessionsPerCycle} onChange={(e) => setPlanForm({ ...planForm, sessionsPerCycle: e.target.value })} /></div>}
                  <div><Label>Cycle Frequency</Label><select className="h-10 w-full rounded-md border px-3 text-sm" value={planForm.cycleFrequency} onChange={(e) => setPlanForm({ ...planForm, cycleFrequency: e.target.value })}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="quarterly">Quarterly</option></select></div>
                  <div><Label>Distribution</Label><select className="h-10 w-full rounded-md border px-3 text-sm" value={planForm.distributionModel} onChange={(e) => setPlanForm({ ...planForm, distributionModel: e.target.value })}><option value="individual">Individual</option><option value="shared">Shared Pool</option><option value="custom">Custom</option></select></div>
                </div>
                <Button onClick={handleCreatePlan} className="bg-indigo-600 hover:bg-indigo-700 text-white">Create Plan Version</Button>
              </div>
            )}

            <p className="text-sm text-slate-500 mb-4">Immutable snapshots of plan conditions. Each subscription references a specific version.</p>
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Subscriptions V2</h2>
              <Button size="sm" onClick={() => setShowSubForm(!showSubForm)}>{showSubForm ? 'Cancel' : '+ New Subscription'}</Button>
            </div>

            {showSubForm && (
              <div className="mb-6 p-4 border rounded-xl bg-slate-50 space-y-3">
                <p className="font-semibold text-sm text-slate-700">Create New Subscription</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div><Label>Plan Version</Label><select className="h-10 w-full rounded-md border px-3 text-sm" value={subForm.planVersionId} onChange={(e) => setSubForm({ ...subForm, planVersionId: e.target.value })}><option value="">Select plan version</option>{planVersions.map((pv) => <option key={pv.id} value={pv.id}>{pv.name} (v{pv.versionNumber}) — {pv.planType}</option>)}</select></div>
                  <div><Label>Holder Member ID</Label><Input value={subForm.holderMemberId} onChange={(e) => setSubForm({ ...subForm, holderMemberId: e.target.value })} placeholder="mem_..." /></div>
                  <div><Label>Start Date</Label><DateInput value={subForm.startDate} onChange={(v) => setSubForm({ ...subForm, startDate: v })} /></div>
                </div>
                <Button onClick={handleCreateSubscription} className="bg-indigo-600 hover:bg-indigo-700 text-white">Create Subscription</Button>
              </div>
            )}

            <div className="flex items-end gap-3 mb-6">
              <div className="flex-1"><Label>Member ID</Label><Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Filter by member ID" /></div>
              <Button onClick={loadSubscriptions}>Search</Button>
            </div>
            {subscriptions.length === 0 ? (
              <p className="text-slate-400 text-sm">No subscriptions found.</p>
            ) : (
              <div className="space-y-3">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="border rounded-xl p-4 cursor-pointer hover:border-indigo-300 transition-colors" onClick={() => openSubDetail(sub)}>
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscription Detail Modal */}
      {selectedSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedSub(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-1">{selectedSub.planName}</h3>
            <p className="text-sm text-slate-500 mb-4">{selectedSub.planType} • {formatDate(selectedSub.startDate)} – {formatDate(selectedSub.endDate)} • {selectedSub.status}</p>

            {/* Members */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-800">Members ({subMembers.length}/{selectedSub.maxMembers})</h4>
              </div>
              <div className="space-y-2 mb-3">
                {subMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{m.firstName} {m.lastName} <span className="text-xs text-slate-400">({m.email})</span></p>
                      <p className="text-xs text-slate-500">Role: {m.role} • Status: {m.status}</p>
                    </div>
                    {m.role !== 'holder' && m.status === 'active' && (
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleRemoveMember(m.memberId)}>Remove</Button>
                    )}
                  </div>
                ))}
              </div>
              {selectedSub.maxMembers > 1 && subMembers.length < selectedSub.maxMembers && (
                <div className="flex gap-2">
                  <Input value={newMemberId} onChange={(e) => setNewMemberId(e.target.value)} placeholder="Member ID to add" className="flex-1" />
                  <Button size="sm" onClick={handleAddMember}>Add Member</Button>
                </div>
              )}
            </div>

            {/* Session Balances */}
            {!selectedSub.sessionsUnlimited && balances.length > 0 && (
              <div className="mb-4">
                <h4 className="font-semibold text-slate-800 mb-3">Session Balances</h4>
                {balances.map((bal) => (
                  <div key={bal.id} className="p-3 border rounded-lg mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{bal.contextType}: {bal.contextId.slice(0, 12)}...</span>
                      <span className="text-lg font-bold text-indigo-600">{bal.available} available</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs text-slate-500">
                      <span>Included: {bal.included}</span>
                      <span>Consumed: {bal.consumed}</span>
                      <span>Reserved: {bal.reserved}</span>
                      <span>Refunds: {bal.refunds}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Lifecycle Actions */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-semibold text-slate-800 mb-3">Actions</h4>
              <div className="flex flex-wrap gap-2">
                {selectedSub.status === 'active' && (
                  <>
                    <Button size="sm" variant="outline" onClick={async () => { try { await subscriptionsV2Api.freezeSubscription(selectedSub.id, 'Manual freeze'); toast.success('Subscription frozen'); await loadSubscriptions(); setSelectedSub(null); } catch (e: any) { toast.error(e.message); } }}>Freeze</Button>
                    <Button size="sm" variant="outline" onClick={async () => { try { await subscriptionsV2Api.suspendSubscription(selectedSub.id, 'Manual suspend'); toast.success('Subscription suspended'); await loadSubscriptions(); setSelectedSub(null); } catch (e: any) { toast.error(e.message); } }}>Suspend</Button>
                    <Button size="sm" variant="destructive" onClick={async () => { try { await subscriptionsV2Api.cancelSubscription(selectedSub.id, 'Manual cancel'); toast.success('Subscription cancelled'); await loadSubscriptions(); setSelectedSub(null); } catch (e: any) { toast.error(e.message); } }}>Cancel</Button>
                  </>
                )}
                {(selectedSub.status === 'frozen' || selectedSub.status === 'suspended') && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={async () => { try { await subscriptionsV2Api.reactivateSubscription(selectedSub.id); toast.success('Subscription reactivated'); await loadSubscriptions(); setSelectedSub(null); } catch (e: any) { toast.error(e.message); } }}>Reactivate</Button>
                )}
                {selectedSub.status === 'expired' && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={async () => { try { await subscriptionsV2Api.renewSubscription(selectedSub.id); toast.success('Subscription renewed'); await loadSubscriptions(); setSelectedSub(null); } catch (e: any) { toast.error(e.message); } }}>Renew</Button>
                )}
              </div>
            </div>

            <Button variant="outline" className="w-full mt-2" onClick={() => setSelectedSub(null)}>Close</Button>
          </div>
        </div>
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
