const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || "data");
const LOCAL_UPLOAD_DIR = path.resolve(ROOT_DIR, process.env.UPLOAD_STORAGE_PATH || path.join(DATA_DIR, "uploads"));
const LOCAL_BACKUP_DIR = path.resolve(ROOT_DIR, process.env.BACKUP_STORAGE_PATH || path.join(DATA_DIR, "backups"));

function nowIso() {
  return new Date().toISOString();
}

function storageProvider() {
  return (process.env.STORAGE_PROVIDER || "local").toLowerCase();
}

function isBlobProvider() {
  return storageProvider() === "vercel_blob";
}

function safeFileName(value, fallback = "file") {
  const cleaned = String(value || fallback).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function localDirForKind(kind) {
  return kind === "backup" ? LOCAL_BACKUP_DIR : LOCAL_UPLOAD_DIR;
}

function ensureLocalDir(kind) {
  const dir = localDirForKind(kind);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function requireBlobClient() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required when STORAGE_PROVIDER=vercel_blob.");
  }
  try {
    return require("@vercel/blob");
  } catch (error) {
    throw new Error("@vercel/blob is required when STORAGE_PROVIDER=vercel_blob. Run npm install first.");
  }
}

function storageStatus() {
  const provider = storageProvider();
  const configured = provider === "local" ? process.env.NODE_ENV !== "production" : Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  return {
    provider,
    configured,
    message: configured
      ? "configured"
      : provider === "local"
        ? "Local disk storage is not allowed for production."
        : "BLOB_READ_WRITE_TOKEN is missing."
  };
}

function storedNameFor(fileId, fileName, mimeType = "") {
  const safeName = safeFileName(fileName);
  const extension = path.extname(safeName) || (mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : mimeType === "image/svg+xml" ? ".svg" : mimeType === "application/pdf" ? ".pdf" : "");
  return `${fileId}${extension}`;
}

function blobPath(prefix, storedName) {
  const date = new Date().toISOString().slice(0, 10);
  return ["dawngas", prefix || "uploads", date, storedName].map((part) => safeFileName(part)).join("/");
}

async function streamToBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  if (Buffer.isBuffer(stream)) return stream;
  if (typeof stream.arrayBuffer === "function") return Buffer.from(await stream.arrayBuffer());
  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function uploadBuffer(options) {
  const {
    buffer,
    fileId,
    fileName,
    mimeType = "application/octet-stream",
    prefix = "uploads",
    kind = "upload",
    access = "private",
    storedName: preferredStoredName
  } = options;

  if (!Buffer.isBuffer(buffer)) throw new Error("uploadBuffer requires a Buffer.");
  const originalName = safeFileName(fileName);
  const storedName = safeFileName(preferredStoredName || storedNameFor(fileId, originalName, mimeType));
  const provider = storageProvider();

  if (provider === "local") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Local file storage is disabled in production. Set STORAGE_PROVIDER=vercel_blob.");
    }
    const dir = ensureLocalDir(kind);
    const storagePath = path.join(dir, storedName);
    fs.writeFileSync(storagePath, buffer);
    return {
      storageProvider: "local",
      originalName,
      fileName: storedName,
      mimeType,
      size: buffer.byteLength,
      storagePath,
      pathname: storedName,
      url: "",
      access: "private",
      uploadedAt: nowIso()
    };
  }

  if (provider !== "vercel_blob") {
    throw new Error(`Unsupported STORAGE_PROVIDER "${provider}".`);
  }

  const { put } = requireBlobClient();
  const pathname = blobPath(prefix, storedName);
  const blobAccess = access === "public" && process.env.BLOB_PUBLIC_ACCESS_ENABLED === "true" ? "public" : "private";
  const blob = await put(pathname, buffer, {
    access: blobAccess,
    contentType: mimeType,
    allowOverwrite: true
  });

  return {
    storageProvider: "vercel_blob",
    originalName,
    fileName: storedName,
    mimeType,
    size: buffer.byteLength,
    storagePath: "",
    pathname: blob.pathname || pathname,
    url: blob.url || "",
    downloadUrl: blob.downloadUrl || "",
    access: blobAccess,
    uploadedAt: nowIso()
  };
}

async function uploadGeneratedPdf(buffer, fileName) {
  return uploadBuffer({
    buffer,
    fileId: path.basename(fileName, path.extname(fileName)),
    fileName,
    mimeType: "application/pdf",
    prefix: "generated-pdfs",
    kind: "upload",
    access: "private",
    storedName: safeFileName(fileName)
  });
}

async function uploadBackup(buffer, fileName) {
  return uploadBuffer({
    buffer,
    fileId: path.basename(fileName, path.extname(fileName)),
    fileName,
    mimeType: "application/json; charset=utf-8",
    prefix: "backups",
    kind: "backup",
    access: "private",
    storedName: safeFileName(fileName)
  });
}

function resolveLocalPath(record, kind = "upload") {
  if (record.storagePath && path.isAbsolute(record.storagePath)) return record.storagePath;
  const dir = localDirForKind(kind);
  return path.join(dir, safeFileName(record.fileName || record.storageName || record.pathname));
}

async function readStoredFile(record, options = {}) {
  if (!record) throw Object.assign(new Error("File not found."), { statusCode: 404 });
  const provider = (record.storageProvider || (record.pathname || record.url ? "vercel_blob" : "local")).toLowerCase();

  if (provider === "local") {
    const filePath = resolveLocalPath(record, options.kind || "upload");
    if (!fs.existsSync(filePath)) throw Object.assign(new Error("File not found."), { statusCode: 404 });
    return fs.readFileSync(filePath);
  }

  if (provider !== "vercel_blob") throw new Error(`Unsupported storage provider "${provider}".`);
  const identifier = record.url || record.downloadUrl || record.pathname;
  if (!identifier) throw Object.assign(new Error("File location is missing."), { statusCode: 404 });
  const { get } = requireBlobClient();
  const blob = await get(identifier, {
    access: record.access === "public" ? "public" : "private",
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  if (blob && typeof blob.arrayBuffer === "function") return Buffer.from(await blob.arrayBuffer());
  if (blob && blob.body) return streamToBuffer(blob.body);
  if (blob && blob.stream) return streamToBuffer(blob.stream);
  return streamToBuffer(blob);
}

async function removeStoredFile(record, options = {}) {
  if (!record) return false;
  const provider = (record.storageProvider || (record.pathname || record.url ? "vercel_blob" : "local")).toLowerCase();
  if (provider === "local") {
    const filePath = resolveLocalPath(record, options.kind || "upload");
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  }
  if (provider === "vercel_blob") {
    const identifier = record.url || record.downloadUrl || record.pathname;
    if (!identifier) return false;
    const { del } = requireBlobClient();
    await del(identifier);
    return true;
  }
  return false;
}

module.exports = {
  uploadBuffer,
  uploadGeneratedPdf,
  uploadBackup,
  readStoredFile,
  removeStoredFile,
  storageProvider,
  storageStatus,
  safeFileName,
  storedNameFor,
  LOCAL_UPLOAD_DIR,
  LOCAL_BACKUP_DIR
};
