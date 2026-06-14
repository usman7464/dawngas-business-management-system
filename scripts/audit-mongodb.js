const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

require("dotenv").config({ quiet: true });

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "migration-backups");
const uri = process.env.LOCAL_MONGODB_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dawngas";
const dbName = process.env.LOCAL_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME || "dawngas";

const requiredCollections = [
  "owners",
  "businesssettings",
  "itemtypes",
  "productcategories",
  "unitsofmeasure",
  "storagelocations",
  "paymentmethods",
  "expensecategories",
  "invoicetermtemplates",
  "products",
  "billofmaterials",
  "inventoryitems",
  "inventorymovements",
  "productionbatches",
  "productionmaterialusages",
  "suppliers",
  "purchases",
  "purchaseitems",
  "purchasereceipts",
  "purchasereceiptitems",
  "supplierreturns",
  "supplierreturnitems",
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
  "sharelinks",
  "sessions",
  "passwordresettokens"
];

function maskUri(value) {
  return String(value || "").replace(/\/\/([^:/@]+):([^@]+)@/, "//$1:***@");
}

async function duplicateValues(collection, field) {
  return collection
    .aggregate([
      { $match: { [field]: { $nin: [null, ""] } } },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ])
    .toArray();
}

function looksManualTest(record) {
  const text = [
    record.name,
    record.title,
    record.email,
    record.phone,
    record.sku,
    record.invoiceNumber,
    record.purchaseNumber,
    record.receiptNumber,
    record.customerName,
    record.supplierName,
    record.originalName
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(test|demo|sample|smoke)\b/.test(text);
}

async function idSet(db, collectionName) {
  return new Set((await db.collection(collectionName).find({}, { projection: { id: 1 } }).toArray()).map((record) => record.id).filter(Boolean));
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(dbName);
  const existing = new Set((await db.listCollections().toArray()).map((collection) => collection.name));
  const counts = {};
  const missingCollections = [];
  const demoCounts = {};
  const softDeletedCounts = {};
  const manualTestCounts = {};

  for (const name of requiredCollections) {
    if (!existing.has(name)) {
      counts[name] = 0;
      missingCollections.push(name);
      continue;
    }
    const collection = db.collection(name);
    counts[name] = await collection.countDocuments();
    const demo = await collection.countDocuments({ isDemo: true });
    if (demo) demoCounts[name] = demo;
    const softDeleted = await collection.countDocuments({
      $or: [{ deletedAt: { $nin: [null, ""] } }, { archivedAt: { $nin: [null, ""] } }, { status: "ARCHIVED" }]
    });
    if (softDeleted) softDeletedCounts[name] = softDeleted;
    const sample = await collection.find({}).limit(500).toArray();
    const manualTests = sample.filter(looksManualTest).length;
    if (manualTests) manualTestCounts[name] = manualTests;
  }

  const products = existing.has("products") ? await idSet(db, "products") : new Set();
  const categories = existing.has("productcategories") ? await idSet(db, "productcategories") : new Set();
  const customers = existing.has("customers") ? await idSet(db, "customers") : new Set();
  const invoices = existing.has("invoices") ? await idSet(db, "invoices") : new Set();
  const fileUploads = existing.has("fileuploads") ? await idSet(db, "fileuploads") : new Set();

  const orphans = {};
  if (existing.has("products")) {
    orphans.productsMissingCategory = await db.collection("products").countDocuments({ categoryId: { $nin: [...categories, "", null] } });
  }
  if (existing.has("inventoryitems")) {
    orphans.inventoryMissingProduct = await db.collection("inventoryitems").countDocuments({ productId: { $nin: [...products] } });
  }
  if (existing.has("invoiceitems")) {
    orphans.invoiceItemsMissingProduct = await db.collection("invoiceitems").countDocuments({ productId: { $nin: [...products, "", null] } });
    orphans.invoiceItemsMissingInvoice = await db.collection("invoiceitems").countDocuments({ invoiceId: { $nin: [...invoices] } });
  }
  if (existing.has("payments")) {
    orphans.paymentsMissingCustomer = await db.collection("payments").countDocuments({ customerId: { $nin: [...customers, "", null] } });
    orphans.paymentsMissingInvoice = await db.collection("payments").countDocuments({ invoiceId: { $nin: [...invoices, "", null] } });
  }
  if (existing.has("attachments")) {
    orphans.attachmentsMissingFileUpload = await db.collection("attachments").countDocuments({ fileUploadId: { $nin: [...fileUploads, "", null] } });
  }

  const duplicateSkus = existing.has("products") ? await duplicateValues(db.collection("products"), "sku") : [];
  const duplicateInvoiceNumbers = existing.has("invoices") ? await duplicateValues(db.collection("invoices"), "invoiceNumber") : [];
  const duplicateIndexes = {};
  for (const name of [...existing]) {
    const indexes = await db.collection(name).indexes();
    const seen = new Map();
    for (const index of indexes) {
      const key = JSON.stringify(index.key);
      seen.set(key, [...(seen.get(key) || []), index.name]);
    }
    const duplicates = [...seen.values()].filter((names) => names.length > 1);
    if (duplicates.length) duplicateIndexes[name] = duplicates;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: {
      uri: maskUri(uri),
      dbName
    },
    collectionCounts: counts,
    missingCollections,
    demoCounts,
    softDeletedCounts,
    manualTestCounts,
    duplicateSkus,
    duplicateInvoiceNumbers,
    duplicateIndexes,
    orphans: Object.fromEntries(Object.entries(orphans).filter(([, value]) => value > 0))
  };

  const fileName = `dawngas-migration-manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  console.log(`Migration manifest written: ${filePath}`);
  console.log(JSON.stringify({
    dbName,
    totalCollections: Object.keys(counts).length,
    demoCollections: Object.keys(demoCounts).length,
    manualTestCollections: Object.keys(manualTestCounts).length,
    orphanGroups: Object.keys(manifest.orphans).length,
    duplicateSkus: duplicateSkus.length,
    duplicateInvoiceNumbers: duplicateInvoiceNumbers.length
  }, null, 2));
  await client.close();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
