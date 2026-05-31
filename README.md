# DawnGas Business Management System

Owner-only business management dashboard for DawnGas. The app manages products, raw materials, spare parts, services, inventory, purchases, production, invoices, payments, reports, backups, and branded document sharing.

## Tech Stack

- Node.js 20+
- MongoDB
- Vanilla JavaScript, HTML, and CSS
- Dependency-light HTTP server in `server.js`

## Run Locally

1. Start MongoDB locally.
2. Copy `.env.example` to `.env` if needed and adjust values.
3. Install dependencies:

```powershell
npm install
```

4. Start the app:

```powershell
npm run start
```

5. Open:

```text
http://localhost:5000
```

## Useful Commands

```powershell
npm run smoke
npm run seed:demo
npm run demo:reset
```

If you run the smoke test against the configured local port:

```powershell
$env:PORT="5000"
npm run smoke
```

## Important Environment Variables

- `PORT`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `JWT_SECRET`
- `BACKUP_STORAGE_PATH`
- `UPLOAD_STORAGE_PATH`

## Recent Fixes

- MongoDB-backed item types, units, storage locations, categories, and item behavior.
- Dynamic Add Item form with sectioned product/service/inventory/BOM behavior.
- Structured bill-of-materials table.
- Logo-only sidebar branding with optional logo + business name setting.
- Mobile sidebar drawer with hamburger, close button, overlay close, and Escape close.
- Tokenized PDF share links for WhatsApp invoice, receipt, customer statement, and report sharing.
- Branded dependency-free PDF responses for invoices, receipts, statements, and reports.
