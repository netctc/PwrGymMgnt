import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Fingerprint, ShieldCheck, Trash2, UserPlus, AlertTriangle, Eye, History } from 'lucide-react';
import { formatDateTime } from '../lib/formatDate';
import { biometricsApi, type BiometricProfile, type BiometricConsent, type DeletionJob } from '../lib/biometricsApi';

type SectionId = 'profiles' | 'enroll' | 'deletions';

const sections: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
  { id: 'profiles', label: 'Profiles & Consents', icon: <Fingerprint className="h-4 w-4" /> },
  { id: 'enroll', label: 'Enrollment', icon: <UserPlus className="h-4 w-4" /> },
  { id: 'deletions', label: 'Deletion Jobs', icon: <Trash2 className="h-4 w-4" /> },
];

export default function Biometrics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = (searchParams.get('tab') as SectionId) || 'profiles';
  const setSection = (s: SectionId) => setSearchParams(s === 'profiles' ? {} : { tab: s });

  // Search state
  const [personId, setPersonId] = useState('');
  const [profiles, setProfiles] = useState<BiometricProfile[]>([]);
  const [consents, setConsents] = useState<BiometricConsent[]>([]);
  const [deletionJobs, setDeletionJobs] = useState<DeletionJob[]>([]);
  const [loading, setLoading] = useState(false);

  // Enrollment form
  const [enrollForm, setEnrollForm] = useState({ personType: 'member', personId: '', templateReference: '', branch: '', qualityScore: '' });

  const searchPerson = async () => {
    if (!personId.trim()) { toast.error('Enter a person ID'); return; }
    setLoading(true);
    try {
      const [profileRes, consentRes] = await Promise.all([
        biometricsApi.listProfiles({ personId: personId.trim() }),
        biometricsApi.listConsents(personId.trim()),
      ]);
      setProfiles(profileRes.profiles);
      setConsents(consentRes.consents);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load biometric data');
    } finally {
      setLoading(false);
    }
  };

  const loadDeletionJobs = async () => {
    try {
      const res = await biometricsApi.listDeletionJobs();
      setDeletionJobs(res.jobs);
    } catch { /* ignore */ }
  };

  useEffect(() => { if (section === 'deletions') loadDeletionJobs(); }, [section]);

  const handleGrantConsent = async () => {
    if (!personId.trim()) { toast.error('Search for a person first'); return; }
    try {
      await biometricsApi.grantConsent({
        personType: 'member',
        personId: personId.trim(),
        legalBasis: 'Explicit consent',
        purpose: 'Facial recognition for gym access control',
      });
      toast.success('Consent granted');
      await searchPerson();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleWithdrawConsent = async () => {
    if (!personId.trim()) return;
    try {
      await biometricsApi.withdrawConsent({ personType: 'member', personId: personId.trim() });
      toast.success('Consent withdrawn — profiles revoked and deletion scheduled');
      await searchPerson();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRevoke = async (profileId: string) => {
    try {
      await biometricsApi.revokeProfile(profileId, 'Administrative revocation');
      toast.success('Profile revoked');
      await searchPerson();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (profileId: string) => {
    try {
      await biometricsApi.deleteProfile(profileId);
      toast.success('Deletion scheduled');
      await searchPerson();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleEnroll = async () => {
    if (!enrollForm.personId || !enrollForm.templateReference) {
      toast.error('Person ID and template reference are required');
      return;
    }
    try {
      await biometricsApi.enrollProfile({
        personType: enrollForm.personType,
        personId: enrollForm.personId,
        templateReference: enrollForm.templateReference,
        qualityScore: enrollForm.qualityScore ? Number(enrollForm.qualityScore) : undefined,
        branch: enrollForm.branch || undefined,
      });
      toast.success('Biometric profile enrolled successfully');
      setEnrollForm({ personType: 'member', personId: '', templateReference: '', branch: '', qualityScore: '' });
    } catch (err: any) { toast.error(err.message); }
  };

  const hasActiveConsent = consents.some((c) => c.granted && !c.withdrawnAt);
  const hasActiveProfile = profiles.some((p) => p.status === 'active');

  return (
    <div className="p-2 space-y-4">
      <div className="flex items-center gap-2 bg-white rounded-xl p-2 shadow-sm border border-slate-100">
        {sections.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${section === s.id ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Profiles & Consents */}
      {section === 'profiles' && (
        <div className="space-y-4">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Biometric Profiles</h2>
              <div className="flex items-end gap-3 mb-6">
                <div className="flex-1"><Label>Person ID (Member or Employee)</Label><Input value={personId} onChange={(e) => setPersonId(e.target.value)} placeholder="mem_... or emp_..." /></div>
                <Button onClick={searchPerson} disabled={loading}>{loading ? 'Loading...' : 'Search'}</Button>
              </div>

              {/* Consent Status */}
              {personId && (
                <div className="mb-6 p-4 rounded-xl border bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className={`h-5 w-5 ${hasActiveConsent ? 'text-green-600' : 'text-slate-400'}`} />
                      <div>
                        <p className="font-semibold text-slate-900">Biometric Consent</p>
                        <p className="text-xs text-slate-500">{hasActiveConsent ? 'Active consent for facial recognition' : 'No active consent'}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!hasActiveConsent && <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleGrantConsent}>Grant Consent</Button>}
                      {hasActiveConsent && <Button size="sm" variant="destructive" onClick={handleWithdrawConsent}>Withdraw Consent</Button>}
                    </div>
                  </div>
                  {consents.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {consents.slice(0, 5).map((c) => (
                        <p key={c.id} className="text-xs text-slate-500">
                          {c.granted ? '✓ Granted' : '✗ Withdrawn'} on {formatDateTime(c.grantedAt || c.withdrawnAt)} by {c.recordedBy}
                          {c.legalBasis && ` • Basis: ${c.legalBasis}`}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Profiles */}
              {profiles.length > 0 && (
                <div className="space-y-3">
                  {profiles.map((p) => (
                    <div key={p.id} className="border rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">Profile {p.id.slice(0, 12)}...</p>
                          <p className="text-xs text-slate-500">
                            Enrolled: {formatDateTime(p.enrolledAt)} by {p.enrolledBy}
                            {p.enrolledAtBranch && ` at ${p.enrolledAtBranch}`}
                            {p.qualityScore && ` • Quality: ${p.qualityScore}`}
                          </p>
                          {p.lastRecognitionAt && <p className="text-xs text-slate-500">Last recognition: {formatDateTime(p.lastRecognitionAt)}</p>}
                          {p.revokedAt && <p className="text-xs text-red-500">Revoked: {formatDateTime(p.revokedAt)} — {p.revocationReason}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={p.status === 'active' ? 'default' : p.status === 'revoked' ? 'destructive' : 'secondary'}>{p.status}</Badge>
                          {p.status === 'active' && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleRevoke(p.id)} title="Revoke"><AlertTriangle className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" className="text-red-700" onClick={() => handleDelete(p.id)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {personId && profiles.length === 0 && !loading && (
                <p className="text-slate-400 text-sm">No biometric profiles found for this person.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Enrollment */}
      {section === 'enroll' && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-purple-600" /> Enroll Biometric Profile
            </h2>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-amber-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Active consent is required before enrollment. The person must be informed and agree.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Person Type</Label>
                <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={enrollForm.personType} onChange={(e) => setEnrollForm({ ...enrollForm, personType: e.target.value })}>
                  <option value="member">Member</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
              <div><Label>Person ID</Label><Input value={enrollForm.personId} onChange={(e) => setEnrollForm({ ...enrollForm, personId: e.target.value })} placeholder="mem_... or emp_..." /></div>
              <div><Label>Template Reference (from biometric service)</Label><Input value={enrollForm.templateReference} onChange={(e) => setEnrollForm({ ...enrollForm, templateReference: e.target.value })} placeholder="External service reference ID" /></div>
              <div><Label>Branch / Location</Label><Input value={enrollForm.branch} onChange={(e) => setEnrollForm({ ...enrollForm, branch: e.target.value })} placeholder="Main Branch" /></div>
              <div><Label>Quality Score (0-100)</Label><Input type="number" min="0" max="100" value={enrollForm.qualityScore} onChange={(e) => setEnrollForm({ ...enrollForm, qualityScore: e.target.value })} /></div>
            </div>
            <Button onClick={handleEnroll} className="mt-6 w-full bg-purple-600 hover:bg-purple-700 text-white h-12">Enroll Profile</Button>
          </CardContent>
        </Card>
      )}

      {/* Deletion Jobs */}
      {section === 'deletions' && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Biometric Deletion Jobs</h2>
            <p className="text-sm text-slate-500 mb-4">Tracks scheduled and completed deletions of biometric data (GDPR/privacy compliance).</p>
            {deletionJobs.length === 0 ? (
              <p className="text-slate-400 text-sm">No deletion jobs.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Person</th>
                      <th className="text-left px-4 py-3 font-semibold">Reason</th>
                      <th className="text-center px-4 py-3 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Requested</th>
                      <th className="text-left px-4 py-3 font-semibold">Completed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {deletionJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">{job.personId} <span className="text-xs text-slate-400">({job.personType})</span></td>
                        <td className="px-4 py-3 text-slate-600">{job.reason}</td>
                        <td className="px-4 py-3 text-center"><Badge variant={job.status === 'completed' ? 'default' : job.status === 'pending' ? 'secondary' : 'destructive'}>{job.status}</Badge></td>
                        <td className="px-4 py-3 text-slate-500">{formatDateTime(job.requestedAt)}</td>
                        <td className="px-4 py-3 text-slate-500">{job.completedAt ? formatDateTime(job.completedAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
