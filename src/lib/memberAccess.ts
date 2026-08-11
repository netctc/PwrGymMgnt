import type { MembershipMember } from './membershipApi';
import { formatDate } from './formatDate';

export type MemberAccessState = {
  allowed: boolean;
  label: 'Allowed' | 'Blocked';
  reason: string;
};

const dateValue = (value?: string | null) => value ? String(value).slice(0, 10) : '';

export function evaluateMemberListAccess(
  member: MembershipMember,
  todayValue = new Date().toISOString().slice(0, 10),
): MemberAccessState {
  const storedStatus = String(member.status || '').toLowerCase() || 'inactive';
  const expiry = dateValue(member.currentExpiry);
  const memberStatus = storedStatus === 'active' && expiry && expiry < todayValue
    ? 'expired'
    : storedStatus;
  const plans = member.plans || [];
  const currentPlans = plans.filter((plan) =>
    plan.subscriptionStatus === 'active' &&
    ['active', 'suspended'].includes(plan.status) &&
    (!plan.startDate || dateValue(plan.startDate) <= todayValue) &&
    (!plan.endDate || dateValue(plan.endDate) >= todayValue));

  if (memberStatus !== 'active') {
    return { allowed: false, label: 'Blocked', reason: `Member is ${memberStatus}` };
  }

  const activePlans = currentPlans.filter((plan) => plan.status === 'active');
  const accessiblePlan = activePlans.find((plan) => {
    const paymentStatus = String(plan.paymentStatus || 'paid').toLowerCase();
    if (['paid', 'waived'].includes(paymentStatus)) return true;
    if (!['pending', 'partial'].includes(paymentStatus)) return false;
    const expectedPaymentDate = dateValue(plan.expectedPaymentDate || plan.startDate);
    return Boolean(expectedPaymentDate && expectedPaymentDate >= todayValue);
  });
  if (accessiblePlan) {
    const paymentStatus = String(accessiblePlan.paymentStatus || '').toLowerCase();
    return {
      allowed: true,
      label: 'Allowed',
      reason: ['pending', 'partial'].includes(paymentStatus)
        ? `Payment ${paymentStatus} until ${formatDate(accessiblePlan.expectedPaymentDate || accessiblePlan.startDate)}`
        : 'Active affiliation',
    };
  }
  if (activePlans.length > 0) {
    return { allowed: false, label: 'Blocked', reason: 'Payment overdue' };
  }
  if (currentPlans.some((plan) => plan.status === 'suspended')) {
    return { allowed: false, label: 'Blocked', reason: 'Affiliation suspended or frozen' };
  }
  if (plans.length === 0 && member.currentPlan && expiry >= todayValue) {
    const paymentStatus = String(member.paymentStatus || 'paid').toLowerCase();
    const dueDate = dateValue(member.paymentDueDate);
    if (paymentStatus === 'paid' || (paymentStatus === 'pending' && dueDate >= todayValue)) {
      return {
        allowed: true,
        label: 'Allowed',
        reason: paymentStatus === 'pending'
          ? `Payment pending until ${formatDate(member.paymentDueDate)}`
          : 'Active legacy subscription',
      };
    }
    return { allowed: false, label: 'Blocked', reason: 'Payment overdue' };
  }
  return { allowed: false, label: 'Blocked', reason: 'No active subscription' };
}
