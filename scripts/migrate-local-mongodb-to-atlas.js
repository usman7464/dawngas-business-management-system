const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { MongoClient } = require("mongodb");

require("dotenv").config({ quiet: true });

const root = path.resolve(__dirname, "..");
const backupDir = path.join(root, "migration-backups");
const sourceUri = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/dawngas";
const destinationUri = process.env.ATLAS_MONGODB_URI || process.env.MONGODB_URI;
const sourceDbName = process.env.LOCAL_MONGODB_DB_NAME || "dawngas";
const destinationDbName = process.env.MONGODB_DB_NAME || "dawngas";
const archivePath = process.env.MIGRATION_ARCHIVE_PATH || path.join(backupDir, `dawngas-before-atlas-${new Date().toISOString().replace(/[:.]/g, "-")}.archive.gz`);
const mongodump = process.env.MONGODUMP_PATH || "mongodump";
const mongorestore = process.env.MONGORESTORE_PATH || "mongorestore";

const collections = [
  "owners",
  "businesssettings",
  "productcategories",
  "products",
  "billofmaterials",
  "inventoryitems",
  "inventorymovements",
  "productionbatches",
  "productionmaterialusages",
  "suppliers",
  "purchases",
  "purchaseitems",
  "customers",
  "invoices",
  "invoiceitems",
  "payments",
  "expenses",
  "notifications",
  "activitylogs",
  "fileuploads",
  "notes",
  "attachments",
  "dashboardpreferences",
  "backuprecords",
  "restorelogs",
  "reminderlogs",
  "orders",
  "orderitems",
  "deliveries",
  "masterdata",
  "sharelinks"
];

function maskUri(value) {
  return String(value || "").replace(/\/\/([^:/@]+):([^@]+)@/, "//$1:***@");
}

function sanitizeOutput(value) {
  let output = String(value || "");
  if (sourceUri) output = output.split(sourceUri).join(maskUri(sourceUri));
  if (destinationUri) output = output.split(destinationUri).join(maskUri(destinationUri));
  return output;
}

function normalized(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function runTool(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error && result.error.code === "ENOENT") {
    throw new Error(`${label} is not available. Install MongoDB Database Tools or set ${label === "mongodump" ? "MONGODUMP_PATH" : "MONGORESTORE_PATH"}.`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${sanitizeOutput(result.stderr || result.stdout || "Unknown error")}`);
  }
}

async function countsFor(uri, dbName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(dbName);
  const existing = new Set((await db.listCollections().toArray()).map((collection) => collection.name));
  const counts = {};
  for (const name of collections) {
    counts[name] = existing.has(name) ? await db.collection(name).countDocuments() : 0;
  }
  await client.close();
  return counts;
}

(async () => {
  if (!destinationUri) {
    throw new Error("ATLAS_MONGODB_URI or MONGODB_URI is required for the Atlas destination.");
  }
  if (normalized(sourceUri) === normalized(destinationUri)) {
    throw new Error("Source and destination MongoDB URIs are the same. Refusing to run.");
  }
  if (!destinationUri.startsWith("mongodb+srv://") && !process.env.ALLOW_NON_ATLAS_DESTINATION) {
    throw new Error("Destination URI does not look like MongoDB Atlas. Set ALLOW_NON_ATLAS_DESTINATION=true only for a verified non-production test.");
  }

  fs.mkdirSync(backupDir, { recursive: true });
  console.log(`Source: ${maskUri(sourceUri)} (${sourceDbName})`);
  console.log(`Destination: ${maskUri(destinationUri)} (${destinationDbName})`);
  console.log(`Archive: ${archivePath}`);

  const before = await countsFor(sourceUri, sourceDbName);
  runTool(mongodump, [`--uri=${sourceUri}`, `--archive=${archivePath}`, "--gzip"], "mongodump");
  const stats = fs.statSync(archivePath);
  if (!stats.size) throw new Error("mongodump produced an empty archive.");

  const restoreArgs = [`--uri=${destinationUri}`, `--archive=${archivePath}`, "--gzip"];
  if (process.env.MIGRATION_RESTORE_DROP === "true") restoreArgs.push("--drop");
  if (sourceDbName !== destinationDbName) {
    restoreArgs.push("--nsFrom", `${sourceDbName}.*`, "--nsTo", `${destinationDbName}.*`);
  }
  runTool(mongorestore, restoreArgs, "mongorestore");
  const after = await countsFor(destinationUri, destinationDbName);
  const comparison = collections.map((collection) => ({
    collection,
    local: before[collection] || 0,
    atlas: after[collection] || 0,
    difference: (after[collection] || 0) - (before[collection] || 0),
    status: (after[collection] || 0) === (before[collection] || 0) ? "MATCH" : "DIFF"
  }));
  const mismatches = comparison.filter((row) => row.status !== "MATCH");
  const summaryPath = archivePath.replace(/\.archive\.gz$/i, ".summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    archivePath,
    archiveBytes: stats.size,
    source: { uri: maskUri(sourceUri), dbName: sourceDbName },
    destination: { uri: maskUri(destinationUri), dbName: destinationDbName },
    comparison
  }, null, 2));

  console.log(`Archive bytes: ${stats.size}`);
  console.log(`Summary written: ${summaryPath}`);
  if (mismatches.length) {
    console.log(JSON.stringify(mismatches, null, 2));
    throw new Error("Atlas count validation found differences.");
  }
  console.log("MongoDB Atlas migration completed and counts match.");
})().catch((error) => {
  console.error(sanitizeOutput(error.message));
  process.exit(1);
});
