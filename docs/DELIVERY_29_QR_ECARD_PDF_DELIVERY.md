# Delivery 29 - QR e-Card PDF Delivery and Template Customization

## Summary
Implemented QR e-card PDF generation and delivery workflow for members.

## Features
- QR e-card PDF includes the QR code, token text, member full name, plan name, and subscription expiry date.
- New backend endpoint to generate/download a PDF e-card.
- New backend endpoint to deliver the e-card PDF by Email or WhatsApp when providers are configured.
- Browser fallback downloads/shares the PDF if delivery providers are not configured.
- Settings > General Configuration includes QR e-card template controls for title, note, and image background.

## New API Endpoints
```txt
POST /api/membership/members/:id/ecard/pdf
POST /api/membership/members/:id/ecard/deliver
```

## Optional Production Environment Variables
Email delivery uses SendGrid:
```env
SENDGRID_API_KEY=...
ECARD_FROM_EMAIL=no-reply@yourdomain.com
```

WhatsApp delivery uses the WhatsApp Cloud API:
```env
WHATSAPP_CLOUD_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

If these variables are missing, the app downloads/shares the PDF for manual delivery instead of failing silently.

## Database
Added migration:
```txt
sql/011_qr_ecard_pdf_delivery_template.sql
```
