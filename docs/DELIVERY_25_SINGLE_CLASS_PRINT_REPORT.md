# Delivery 25 - Single Class Print PDF Report

## Purpose

Add a print option in the Classes section for one specific group class session. The PDF includes the class details, trainer name, capacity, enrolled count, and the full list of members registered/enrolled in that class.

## New backend endpoint

```txt
GET /api/reports/class-session/:classId.pdf
```

The endpoint is protected by the same report permissions used for the Classes report.

## PDF contents

The generated PDF contains:

- Class name
- Trainer name
- Room
- Date/time
- Type, level and branch
- Capacity
- Number of enrolled members
- Free spots
- Full enrolled member list / miembros inscritos
- Booking history for the class

## Frontend changes

Updated the Classes page so each class card now includes:

```txt
Print Class
```

This button downloads the single-class PDF for that class only.

## Updated files

```txt
server/reports.ts
src/lib/reportsApi.ts
src/pages/Classes.tsx
docs/DELIVERY_25_SINGLE_CLASS_PRINT_REPORT.md
README.md
```

## Notes

No database migration is required. Enrollment is calculated from `class_bookings` instead of relying on a stored `enrolled_count` column.
