# Delivery 26 - Single Class PDF Route Fix

## Issue

The Classes page returned the Vite/React HTML shell when printing one class PDF. The frontend expected a PDF file, but the request was falling through to the SPA fallback instead of a backend report route.

## Fix

- Added a stable query-string endpoint: `GET /api/reports/class-session.pdf?classId=...`.
- Kept backwards-compatible aliases:
  - `GET /api/reports/class-session/:classId.pdf`
  - `GET /api/reports/class-session/:classId`
  - `GET /api/reports/classes/:classId/session.pdf`
- Updated the frontend report client to call the query-string endpoint.
- Added an `/api` 404 JSON fallback before Vite/SPA middleware so missing API endpoints return JSON, not `index.html`.

## Files Updated

- `server/reports.ts`
- `src/lib/reportsApi.ts`
- `server.ts`
- `docs/DELIVERY_26_SINGLE_CLASS_PDF_ROUTE_FIX.md`

## Database Migration

No database migration is required.
