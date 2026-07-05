import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import EmptyState from '../components/EmptyState';
import InlineAlert from '../components/InlineAlert';
import ScreenReportActions from '../components/ScreenReportActions';
import { membershipApi, type MembershipPlan } from '../lib/membershipApi';
import { CheckCircle2, Pencil, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type PlanForm = {
  id?: string;
  name: string;
  description: string;
  durationDays: string;
  price: string;
  currency: string;
  status: string;
};

const emptyForm: PlanForm = {
  name: '',
  description: '',
  durationDays: '30',
  price: '0',
  currency: 'USD',
  status: 'active',
};

function statusVariant(status: string) {
  return status === 'active' ? 'default' : status === 'archived' ? 'outline' : 'secondary';
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function toForm(plan?: MembershipPlan): PlanForm {
  if (!plan) return emptyForm;
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description || '',
    durationDays: String(plan.durationDays || 30),
    price: String(plan.price || 0),
    currency: plan.currency || 'USD',
    status: plan.status || 'active',
  };
}

export default function Plans() {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  const activePlans = useMemo(() => plans.filter((plan) => plan.status === 'active'), [plans]);
  const totalMonthlyValue = useMemo(
    () => activePlans.reduce((sum, plan) => sum + Number(plan.price || 0), 0),
    [activePlans],
  );

  const loadPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await membershipApi.listPlans();
      setPlans(response.plans);
    } catch (err: any) {
      setError(err.message || 'Failed to load membership plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const openCreate = () => {
    setFormError(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (plan: MembershipPlan) => {
    setFormError(null);
    setForm(toForm(plan));
    setDialogOpen(true);
  };

  const updateForm = (key: keyof PlanForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submitPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const durationDays = Number(form.durationDays);
    const price = Number(form.price);
    const currency = form.currency.trim().toUpperCase() || 'USD';
    if (!form.name.trim()) {
      setFormError('Plan name is required.');
      return;
    }
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
      setFormError('Duration must be a whole number between 1 and 3650 days.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormError('Price must be zero or a positive amount.');
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      setFormError('Currency must be a 3-letter ISO code such as USD, EUR, or AED.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        durationDays,
        price,
        currency,
        status: form.status,
      };

      if (form.id) {
        await membershipApi.updatePlan(form.id, payload);
        toast.success('Plan updated');
      } else {
        await membershipApi.createPlan(payload);
        toast.success('Plan created');
      }

      setDialogOpen(false);
      await loadPlans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Membership Plans</h1>
          <p className="mt-1 text-sm text-slate-500">
            Backend-connected subscription tiers used for member renewals and invoice generation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadPlans} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New Plan
          </Button>
        </div>
      </div>

      {error && (
        <InlineAlert title="Plans API unavailable" variant="warning">
          <p>{error}</p>
          <p className="mt-1 text-xs">Confirm you are signed in and MySQL is configured, then run npm run db:migrate.</p>
        </InlineAlert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Plans</CardDescription>
            <CardTitle className="text-2xl">{plans.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active Plans</CardDescription>
            <CardTitle className="text-2xl">{activePlans.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Combined Active Price</CardDescription>
            <CardTitle className="text-2xl">{formatMoney(totalMonthlyValue, activePlans[0]?.currency || 'USD')}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <ScreenReportActions
        reportIds={['subscriptions-validity', 'invoices-collection']}
        title="Plan and subscription PDFs"
        description="Export subscription validity and collection reports from the plan management screen."
      />

      <Card>
        <CardHeader>
          <CardTitle>Subscription Catalog</CardTitle>
          <CardDescription>Create plans once, then reuse them from member renewals.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">Loading plans...</TableCell>
                </TableRow>
              ) : plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8">
                    <EmptyState
                      compact
                      title="No membership plans yet"
                      description="Create the first subscription tier before selling or renewing memberships."
                      actionLabel="Create plan"
                      onAction={openCreate}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{plan.name}</div>
                      <div className="text-xs text-slate-500">{plan.id}</div>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal text-slate-600">{plan.description || '—'}</TableCell>
                    <TableCell>{plan.durationDays} days</TableCell>
                    <TableCell>{formatMoney(plan.price, plan.currency)}</TableCell>
                    <TableCell><Badge variant={statusVariant(plan.status) as any}>{plan.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openEdit(plan)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Plan' : 'Create Plan'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitPlan} className="space-y-4">
            {formError && <InlineAlert title="Plan needs attention" variant="error">{formError}</InlineAlert>}
            <div className="space-y-2">
              <Label htmlFor="name">Plan Name</Label>
              <Input id="name" value={form.name} onChange={(event) => updateForm('name', event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={form.description} onChange={(event) => updateForm('description', event.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="durationDays">Duration Days</Label>
                <Input id="durationDays" type="number" min="1" value={form.durationDays} onChange={(event) => updateForm('durationDays', event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <Input id="price" type="number" min="0" step="0.01" value={form.price} onChange={(event) => updateForm('price', event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" value={form.currency} onChange={(event) => updateForm('currency', event.target.value)} maxLength={3} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={form.status}
                onChange={(event) => updateForm('status', event.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save Plan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
