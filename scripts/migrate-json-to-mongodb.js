const fs = require("fs");
const path = require("path");
require("dotenv").config({ quiet: true });
const { MongoClient } = require("mongodb");

const root = path.resolve(__dirname, "..");
const jsonFile = path.join(root, "data", "database.json");
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dawngas";
const dbName = process.env.MONGODB_DB_NAME || "dawngas";

const arrayCollections = {
  sessions: "sessions",
  passwordResetTokens: "passwordresettokens",
  customers: "customers",
  productCategories: "productcategories",
  products: "products",
  billOfMaterials: "billofmaterials",
  inventory: "inventoryitems",
  inventoryMovements: "inventorymovements",
  orderItems: "orderitems",
  orders: "orders",
  invoices: "invoices",
  invoiceItems: "invoiceitems",
  deliveries: "deliveries",
  payments: "payments",
  expenses: "expenses",
  suppliers: "suppliers",
  purchases: "purchases",
  purchaseItems: "purchaseitems",
  productionBatches: "productionbatches",
  productionMaterialUsages: "productionmaterialusages",
  notes: "notes",
  attachments: "attachments",
  fileUploads: "fileuploads",
  notifications: "notifications",
  activityLogs: "activitylogs",
  backups: "backuprecords",
  restoreLogs: "restorelogs",
  reminderLogs: "reminderlogs"
};

function deriveOrderItems(orders = []) {
  return orders.flatMap((order) =>
    (order.items || []).map((item, index) => ({
      id: `${order.id}_item_${index + 1}`,
      orderId: order.id,
      productId: item.productId,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      lineTotal: Number(item.quantity || 0) * Number(item.unitPrice || 0),
      productName: item.productName,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    }))
  );
}

function deriveInvoiceItems(invoices = []) {
  return invoices.flatMap((invoice) =>
    (invoice.items || []).map((item, index) => ({
      id: `${invoice.id}_item_${index + 1}`,
      invoiceId: invoice.id,
      productId: item.productId,
      itemName: item.itemName || item.productName || item.description,
      itemType: item.itemType || "",
      description: item.description || "",
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      lineTotal: Number(item.lineTotal || Number(item.quantity || 0) * Number(item.unitPrice || 0)),
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt
    }))
  );
}

function derivePurchaseItems(purchases = []) {
  return purchases.flatMap((purchase) =>
    (purchase.items || []).map((item, index) => ({
      id: `${purchase.id}_item_${index + 1}`,
      purchaseId: purchase.id,
      productId: item.productId,
      quantity: Number(item.quantity || 0),
      unitCost: Number(item.unitCost || 0),
      lineTotal: Number(item.lineTotal || Number(item.quantity || 0) * Number(item.unitCost || 0)),
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt
    }))
  );
}

async function upsertRows(db, collectionName, rows = []) {
  if (!rows.length) return 0;
  const collection = db.collection(collectionName);
  let count = 0;
  for (const row of rows) {
    if (!row || !row.id) continue;
    await collection.updateOne({ id: row.id }, { $setOnInsert: row }, { upsert: true });
    count += 1;
  }
  return count;
}

async function main() {
  if (!fs.existsSync(jsonFile)) {
    console.log(`No JSON database found at ${jsonFile}. Nothing to migrate.`);
    return;
  }

  const raw = fs.readFileSync(jsonFile, "utf8");
  const data = JSON.parse(raw || "{}");
  data.orderItems = data.orderItems && data.orderItems.length ? data.orderItems : deriveOrderItems(data.orders);
  data.invoiceItems = data.invoiceItems && data.invoiceItems.length ? data.invoiceItems : deriveInvoiceItems(data.invoices);
  data.purchaseItems = data.purchaseItems && data.purchaseItems.length ? data.purchaseItems : derivePurchaseItems(data.purchases);
  data.inventoryMovements = data.inventoryMovements || data.inventoryAdjustments || [];
  data.productCategories = data.productCategories || [];
  data.billOfMaterials = data.billOfMaterials || [];
  data.invoices = data.invoices || [];
  data.suppliers = data.suppliers || [];
  data.purchases = data.purchases || [];
  data.productionBatches = data.productionBatches || data.production || [];
  data.productionMaterialUsages = data.productionMaterialUsages || [];
  data.fileUploads = data.fileUploads || [];
  data.restoreLogs = data.restoreLogs || [];
  data.reminderLogs = data.reminderLogs || [];

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);

  const summary = {};
  const existingOwnerCount = await db.collection("owners").countDocuments();
  if (existingOwnerCount === 0 && Array.isArray(data.users) && data.users[0]) {
    await db.collection("owners").updateOne({ id: data.users[0].id }, { $setOnInsert: data.users[0] }, { upsert: true });
    summary.owners = 1;
  } else {
    summary.owners = 0;
  }

  for (const [key, collectionName] of Object.entries(arrayCollections)) {
    summary[collectionName] = await upsertRows(db, collectionName, data[key] || []);
  }

  if (data.businessSettings) {
    await db.collection("businesssettings").updateOne(
      { id: "business" },
      { $setOnInsert: { ...data.businessSettings, id: "business" } },
      { upsert: true }
    );
    summary.businesssettings = 1;
  }

  if (data.dashboardPreferences) {
    await db.collection("dashboardpreferences").updateOne(
      { id: "dashboard" },
      { $setOnInsert: { ...data.dashboardPreferences, id: "dashboard" } },
      { upsert: true }
    );
    summary.dashboardpreferences = 1;
  }

  const backupCopy = `${jsonFile}.pre-mongodb-${Date.now()}.bak`;
  fs.copyFileSync(jsonFile, backupCopy);

  await client.close();
  console.log(`Migration complete. Database: ${dbName}`);
  console.table(summary);
  console.log(`Safety copy created: ${backupCopy}`);
  console.log("The app no longer uses data/database.json at runtime.");
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
