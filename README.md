# DawnGas Business Management System

Owner-only business management dashboard for DawnGas. It manages products, raw materials, spare parts, services, inventory, purchases, production, invoices, payments, reports, backups, uploads, and branded document sharing.

## Stack

- Node.js 20+
- MongoDB locally, MongoDB Atlas in production
- Vercel Functions for the HTTP backend
- Vercel Blob for production file and backup storage
- Vanilla JavaScript, HTML, and CSS

## Local Development

1. Start local MongoDB.
2. Copy `.env.example` to `.env` and keep `STORAGE_PROVIDER=local`.
3. Install dependencies:

```powershell
npm.cmd install
```

4. Start the app:

```powershell
npm.cmd run start
```

5. Open `http://localhost:5000`.

## Useful Commands

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd run audit:migration
npm.cmd run smoke-test
npm.cmd run migrate:local-to-atlas
npm.cmd run migrate:files-to-blob
```

## Production

Production deployment uses Vercel, MongoDB Atlas, and Vercel Blob. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full workflow and [ROLLBACK.md](ROLLBACK.md) for recovery steps.
