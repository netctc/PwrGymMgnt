# Delivery 21 - Scheduled Session PDF Printouts

## Scope

This delivery adds a **Print Scheduled Session** option directly inside the scheduling screens:

- Classes
- Private PT

The feature generates PDF files from MySQL data for either:

- all trainers, or
- one selected trainer.

The printout uses the currently selected calendar week in the screen.

## Backend changes

Updated file:

- `server/reports.ts`

New report endpoints:

```txt
GET /api/reports/scheduled-classes.pdf?from=YYYY-MM-DD&to=YYYY-MM-DD&trainerId=all
GET /api/reports/scheduled-private-pt.pdf?from=YYYY-MM-DD&to=YYYY-MM-DD&trainerId=all
```

`trainerId` can be omitted, set to `all`, or set to a specific trainer/staff ID.

### Group class PDF includes

- period
- trainer filter
- scheduled class count
- active booking count
- rooms used
- schedule by trainer
- scheduled classes list
- booked members list

### Private PT PDF includes

- period
- trainer filter
- scheduled PT session count
- members scheduled
- rooms used
- schedule by trainer
- schedule by room
- scheduled private/PT session list

## Frontend changes

Updated files:

- `src/lib/reportsApi.ts`
- `src/pages/Classes.tsx`
- `src/pages/PrivateClasses.tsx`

Each screen now includes:

- trainer selector: **All trainers** or one trainer
- **Print Scheduled Session** button

The downloaded PDF uses the week currently shown on the page.

## Permissions

The endpoints use the same role access rules as the existing Classes and Private PT reports.

Allowed roles include:

- `super_admin`
- `admin`
- `manager`
- `reception`
- `trainer`

## Render compatibility

The change is compatible with the existing Render low-memory build path and does not add additional heavy client dependencies.
