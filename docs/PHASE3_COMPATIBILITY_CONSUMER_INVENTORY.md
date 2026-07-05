# Phase 3 Compatibility Consumer Inventory

This inventory tracks remaining Firestore-style compatibility consumers after the first typed dashboard migration.

## Migrated in Delivery 51

| Surface | Previous compatibility collections | New typed API |
|---|---|---|
| Dashboard KPIs and charts | `users`, `members`, `classes`, `shifts`, `hr_profiles`, `subscriptions` | `GET /api/dashboard/summary` |
| Trainer Utilization chart | `users`, `classes`, `private_classes` | `GET /api/dashboard/trainer-utilization` |

## Remaining compatibility consumers

| File | Collections / operations | Recommended typed replacement |
|---|---|---|
| `src/pages/Staff.tsx` | `users`, `shifts` read/write/delete | `GET/POST/PUT/DELETE /api/staff/users`, `GET/POST/PUT/DELETE /api/staff/shifts` |
| `src/contexts/AuthContext.tsx` | `users`, `shifts` user merge/update operations | Dedicated auth/profile reconciliation endpoints |
| `src/pages/Settings.tsx` | `settings`, backup/audit helper reads | Typed settings and platform endpoints |
| `src/lib/firebase.ts` | `auditLogs` write helper | Typed audit event ingestion or server-side audit middleware |

## Migration rule

New production UI work must not add direct `firebase/firestore` compatibility imports. Use a domain client under `src/lib/*Api.ts` backed by a Zod contract in `shared/apiContracts.ts`.
