# DawnGas Vercel Deployment

## Architecture

- Web app and HTTP backend: Vercel Functions through `api/index.js`
- Static/frontend assets: served by the existing Node handler from `public/`
- Production database: MongoDB Atlas database `dawngas`
- Production file storage: Vercel Blob with `STORAGE_PROVIDER=vercel_blob`
- Local development: local MongoDB and local disk storage under `data/`

## Required Environment Variables

Configure these in Vercel for Production and Preview. Store values only in Vercel, never in source control.

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=dawngas
JWT_SECRET=generated_secure_secret
APP_BASE_URL=https://your-vercel-domain
CORS_ORIGIN=https://your-vercel-domain
STORAGE_PROVIDER=vercel_blob
BLOB_READ_WRITE_TOKEN=vercel_blob_token
ENABLE_DEMO_TOOLS=false
ENABLE_DATA_CLEANUP=false
ENABLE_DEV_TOOLS=false
```

Local development keeps:

```env
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/dawngas
MONGODB_DB_NAME=dawngas
STORAGE_PROVIDER=local
```

## Pre-Deployment Safety

The deployment branch is `deployment-vercel-production`.

Before migration, create and keep a local archive:

```powershell
& "migration-backups\tools\mongodb-database-tools-windows-x86_64-100.17.0\bin\mongodump.exe" --uri="mongodb://127.0.0.1:27017/dawngas" --archive="migration-backups\dawngas-before-atlas.archive.gz" --gzip
```

Generate a migration manifest:

```powershell
npm.cmd run audit:migration
```

The `migration-backups/` directory is ignored and must not be committed.

## MongoDB Atlas Migration

Set destination variables in the shell without printing the full URI:

```powershell
$env:LOCAL_MONGODB_URI="mongodb://127.0.0.1:27017/dawngas"
$env:ATLAS_MONGODB_URI="mongodb+srv://..."
$env:MONGODB_DB_NAME="dawngas"
$env:MONGODUMP_PATH="migration-backups\tools\mongodb-database-tools-windows-x86_64-100.17.0\bin\mongodump.exe"
$env:MONGORESTORE_PATH="migration-backups\tools\mongodb-database-tools-windows-x86_64-100.17.0\bin\mongorestore.exe"
npm.cmd run migrate:local-to-atlas
```

The script refuses to run if source and destination are the same, creates a compressed archive, restores to Atlas, and writes a count comparison summary under `migration-backups/`.

## Vercel Blob Migration

After Atlas has the migrated metadata and Vercel Blob is provisioned:

```powershell
$env:ATLAS_MONGODB_URI="mongodb+srv://..."
$env:MONGODB_DB_NAME="dawngas"
$env:BLOB_READ_WRITE_TOKEN="..."
npm.cmd run migrate:files-to-blob
```

The script uploads local files from `data/uploads/` and `data/backups/`, updates MongoDB metadata, writes a report, and never deletes local files.

## Vercel Environment Setup

Use Vercel CLI after login/linking:

```powershell
npx.cmd vercel@latest link --yes
npx.cmd vercel@latest env add MONGODB_URI production
npx.cmd vercel@latest env add MONGODB_DB_NAME production
npx.cmd vercel@latest env add JWT_SECRET production
npx.cmd vercel@latest env add APP_BASE_URL production
npx.cmd vercel@latest env add CORS_ORIGIN production
npx.cmd vercel@latest env add STORAGE_PROVIDER production
npx.cmd vercel@latest env add BLOB_READ_WRITE_TOKEN production
npx.cmd vercel@latest env add ENABLE_DATA_CLEANUP production
npx.cmd vercel@latest env add ENABLE_DEMO_TOOLS production
npx.cmd vercel@latest env add ENABLE_DEV_TOOLS production
```

Repeat for Preview as appropriate. Do not paste secrets into files.

## Build And Test

```powershell
npm.cmd install
npm.cmd run check
npm.cmd run build
npm.cmd run smoke-test
```

For the smoke test, start the local server first in another shell with the desired `PORT`.

## Preview Deployment

```powershell
npx.cmd vercel@latest pull --yes
npx.cmd vercel@latest build
npx.cmd vercel@latest deploy --prebuilt --yes
```

Verify:

- `/`
- `/api/health`
- `/api/readiness`
- owner login/logout
- dashboard, products, inventory, purchases, production, invoices, payments, customers, expenses, reports, settings, backups
- upload/download routes
- PDF routes for invoices, receipts, customer statements, and reports

## Production Deployment

Deploy only after preview verification passes:

```powershell
npx.cmd vercel@latest build --prod
npx.cmd vercel@latest deploy --prebuilt --prod --yes
```

Then verify the production URL with the same checklist and scan logs:

```powershell
npx.cmd vercel@latest logs <production-url>
```

## Troubleshooting

- Readiness `503`: check `MONGODB_URI`, `MONGODB_DB_NAME`, `JWT_SECRET`, `STORAGE_PROVIDER`, and `BLOB_READ_WRITE_TOKEN`.
- Upload fails in production: verify `STORAGE_PROVIDER=vercel_blob` and Blob token access.
- MongoDB timeout: verify Atlas network access for Vercel and database user permissions.
- Build fails on missing tools: run `npm.cmd install` and confirm Node.js 20+.
- Login fails after deployment: ensure the migrated `owners` collection exists and `JWT_SECRET` is stable between deploys.

## Backups And Rollback

Backups created in production are stored in Vercel Blob and tracked in `backuprecords`. See [ROLLBACK.md](ROLLBACK.md) before restoring data or changing production aliases.
