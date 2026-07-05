# Delivery 22 - Schedule Print Error Fix

## Problem

The Classes page could show `[object Object]` when using **Print Scheduled Session**.

## Cause

The reports API converted JSON error objects directly into `Error` messages. When the backend returned a structured error such as `{ error: { message, status, requestId } }`, the browser displayed the object as `[object Object]`.

In addition, older databases may have a legacy `class_bookings` table from the foundation migration that does not include `member_name` or `cancelled_at`. The scheduled class PDF report reads booking data, so the endpoint now ensures these compatibility columns exist before generating the PDF.

## Changes

- Updated `src/lib/reportsApi.ts` with robust nested error extraction.
- Added PDF content-type validation before downloading.
- Updated `server/reports.ts` to ensure scheduled-class report compatibility columns.
- Updated `server/scheduling.ts` so scheduling operations also add missing compatibility columns.

## User Impact

- The print button now shows readable errors instead of `[object Object]`.
- Scheduled classes PDF generation works on databases created from earlier deliveries.
- The same improved error handling also applies to Private PT schedule PDFs and the general Reports page.
