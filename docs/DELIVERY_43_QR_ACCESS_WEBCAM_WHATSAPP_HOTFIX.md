# Delivery 43 - QR Access Webcam Reader and WhatsApp Delivery Hotfix

## Scope

This hotfix addresses two operational issues reported after the member e-card work:

1. Sending an e-card by WhatsApp raised an exception through the global error handler when WhatsApp Cloud API variables were not configured.
2. QR Access needed to read the same QR generated from Member Directory using either a webcam scanner or a physical QR reader.

## Backend changes

### WhatsApp provider preflight

`POST /api/membership/members/:id/ecard/deliver` now checks WhatsApp provider configuration before generating the PDF or creating a pending delivery log.

If `WHATSAPP_CLOUD_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is missing, the route returns:

```json
{
  "error": "WhatsApp provider is not configured. Set WHATSAPP_CLOUD_TOKEN and WHATSAPP_PHONE_NUMBER_ID to send e-card PDFs by WhatsApp.",
  "code": "WHATSAPP_PROVIDER_NOT_CONFIGURED"
}
```

with HTTP `501`, without passing through the global error handler.

### Helper exports

Added reusable helpers:

- `isEcardWhatsAppConfigured()`
- `getEcardWhatsAppConfigurationError()`

## Frontend changes

### QR Access camera scanner

`src/pages/QRScanner.tsx` now includes a webcam QR reader using the browser-native `BarcodeDetector` API. No npm dependency was added.

Supported scan inputs:

- raw token from `QRCodeCanvas` generated in Member Directory,
- JSON payloads containing `token`, `accessToken`, `access_token`, or `qrToken`,
- URLs containing `?token=`, `?accessToken=`, or `?access_token=`,
- `powergym-access:<token>` payloads.

### Physical QR readers

USB/handheld QR readers continue to work through the manual input field. Most physical readers act as keyboard input and submit automatically when configured to send Enter.

## Browser notes

Webcam QR scanning uses `BarcodeDetector`, available in modern Chromium-based browsers such as Chrome and Edge. If unavailable, the page shows a fallback message and the operator can still use a USB QR reader or paste the token manually.

## Tests

Added regression coverage for WhatsApp configuration helpers in `tests/membershipEcard.test.ts`.
