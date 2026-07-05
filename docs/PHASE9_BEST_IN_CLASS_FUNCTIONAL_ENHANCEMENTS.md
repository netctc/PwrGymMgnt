# Phase 9 - Best-in-Class Functional Enhancements

## Objective

Phase 9 introduces an operational feature layer that turns the application from a collection of modules into a proactive management tool. The first best-in-class capability is a Smart Action Center on the dashboard.

## Delivered capability: Smart Action Center

The Smart Action Center consolidates actionable exceptions from core operational modules and ranks them by severity.

### Covered modules

- Membership: expired and soon-to-expire memberships.
- Scheduling: low occupancy warnings.
- HR: understaffed departments and missing HR profiles.
- Finance: pending or draft finance transactions.
- Warehouse: low stock, expiring stock, and overdue purchase orders.
- Support: high-priority or aging support tickets.
- System: unread notifications and positive no-action state.

## API contract

New typed endpoint:

```http
GET /api/dashboard/action-center
```

Authorization:

```text
dashboard.read
```

The endpoint returns:

- `summary.total`
- `summary.critical`
- `summary.warning`
- `summary.info`
- prioritized `items[]` with module, severity, title, description, action link, source, optional due date, and metric.

## Role-aware output

The endpoint checks module permissions before adding module-specific action items. For example, a user without `warehouse.read` will not receive warehouse stock recommendations, even if they can access the dashboard.

## Frontend integration

The dashboard now includes a Smart Action Center card that displays up to six top-priority actions with:

- severity badge,
- module badge,
- short description,
- direct action link.

## Performance

The new endpoint is included in the safe GET cache whitelist:

```text
/api/dashboard/action-center
```

Cache keys remain actor-aware to avoid cross-user leakage.

## Future enhancements

Recommended follow-up items:

1. Add action ownership and completion tracking.
2. Add SLA configuration per module.
3. Allow managers to snooze or assign action items.
4. Add email/WhatsApp escalation for critical actions.
5. Add drill-down details for each action item.
