const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

require("dotenv").config({ quiet: true });
process.env.STORAGE_PROVIDER = "vercel_blob";

const { uploadBuffer, uploadBackup } = require("../services/storageService");

const root = path.resolve(__dirname, "..");
const dataDir = path.resolve(root, process.env.DATA_DIR || "data");
const uploadDir = path.resolve(root, process.env.UPLOAD_STORAGE_PATH || path.join(dataDir, "uploads"));
const backupDir = path.resolve(root, process.env.BACKUP_STORAGE_PATH || path.join(dataDir, "backups"));
const uri = process.env.FILE_MIGRATION_MONGODB_URI || process.env.ATLAS_MONGODB_URI || process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "dawngas";

function maskUri(value) {
  return String(value || "").replace(/\/\/([^:/@]+):([^@]+)@/, "//$1:***@");
}

function localPathForUpload(record) {
  if (record.storagePath && path.isAbsolute(record.storagePath)) return record.storagePath;
  return path.join(uploadDir, record.fileName || record.storageName || "");
}

function localPathForBackup(record) {
  if (record.storagePath && path.isAbsolute(record.storagePath)) return record.storagePath;
  if (record.filePath && path.isAbsolute(record.filePath)) return record.filePath;
  return path.join(backupDir, record.fileName || "");
}

function accessForUpload(record) {
  return record.entityType === "businessSettings" && record.entityId === "business" ? "public" : "private";
}

(async () => {
  if (!uri) throw new Error("FILE_MIGRATION_MONGODB_URI, ATLAS_MONGODB_URI, or MONGODB_URI is required.");
  if (!uri.startsWith("mongodb+srv://") && process.env.ALLOW_NON_ATLAS_FILE_MIGRATION !== "true") {
    throw new Error("File migration should update Atlas metadata. Set ALLOW_NON_ATLAS_FILE_MIGRATION=true only for a verified local test.");
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required.");

  console.log(`Metadata database: ${maskUri(uri)} (${dbName})`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(dbName);
  const report = {
    startedAt: new Date().toISOString(),
    uploads: { migrated: 0, skipped: 0, missing: 0, errors: [] },
    backups: { migrated: 0, skipped: 0, missing: 0, errors: [] }
  };

  const uploads = await db.collection("fileuploads").find({ deletedAt: { $in: [null, ""] } }).toArray();
  for (const upload of uploads) {
    if (upload.storageProvider === "vercel_blob" && upload.pathname) {
      report.uploads.skipped += 1;
      continue;
    }
    const localPath = localPathForUpload(upload);
    if (!fs.existsSync(localPath)) {
      report.uploads.missing += 1;
      report.uploads.errors.push({ id: upload.id, fileName: upload.fileName, reason: "local file missing" });
      continue;
    }
    const buffer = fs.readFileSync(localPath);
    const stored = await uploadBuffer({
      buffer,
      fileId: upload.id,
      fileName: upload.originalName || upload.fileName,
      mimeType: upload.mimeType || "application/octet-stream",
      prefix: upload.entityType === "businessSettings" ? "logos" : "uploads",
      access: accessForUpload(upload),
      storedName: upload.fileName
    });
    const update = {
      storageProvider: stored.storageProvider,
      storagePath: "",
      pathname: stored.pathname,
      url: stored.url,
      access: stored.access,
      uploadedAt: stored.uploadedAt,
      updatedAt: new Date().toISOString()
    };
    await db.collection("fileuploads").updateOne({ id: upload.id }, { $set: update });
    await db.collection("attachments").updateMany({ fileUploadId: upload.id }, { $set: update });
    report.uploads.migrated += 1;
  }

  const backups = await db.collection("backuprecords").find({ deletedAt: { $in: [null, ""] } }).toArray();
  for (const backup of backups) {
    if (backup.storageProvider === "vercel_blob" && backup.pathname) {
      report.backups.skipped += 1;
      continue;
    }
    const localPath = localPathForBackup(backup);
    if (!fs.existsSync(localPath)) {
      report.backups.missing += 1;
      report.backups.errors.push({ id: backup.id, fileName: backup.fileName, reason: "local backup missing" });
      continue;
    }
    const buffer = fs.readFileSync(localPath);
    const stored = await uploadBackup(buffer, backup.fileName);
    await db.collection("backuprecords").updateOne(
      { id: backup.id },
      {
        $set: {
          storageProvider: stored.storageProvider,
          storagePath: "",
          filePath: "",
          pathname: stored.pathname,
          url: stored.url,
          access: stored.access,
          uploadedAt: stored.uploadedAt,
          updatedAt: new Date().toISOString()
        }
      }
    );
    report.backups.migrated += 1;
  }

  report.completedAt = new Date().toISOString();
  const reportDir = path.join(root, "migration-backups");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `dawngas-file-blob-migration-${report.completedAt.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`File-to-Blob migration report: ${reportPath}`);
  console.log(JSON.stringify({
    uploadsMigrated: report.uploads.migrated,
    uploadsMissing: report.uploads.missing,
    backupsMigrated: report.backups.migrated,
    backupsMissing: report.backups.missing
  }, null, 2));
  await client.close();
})().catch((error) => {
  console.error(error.message.replace(uri || "", maskUri(uri || "")));
  process.exit(1);
});
