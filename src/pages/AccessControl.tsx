import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { DoorOpen, History, MapPin, Shield, UserCheck, Scan, Plus } from 'lucide-react';
import { formatDateTime } from '../lib/formatDate';
import { subscriptionsV2Api, type AccessAttempt } from '../lib/subscriptionsV2Api';
import { useAuth } from '../contexts/AuthContext';

type SectionId = 'validate' | 'history' | 'points';

const sections: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
  { id: 'validate', label: 'Validate Access', icon: <UserCheck className="h-4 w-4" /> },
  { id: 'history', label: 'Access History', icon: <History className="h-4 w-4" /> },
  { id: 'points', label: 'Access Points', icon: <MapPin className="h-4 w-4" /> },
];

export default function AccessControl() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = (searchParams.get('tab') as SectionId) || 'validate';
  const setSection = (s: SectionId) => setSearchParams(s === 'validate' ? {} : { tab: s });

  // Validate state
  const [memberId, setMemberId] = useState('');
  const [method, setMethod] = useState<'manual' | 'qr'>('manual');
  const [accessPointId, setAccessPointId] = useState('');
  const [validating, setValidating] = useState(false);
  const [lastDecision, setLastDecision] = useState<any>(null);

  // History state
  const [attempts, setAttempts] = useState<AccessAttempt[]>([]);
  const [historyMember, setHistoryMember] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Access points state
  const [accessPoints, setAccessPoints] = useState<any[]>([]);
  const [newPoint, setNewPoint] = useState({ name: '', branch: '', zone: '', direction: 'entry' });

  const loadAccessPoints = async () => {
    try {
      const res = await subscriptionsV2Api.listAccessPoints();
      setAccessPoints(res.accessPoints);
    } catch { /* ignore if not available */ }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await subscriptionsV2Api.listAccessAttempts({ memberId: historyMember || undefined, limit: '100' });
      setAttempts(res.attempts);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => { void loadAccessPoints(); }, []);
  useEffect(() => { if (section === 'history') loadHistory(); }, [section]);

  const handleValidate = async (options: {
    affiliationId?: string;
    confirmSessionConsumption?: boolean;
  } = {}) => {
    if (!memberId.trim()) { toast.error('Enter a member ID'); return; }
    setValidating(true);
    if (!options.affiliationId && !options.confirmSessionConsumption) {
      setLastDecision(null);
    }
    try {
      const decision = await subscriptionsV2Api.authorizeAccess({
        method,
        ...(method === 'qr'
          ? { tokenHash: memberId.trim() }
          : { memberId: memberId.trim() }),
        accessPointId: accessPointId || undefined,
        affiliationId: options.affiliationId,
        confirmSessionConsumption: options.confirmSessionConsumption,
      });
      setLastDecision(decision);
      if (decision.authorized) {
        toast.success(`Access granted: ${decision.personName || decision.personId}`);
      } else if (decision.requiresAffiliationSelection) {
        toast.info('Select the plan to use for this access');
      } else if (decision.requiresConsumptionConfirmation) {
        toast.info('Confirm the session deduction before authorizing access');
      } else {
        toast.error(`Access denied: ${decision.reason}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleCreatePoint = async () => {
    if (!newPoint.name || !newPoint.branch) { toast.error('Name and branch required'); return; }
    try {
      await subscriptionsV2Api.createAccessPoint({
        name: newPoint.name,
        branch: newPoint.branch,
        zone: newPoint.zone || undefined,
        direction: newPoint.direction,
        accessMethods: ['qr', 'manual', 'facial'],
      });
      toast.success('Access point created');
      setNewPoint({ name: '', branch: '', zone: '', direction: 'entry' });
      await loadAccessPoints();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create access point');
    }
  };

  return (
    <div className="p-2 space-y-4">
      {/* Navigation */}
      <div className="flex items-center gap-2 bg-white rounded-xl p-2 shadow-sm border border-slate-100">
        {sections.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${section === s.id ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Validate Access */}
      {section === 'validate' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Scan className="h-5 w-5 text-green-600" /> Validate Member Access
              </h2>
              <div className="space-y-4">
                <div>
                  <Label>Method</Label>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setMethod('manual')} className={`px-4 py-2 rounded-lg text-sm font-medium ${method === 'manual' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Manual</button>
                    <button onClick={() => setMethod('qr')} className={`px-4 py-2 rounded-lg text-sm font-medium ${method === 'qr' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600'}`}>QR Token</button>
                  </div>
                </div>
                <div>
                  <Label>{method === 'qr' ? 'Token Hash' : 'Member ID'}</Label>
                  <Input value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder={method === 'qr' ? 'Scanned token hash' : 'Member ID'} />
                </div>
                <div>
                  <Label>Access Point</Label>
                  <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={accessPointId} onChange={(e) => setAccessPointId(e.target.value)}>
                    <option value="">No specific point</option>
                    {accessPoints.map((ap) => <option key={ap.id} value={ap.id}>{ap.name} ({ap.branch})</option>)}
                  </select>
                </div>
                <Button onClick={() => handleValidate()} disabled={validating} className="w-full h-12 bg-green-600 hover:bg-green-700 text-white text-lg">
                  {validating ? 'Validating...' : 'Validate Access'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Decision Result */}
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-slate-600" /> Decision
              </h2>
              {!lastDecision ? (
                <div className="flex items-center justify-center h-48 text-slate-400">
                  <p>Submit a validation to see the result</p>
                </div>
              ) : (
                <div className={`rounded-xl p-6 ${lastDecision.authorized ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${lastDecision.authorized ? 'bg-green-200' : 'bg-red-200'}`}>
                      {lastDecision.authorized ? <DoorOpen className="h-6 w-6 text-green-700" /> : <Shield className="h-6 w-6 text-red-700" />}
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${lastDecision.authorized ? 'text-green-800' : 'text-red-800'}`}>
                        {lastDecision.authorized ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
                      </p>
                      <p className="text-sm text-slate-600">{lastDecision.reason}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    {lastDecision.personName && <p><span className="font-medium">Person:</span> {lastDecision.personName}</p>}
                    {lastDecision.personType && <p><span className="font-medium">Type:</span> {lastDecision.personType}</p>}
                    {lastDecision.planName && <p><span className="font-medium">Plan:</span> {lastDecision.planName}</p>}
                    {lastDecision.sessionsRemaining !== null && lastDecision.sessionsRemaining !== undefined && (
                      <p><span className="font-medium">Sessions remaining:</span> {lastDecision.sessionsRemaining}</p>
                    )}
                    {lastDecision.affiliationId && <p><span className="font-medium">Affiliation:</span> {lastDecision.affiliationId}</p>}
                    {lastDecision.requiresAffiliationSelection && (
                      <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                        <p className="font-medium text-amber-900">Select the plan for this access</p>
                        {(lastDecision.affiliationOptions || []).map((option: any) => (
                          <Button
                            key={option.affiliationId}
                            type="button"
                            variant="outline"
                            className="w-full justify-between bg-white"
                            disabled={validating}
                            onClick={() => handleValidate({ affiliationId: option.affiliationId })}
                          >
                            <span>{option.planName}</span>
                            <span className="text-xs text-slate-500">
                              {option.sessionsAvailable === null
                                ? 'Unlimited'
                                : `${option.sessionsAvailable} sessions`}
                            </span>
                          </Button>
                        ))}
                      </div>
                    )}
                    {lastDecision.requiresConsumptionConfirmation && (
                      <Button
                        type="button"
                        className="w-full bg-green-600 hover:bg-green-700"
                        disabled={validating}
                        onClick={() =>
                          handleValidate({
                            affiliationId: lastDecision.affiliationId,
                            confirmSessionConsumption: true,
                          })
                        }
                      >
                        Confirm session deduction and authorize
                      </Button>
                    )}
                    <p className="text-xs text-slate-400 mt-2">Attempt: {lastDecision.attemptId} • Request: {lastDecision.requestId}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* History */}
      {section === 'history' && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Access History</h2>
            <div className="flex items-end gap-3 mb-6">
              <div className="flex-1"><Label>Filter by Member ID</Label><Input value={historyMember} onChange={(e) => setHistoryMember(e.target.value)} placeholder="Leave empty for all" /></div>
              <Button onClick={loadHistory} disabled={loadingHistory}>{loadingHistory ? 'Loading...' : 'Search'}</Button>
            </div>
            {attempts.length === 0 ? (
              <p className="text-slate-400 text-sm">No access attempts found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Date</th>
                      <th className="text-left px-4 py-3 font-semibold">Person</th>
                      <th className="text-center px-4 py-3 font-semibold">Method</th>
                      <th className="text-center px-4 py-3 font-semibold">Decision</th>
                      <th className="text-left px-4 py-3 font-semibold">Reason</th>
                      <th className="text-left px-4 py-3 font-semibold">Point</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {attempts.map((att) => (
                      <tr key={att.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600">{formatDateTime(att.createdAt)}</td>
                        <td className="px-4 py-3">{att.personId || '—'} <span className="text-xs text-slate-400">({att.personType})</span></td>
                        <td className="px-4 py-3 text-center"><Badge variant="outline">{att.method}</Badge></td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={att.decision === 'authorized' ? 'default' : 'destructive'}>{att.decision}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{att.denialReason || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{att.accessPointId || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Access Points */}
      {section === 'points' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Access Points</h2>
              {accessPoints.length === 0 ? (
                <p className="text-slate-400 text-sm">No access points configured.</p>
              ) : (
                <div className="space-y-3">
                  {accessPoints.map((ap) => (
                    <div key={ap.id} className="border rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{ap.name}</p>
                          <p className="text-xs text-slate-500">{ap.branch} {ap.zone ? `• ${ap.zone}` : ''} • {ap.direction}</p>
                        </div>
                        <div className="flex gap-1">
                          {(ap.accessMethods || []).map((m: string) => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Plus className="h-5 w-5" /> New Access Point
              </h2>
              <div className="space-y-4">
                <div><Label>Name</Label><Input value={newPoint.name} onChange={(e) => setNewPoint({ ...newPoint, name: e.target.value })} placeholder="Main Entrance" /></div>
                <div><Label>Branch / Location</Label><Input value={newPoint.branch} onChange={(e) => setNewPoint({ ...newPoint, branch: e.target.value })} placeholder="Main Branch" /></div>
                <div><Label>Zone (optional)</Label><Input value={newPoint.zone} onChange={(e) => setNewPoint({ ...newPoint, zone: e.target.value })} placeholder="Gym Floor, Pool, etc." /></div>
                <div>
                  <Label>Direction</Label>
                  <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={newPoint.direction} onChange={(e) => setNewPoint({ ...newPoint, direction: e.target.value })}>
                    <option value="entry">Entry</option>
                    <option value="exit">Exit</option>
                    <option value="bidirectional">Bidirectional</option>
                  </select>
                </div>
                <Button onClick={handleCreatePoint} className="w-full bg-green-600 hover:bg-green-700 text-white">Create Access Point</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
