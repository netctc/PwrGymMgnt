# Delivery 4 Implementation - Scheduling & Class Booking

## Scope

Delivery 4 implements the first production-ready scheduling layer for PowerGym Management. It adds MySQL-backed group classes, member bookings, recurring private sessions, resource loading, conflict validation, and frontend integration for the existing Classes and Private Classes screens.

## Implemented Backend Components

### New route module

- `server/scheduling.ts`

### New protected API namespace

- `GET /api/scheduling/resources`
- `GET /api/scheduling/classes`
- `POST /api/scheduling/classes`
- `PUT /api/scheduling/classes/:id`
- `DELETE /api/scheduling/classes/:id`
- `GET /api/scheduling/classes/:id/bookings`
- `POST /api/scheduling/classes/:id/bookings`
- `DELETE /api/scheduling/bookings/:id`
- `GET /api/scheduling/private-classes`
- `POST /api/scheduling/private-classes`
- `DELETE /api/scheduling/private-classes/:id`

All scheduling APIs are protected by the existing session middleware. Create, update, cancel, and booking actions require a scheduling-capable role: `super_admin`, `admin`, `manager`, `reception`, or `trainer`.

## Implemented Database Migration

Added:

- `sql/003_scheduling_class_booking_schema.sql`

New tables:

- `class_sessions`
- `class_bookings`
- `private_sessions`

Key indexes were added for time-range search, trainer availability, room availability, member bookings, and status filtering.

## Conflict Validation

The backend validates overlapping schedules before creating or updating sessions.

Conflicts checked:

- room already booked
- trainer already booked
- private-session member already booked
- class capacity full
- duplicate class booking for the same member

Conflict responses return HTTP `409` with structured details for the frontend.

## Frontend Integration

Added:

- `src/lib/schedulingApi.ts`

Updated:

- `src/pages/Classes.tsx`
- `src/pages/PrivateClasses.tsx`

### Group Classes screen

Implemented:

- weekly class loading from MySQL API
- group class creation
- room/trainer resource selection
- member booking into a class
- available capacity display
- class cancellation
- backend conflict messages

### Private Classes screen

Implemented:

- weekly private-session loading from MySQL API
- private session recurrence by date range and weekdays
- member/trainer/resource selection
- single-session cancellation
- full-series cancellation
- backend conflict messages

## Verification

Completed successfully:

```bash
npm run verify
npm audit
```

Results:

- TypeScript check passed.
- Production frontend build passed.
- Server bundle build passed.
- `npm audit` returned `found 0 vulnerabilities`.
- `/api/health` smoke test passed.
- `/api/scheduling/classes` correctly returned `401 Authentication required` without login.

Verification files:

- `docs/verification/verify_delivery4.log`
- `docs/verification/audit_delivery4.log`
- `docs/verification/server-smoke-delivery4.log`
- `docs/verification/health_delivery4.json`
- `docs/verification/scheduling_unauth_delivery4.json`
- `docs/verification/scheduling_unauth_delivery4.status`

## How to Apply

After extracting the package and configuring `.env` with MySQL credentials:

```bash
npm ci
npm run verify
npm audit
npm run db:migrate
npm run dev
```

## Notes and Limitations

- Trainer resources are loaded from the existing `staff` table. If the staff table is empty, add trainers from the Staff module first.
- Member resources are loaded from the MySQL `members` table introduced in previous deliveries.
- Group class and private class data now uses MySQL-backed scheduling tables rather than Firestore collections.
- Push notifications and advanced calendar drag/drop are planned for later deliveries.
