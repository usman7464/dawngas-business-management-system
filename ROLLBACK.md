# DawnGas Rollback Plan

## Do Not Delete Safety Files

Keep these local artifacts until production has been stable and separately backed up:

- `migration-backups/dawngas-before-atlas.archive.gz`
- migration manifest JSON files under `migration-backups/`
- original files under `data/uploads/`
- original backup JSON files under `data/backups/`

## Restore Local MongoDB From The Pre-Atlas Archive

Use this only for local recovery or a controlled restore target. It drops the target database before restore.

```powershell
& "migration-backups\tools\mongodb-database-tools-windows-x86_64-100.17.0\bin\mongorestore.exe" --uri="mongodb://127.0.0.1:27017/dawngas" --archive="migration-backups\dawngas-before-atlas.archive.gz" --gzip --drop
```

Verify:

```powershell
npm.cmd run audit:migration
```

## Switch The App Back To Local MongoDB

For local recovery:

```env
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/dawngas
MONGODB_DB_NAME=dawngas
STORAGE_PROVIDER=local
```

Restart the app and verify `/api/health`, login, dashboard, products, inventory, invoices, payments, settings, backups, and uploads.

## Roll Back A Vercel Deployment

List deployments:

```powershell
npx.cmd vercel@latest ls
```

Promote a known-good preview or previous deployment:

```powershell
npx.cmd vercel@latest promote <deployment-url-or-id>
```

Or run Vercel rollback:

```powershell
npx.cmd vercel@latest rollback
```

After rollback, verify:

- production URL loads
- `/api/health` returns `200`
- `/api/readiness` returns `200`
- owner login works
- Atlas data is visible
- uploads and backups download
- PDF endpoints return PDFs

## Recover Blob Metadata

If file metadata was updated incorrectly:

1. Keep the Blob objects in place.
2. Inspect the file migration report under `migration-backups/`.
3. Restore the affected `fileuploads`, `attachments`, or `backuprecords` documents from the pre-migration MongoDB archive or JSON backup.
4. Do not delete original files in `data/uploads/` or `data/backups/` until the Blob metadata is verified.

## Restore A Production JSON Backup

Use the authenticated Backup page in the app:

1. Download the current production backup first.
2. Upload the intended JSON backup.
3. Validate it.
4. Type the restore confirmation text.
5. Verify owner login, settings, master data, products, inventory, invoices, payments, reports, backups, and uploads.
