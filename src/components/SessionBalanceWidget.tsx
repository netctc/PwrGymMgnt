/**
 * Session Balance Widget — Shows the current user's session balance.
 * Fetches from /api/member-portal/my-affiliations and displays a compact card.
 * Only renders if the user has active limited-plan affiliations.
 */

import { useEffect, useState } from 'react';
import { Activity, TrendingDown } from 'lucide-react';

type AffiliationBalance = {
  id: string;
  planName: string;
  planType: string;
  sessionsUnlimited: boolean;
  sessionsPerCycle: number | null;
  balance: { available: number; included: number; consumed: number; reserved: number } | null;
  endDate: string;
};

export default function SessionBalanceWidget() {
  const [affiliations, setAffiliations] = useState<AffiliationBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/member-portal/my-affiliations', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { affiliations: [] })
      .then(data => {
        // Only show limited plans that have a balance
        const limited = (data.affiliations || []).filter(
          (a: AffiliationBalance) => !a.sessionsUnlimited && a.balance
        );
        setAffiliations(limited);
      })
      .catch(() => setAffiliations([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || affiliations.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-5 w-5 text-indigo-600" />
        <h3 className="font-bold text-slate-900">My Sessions</h3>
      </div>
      <div className="space-y-3">
        {affiliations.map((aff) => {
          const bal = aff.balance!;
          const pct = aff.sessionsPerCycle ? Math.round((bal.consumed / aff.sessionsPerCycle) * 100) : 0;
          const isLow = bal.available <= 3;
          return (
            <div key={aff.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">{aff.planName}</span>
                <span className={`text-lg font-bold ${isLow ? 'text-red-600' : 'text-green-600'}`}>
                  {bal.available}
                  <span className="text-xs font-normal text-slate-400"> left</span>
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isLow ? 'bg-red-400' : pct > 60 ? 'bg-amber-400' : 'bg-green-400'}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-slate-400">
                <span>{bal.consumed} used</span>
                <span>{bal.reserved} reserved</span>
                <span>{aff.sessionsPerCycle} total</span>
              </div>
              {isLow && (
                <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                  <TrendingDown className="h-3 w-3" /> Sessions running low
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
