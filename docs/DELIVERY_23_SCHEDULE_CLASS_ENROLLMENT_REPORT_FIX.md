# Delivery 23 - Scheduled Classes PDF Enrollment Compatibility Fix

## Issue

The **Print Scheduled Session** action on the Classes page failed on deployed databases with:

```text
Unknown column 'cs.enrolled_count' in 'SELECT'
```

The `class_sessions` table does not define an `enrolled_count` column. Enrollment must be calculated from active records in `class_bookings`.

## Fix

Updated `server/reports.ts` so the scheduled class reports no longer read `cs.enrolled_count`.

Enrollment is now calculated using:

```sql
SELECT class_id, COUNT(*) AS active_bookings
FROM class_bookings
WHERE status = 'booked'
GROUP BY class_id
```

The report then uses `COALESCE(active_bookings, 0)` as the enrolled count and calculates free spots from `capacity - active_bookings`.

## Updated Reports

- `/api/reports/classes.pdf`
- `/api/reports/scheduled-classes.pdf`
- Classes page **Print Scheduled Session** button

## Result

The report is now compatible with the actual migration schema and does not require a new database column.
