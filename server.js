const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
require("dotenv").config({ quiet: true });
const { connectDB } = require("./server/config/db");

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";
const SESSION_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "dev-session-secret-change-me";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || "data");
const BACKUP_DIR = path.resolve(__dirname, process.env.BACKUP_STORAGE_PATH || path.join(DATA_DIR, "backups"));
const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_STORAGE_PATH || path.join(DATA_DIR, "uploads"));
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_JSON_BYTES = 16 * 1024 * 1024;
let mongoDb;

const ENTITY_COLLECTIONS = {
  customers: "customers",
  categories: "productCategories",
  productCategories: "productCategories",
  products: "products",
  inventory: "inventory",
  inventoryMovements: "inventoryMovements",
  orders: "orders",
  deliveries: "deliveries",
  payments: "payments",
  expenses: "expenses",
  notes: "notes",
  attachments: "attachments",
  notifications: "notifications",
  activityLogs: "activityLogs",
  suppliers: "suppliers",
  purchases: "purchases",
  production: "production",
  masterData: "masterData"
};

const MONGO_COLLECTIONS = {
  users: "owners",
  sessions: "sessions",
  passwordResetTokens: "passwordresettokens",
  customers: "customers",
  productCategories: "productcategories",
  products: "products",
  billOfMaterials: "billofmaterials",
  inventory: "inventoryitems",
  inventoryMovements: "inventorymovements",
  orders: "orders",
  orderItems: "orderitems",
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
  reminderLogs: "reminderlogs",
  masterData: "masterdata",
  shareLinks: "sharelinks"
};

const SINGLETON_COLLECTIONS = {
  businessSettings: "businesssettings",
  dashboardPreferences: "dashboardpreferences"
};

const ENTITY_TYPES = new Set([
  "customer",
  "category",
  "productCategory",
  "product",
  "inventory",
  "inventoryMovement",
  "order",
  "delivery",
  "payment",
  "expense",
  "supplier",
  "purchase",
  "invoice",
  "production",
  "productionBatch",
  "note",
  "attachment"
]);

const ITEM_TYPES = {
  FINISHED_PRODUCT: "FINISHED_PRODUCT",
  RAW_MATERIAL: "RAW_MATERIAL",
  SPARE_PART: "SPARE_PART",
  SERVICE: "SERVICE"
};

const ITEM_TYPE_BEHAVIOR = {
  FINISHED_PRODUCT: {
    canTrackInventory: true,
    canBeSold: true,
    canBePurchased: true,
    canBeProduced: true,
    canBeUsedInProduction: false,
    canHaveBillOfMaterials: true,
    appearsInInvoices: true,
    appearsInPurchases: true,
    affectsInventoryOnInvoice: true,
    affectsInventoryOnPurchase: true,
    requiresCostPrice: true,
    requiresSellingPrice: true,
    defaultUnitOfMeasure: "piece"
  },
  RAW_MATERIAL: {
    canTrackInventory: true,
    canBeSold: false,
    canBePurchased: true,
    canBeProduced: false,
    canBeUsedInProduction: true,
    canHaveBillOfMaterials: false,
    appearsInInvoices: false,
    appearsInPurchases: true,
    affectsInventoryOnInvoice: false,
    affectsInventoryOnPurchase: true,
    requiresCostPrice: true,
    requiresSellingPrice: false,
    defaultUnitOfMeasure: "piece"
  },
  SPARE_PART: {
    canTrackInventory: true,
    canBeSold: true,
    canBePurchased: true,
    canBeProduced: false,
    canBeUsedInProduction: true,
    canHaveBillOfMaterials: false,
    appearsInInvoices: true,
    appearsInPurchases: true,
    affectsInventoryOnInvoice: true,
    affectsInventoryOnPurchase: true,
    requiresCostPrice: true,
    requiresSellingPrice: true,
    defaultUnitOfMeasure: "piece"
  },
  SERVICE: {
    canTrackInventory: false,
    canBeSold: true,
    canBePurchased: false,
    canBeProduced: false,
    canBeUsedInProduction: false,
    canHaveBillOfMaterials: false,
    appearsInInvoices: true,
    appearsInPurchases: false,
    affectsInventoryOnInvoice: false,
    affectsInventoryOnPurchase: false,
    requiresCostPrice: false,
    requiresSellingPrice: true,
    defaultUnitOfMeasure: "service"
  }
};

const ITEM_TYPE_BEHAVIOR_FIELDS = Object.keys(ITEM_TYPE_BEHAVIOR.FINISHED_PRODUCT).filter((key) => key !== "defaultUnitOfMeasure");

const UNIT_OPTIONS = new Set(["piece", "set", "kg", "gram", "meter", "foot", "liter", "box", "sheet", "roll", "pack", "service", "other"]);

const DEFAULT_PRODUCT_CATEGORIES = [
  ["FINISHED_PRODUCT", "Hob"],
  ["FINISHED_PRODUCT", "Stove"],
  ["FINISHED_PRODUCT", "Gas Heater"],
  ["FINISHED_PRODUCT", "Geyser"],
  ["RAW_MATERIAL", "Metal"],
  ["RAW_MATERIAL", "Burner Parts"],
  ["RAW_MATERIAL", "Gas Components"],
  ["RAW_MATERIAL", "Electrical Components"],
  ["RAW_MATERIAL", "Glass"],
  ["RAW_MATERIAL", "Hardware"],
  ["RAW_MATERIAL", "Packaging"],
  ["RAW_MATERIAL", "Paint / Coating"],
  ["RAW_MATERIAL", "Other Raw Material"],
  ["SPARE_PART", "Regulator"],
  ["SPARE_PART", "Pipe"],
  ["SPARE_PART", "Valve"],
  ["SPARE_PART", "Burner"],
  ["SPARE_PART", "Knob"],
  ["SPARE_PART", "Fitting"],
  ["SPARE_PART", "Other Spare Part"],
  ["SERVICE", "Installation"],
  ["SERVICE", "Repair"],
  ["SERVICE", "Delivery"],
  ["SERVICE", "Maintenance"],
  ["SERVICE", "Other Service"]
];

const MASTER_DATA_DEFINITIONS = {
  itemTypes: [
    ["FINISHED_PRODUCT", "Finished Product", "Stock-tracked finished goods that can be sold and produced.", ITEM_TYPE_BEHAVIOR.FINISHED_PRODUCT],
    ["RAW_MATERIAL", "Raw Material", "Materials consumed during production.", ITEM_TYPE_BEHAVIOR.RAW_MATERIAL],
    ["SPARE_PART", "Spare Part / Accessory", "Accessories or replacement parts.", ITEM_TYPE_BEHAVIOR.SPARE_PART],
    ["SERVICE", "Service", "Non-stock billable services.", ITEM_TYPE_BEHAVIOR.SERVICE]
  ],
  unitsOfMeasure: [
    ["piece", "piece", "", { symbol: "pc", isDefault: true }],
    ["set", "set", "", { symbol: "set" }],
    ["kg", "kg", "", { symbol: "kg" }],
    ["gram", "gram", "", { symbol: "g" }],
    ["meter", "meter", "", { symbol: "m" }],
    ["foot", "foot", "", { symbol: "ft" }],
    ["liter", "liter", "", { symbol: "L" }],
    ["box", "box", "", { symbol: "box" }],
    ["sheet", "sheet", "", { symbol: "sheet" }],
    ["roll", "roll", "", { symbol: "roll" }],
    ["pack", "pack", "", { symbol: "pack" }],
    ["service", "service", "", { symbol: "service" }],
    ["other", "other", "", { symbol: "other" }]
  ],
  paymentMethods: [
    ["CASH", "Cash"],
    ["BANK_TRANSFER", "Bank Transfer"],
    ["CARD", "Card"],
    ["MOBILE_WALLET", "Mobile Wallet"],
    ["OTHER", "Other"]
  ],
  expenseCategories: [
    ["rent", "Rent"],
    ["utilities", "Utilities"],
    ["labor", "Labor"],
    ["transport", "Transport"],
    ["repair", "Repair"],
    ["marketing", "Marketing"],
    ["miscellaneous", "Miscellaneous"]
  ],
  storageLocations: [
    ["main_store", "Main Store", "Primary stock storage area.", { code: "MAIN", isDefault: true }],
    ["workshop", "Workshop", "Assembly and production area.", { code: "WORKSHOP" }],
    ["warehouse", "Warehouse", "Bulk stock storage area.", { code: "WH" }],
    ["display_area", "Display Area", "Showroom and display stock.", { code: "DISPLAY" }],
    ["repair_area", "Repair Area", "Repair and service parts area.", { code: "REPAIR" }]
  ],
  invoiceTermTemplates: [
    ["standard_due", "Standard payment terms", "Payment is due according to the agreed customer terms."],
    ["cash_on_delivery", "Cash on delivery", "Payment is due at the time of delivery."],
    ["seven_days", "7 days", "Payment is due within 7 days of invoice date."],
    ["fifteen_days", "15 days", "Payment is due within 15 days of invoice date."]
  ],
  purchaseStatuses: [
    ["DRAFT", "Draft"],
    ["RECEIVED", "Received"],
    ["CANCELLED", "Cancelled"]
  ],
  taxRates: [
    ["no_tax", "No tax", "0"]
  ]
};

function ensureDirectories() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function currency(value) {
  return Number(value || 0).toFixed(2);
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function makeNumber(prefix, count) {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function defaultDb() {
  return {
    appVersion: "0.1.0",
    users: [],
    sessions: [],
    passwordResetTokens: [],
    customers: [],
    productCategories: [],
    products: [],
    billOfMaterials: [],
    inventory: [],
    inventoryMovements: [],
    orderItems: [],
    orders: [],
    invoices: [],
    invoiceItems: [],
    deliveries: [],
    payments: [],
    expenses: [],
    suppliers: [],
    purchases: [],
    purchaseItems: [],
    productionBatches: [],
    productionMaterialUsages: [],
    notes: [],
    attachments: [],
    fileUploads: [],
    notifications: [],
    activityLogs: [],
    backups: [],
    restoreLogs: [],
    reminderLogs: [],
    masterData: [],
    shareLinks: [],
    businessSettings: {
      id: "business",
      businessName: "DawnGas",
      phone: "",
      email: "",
      address: "",
      businessPhone: "",
      businessEmail: "",
      businessAddress: "",
      taxNumber: "",
      currency: "PKR",
      invoicePrefix: "INV",
      purchasePrefix: "PUR",
      productionPrefix: "PRD",
      receiptPrefix: "RCT",
      orderPrefix: "ORD",
      deliveryPrefix: "DEL",
      reportHeaderTitle: "DawnGas Business Report",
      primaryColor: "#13756D",
      primaryHoverColor: "#0F5F58",
      secondaryColor: "#0F172A",
      accentColor: "#F59E0B",
      sidebarBackgroundColor: "#0F1A24",
      sidebarActiveColor: "#1F2D3A",
      buttonTextColor: "#FFFFFF",
      pageBackgroundColor: "#F7FAFC",
      cardBackgroundColor: "#FFFFFF",
      invoiceFooterNote: "Thank you for your business.",
      reportFooterNote: "Generated by DawnGas.",
      terms: "Payment is due according to the agreed customer terms.",
      invoiceTerms: "Payment is due according to the agreed customer terms.",
      paymentInstructions: "Please pay the outstanding balance using the agreed payment method.",
      lowStockThreshold: 5,
      whatsappSharingEnabled: true,
      sidebarBrandMode: "logo_only",
      logoAttachmentId: "",
      logoFileId: "",
      logoUrl: "",
      signatureAttachmentId: ""
    },
    dashboardPreferences: {
      id: "dashboard",
      defaultRange: "month",
      defaultDateRange: "this_month",
      compactView: false,
      compactMode: false,
      visibleCards: [
        "ordersToday",
        "paymentsToday",
        "pendingDeliveries",
        "outstandingBalance",
        "lowStock",
        "expensesMonth",
        "estimatedProfit",
        "monthlySnapshot",
        "recentActivity",
        "balanceReminders"
      ]
    }
  };
}

function normalizeDb(db) {
  const fresh = defaultDb();
  for (const [key, value] of Object.entries(fresh)) {
    if (Array.isArray(value) && !Array.isArray(db[key])) db[key] = [];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      db[key] = { ...value, ...(db[key] || {}) };
    }
    if (db[key] === undefined) db[key] = value;
  }
  const legacyMovements = db["inventory" + "Adjustments"];
  if (!Array.isArray(db.inventoryMovements) && Array.isArray(legacyMovements)) db.inventoryMovements = legacyMovements;
  ensureDefaultCategories(db);
  ensureDefaultMasterData(db);
  for (const product of db.products || []) {
    product.itemType = normalizeItemType(product.itemType);
    product.itemTypeId = product.itemTypeId || product.itemType;
    product.itemTypeSnapshotName = product.itemTypeSnapshotName || itemTypeLabel(db, product.itemType);
    product.categorySnapshotName = product.categorySnapshotName || categoryName(db, product.categoryId);
  }
  return db;
}

function slug(value) {
  return cleanString(value)
    .toLowerCase()
    .replaceAll("/", " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ensureDefaultCategories(db) {
  if (!Array.isArray(db.productCategories)) db.productCategories = [];
  for (const [type, name] of DEFAULT_PRODUCT_CATEGORIES) {
    const existing = db.productCategories.find(
      (category) => normalizeItemType(category.type) === type && cleanString(category.name).toLowerCase() === name.toLowerCase()
    );
    if (!existing) {
      db.productCategories.push({
        id: `cat_${slug(type)}_${slug(name)}`,
        name,
        type,
        itemTypeId: type,
        description: "",
        status: "ACTIVE",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        archivedAt: null,
        deletedAt: null
      });
    } else {
      existing.type = normalizeItemType(existing.type);
      existing.itemTypeId = existing.itemTypeId || existing.type;
      existing.status = cleanString(existing.status || "ACTIVE").toUpperCase();
    }
  }
}

function normalizeMasterDataType(value) {
  const key = cleanString(value);
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliases = {
    itemtype: "itemTypes",
    itemtypes: "itemTypes",
    unit: "unitsOfMeasure",
    units: "unitsOfMeasure",
    unitofmeasure: "unitsOfMeasure",
    unitsofmeasure: "unitsOfMeasure",
    paymentmethod: "paymentMethods",
    paymentmethods: "paymentMethods",
    expensecategory: "expenseCategories",
    expensecategories: "expenseCategories",
    storagelocation: "storageLocations",
    storagelocations: "storageLocations",
    invoicetermtemplate: "invoiceTermTemplates",
    invoicetermtemplates: "invoiceTermTemplates",
    purchasestatus: "purchaseStatuses",
    purchasestatuses: "purchaseStatuses",
    taxrate: "taxRates",
    taxrates: "taxRates"
  };
  return aliases[normalized] || (MASTER_DATA_DEFINITIONS[key] ? key : "");
}

function masterDataValue(type, label) {
  const raw = cleanString(label);
  if (!raw) return "";
  if (type === "itemTypes") return normalizeItemType(raw);
  if (["paymentMethods", "purchaseStatuses"].includes(type)) return raw.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug(raw);
}

function makeMasterDataRecord(type, value, label, description = "", index = 0, extra = {}) {
  return {
    id: `md_${slug(type)}_${slug(value)}`,
    type,
    value: cleanString(value),
    label: cleanString(label || value),
    description: cleanString(description),
    ...extra,
    isSystemDefault: true,
    status: "ACTIVE",
    sortOrder: index + 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null,
    deletedAt: null
  };
}

function ensureDefaultMasterData(db) {
  if (!Array.isArray(db.masterData)) db.masterData = [];
  for (const [type, rows] of Object.entries(MASTER_DATA_DEFINITIONS)) {
    rows.forEach((row, index) => {
      const [value, label, description, extra = {}] = row;
      const existing = db.masterData.find((item) => item.type === type && cleanString(item.value).toLowerCase() === cleanString(value).toLowerCase());
      if (!existing) {
        db.masterData.push(makeMasterDataRecord(type, value, label, description, index, extra));
      } else {
        existing.type = type;
        existing.value = cleanString(existing.value || value);
        existing.label = cleanString(existing.label || label || value);
        existing.description = cleanString(existing.description ?? description ?? "");
        for (const [extraKey, extraValue] of Object.entries(extra)) {
          if (extraKey === "isDefault" && existing.isDefault !== undefined) continue;
          if (existing[extraKey] === undefined || existing.isSystemDefault) existing[extraKey] = extraValue;
        }
        existing.isSystemDefault = existing.isSystemDefault !== false;
        existing.status = normalizeRecordStatus(existing.status || "ACTIVE");
        existing.sortOrder = cleanNumber(existing.sortOrder || index + 1);
      }
    });
  }
}

function cleanMongoDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

async function ensureMongoIndexes() {
  const existing = new Set((await mongoDb.listCollections().toArray()).map((collection) => collection.name));
  const required = new Set([...Object.values(MONGO_COLLECTIONS), ...Object.values(SINGLETON_COLLECTIONS)]);
  for (const collectionName of required) {
    if (!existing.has(collectionName)) {
      await mongoDb.createCollection(collectionName);
    }
  }
  await mongoDb.collection("owners").createIndex({ email: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("customers").createIndex({ phone: 1 });
  await mongoDb.collection("productcategories").createIndex({ type: 1, name: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("products").createIndex({ sku: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("products").createIndex({ name: 1 });
  await mongoDb.collection("products").createIndex({ itemType: 1, categoryId: 1, status: 1 });
  await mongoDb.collection("inventoryitems").createIndex({ productId: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("inventorymovements").createIndex({ productId: 1, createdAt: -1 });
  await mongoDb.collection("orders").createIndex({ orderNumber: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("invoices").createIndex({ invoiceNumber: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("purchases").createIndex({ purchaseNumber: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("productionbatches").createIndex({ batchNumber: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("deliveries").createIndex({ deliveryNumber: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("payments").createIndex({ receiptNumber: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("masterdata").createIndex({ type: 1, value: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("masterdata").createIndex({ type: 1, status: 1, sortOrder: 1 });
  await mongoDb.collection("sharelinks").createIndex({ tokenHash: 1 }, { unique: true, sparse: true });
  await mongoDb.collection("sharelinks").createIndex({ entityType: 1, entityId: 1, expiresAt: 1 });
  await mongoDb.collection("businesssettings").createIndex({ id: 1 }, { unique: true });
  await mongoDb.collection("dashboardpreferences").createIndex({ id: 1 }, { unique: true });
}

async function seedDefaultCategories() {
  for (const [type, name] of DEFAULT_PRODUCT_CATEGORIES) {
    await mongoDb.collection("productcategories").updateOne(
      { type, name },
      {
        $setOnInsert: {
          id: `cat_${slug(type)}_${slug(name)}`,
          name,
          type,
          itemTypeId: type,
          description: "",
          status: "ACTIVE",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          archivedAt: null,
          deletedAt: null
        }
      },
      { upsert: true }
    );
  }
}

async function seedDefaultMasterData() {
  for (const [type, rows] of Object.entries(MASTER_DATA_DEFINITIONS)) {
    for (let index = 0; index < rows.length; index += 1) {
      const [value, label, description, extra = {}] = rows[index];
      const defaultRecord = makeMasterDataRecord(type, value, label, description, index, extra);
      const existing = await mongoDb.collection("masterdata").findOne({ type, value });
      if (existing) {
        const updateExtra = { ...extra };
        if (existing.isDefault !== undefined) delete updateExtra.isDefault;
        await mongoDb.collection("masterdata").updateOne(
          { type, value },
          { $set: { ...updateExtra, isSystemDefault: true, sortOrder: index + 1, updatedAt: nowIso() } }
        );
      } else {
        await mongoDb.collection("masterdata").insertOne(defaultRecord);
      }
    }
  }
}

async function migrateLegacyInventoryMovements() {
  const collections = new Set((await mongoDb.listCollections().toArray()).map((collection) => collection.name));
  if (!collections.has("inventoryadjustments")) return;
  const legacyRows = await mongoDb.collection("inventoryadjustments").find({}).toArray();
  if (!legacyRows.length) return;
  const movements = mongoDb.collection("inventorymovements");
  for (const row of legacyRows) {
    const record = cleanMongoDoc(row);
    if (!record || !record.id) continue;
    const previous = record.previousStock || {};
    const next = record.newStock || {};
    await movements.updateOne(
      { id: record.id },
      {
        $setOnInsert: {
          id: record.id,
          productId: record.productId,
          inventoryItemId: record.inventoryItemId || record.inventoryId,
          movementType: cleanString(record.movementType || record.adjustmentType || "MANUAL_CORRECTION").toUpperCase(),
          quantity: cleanNumber(record.quantity || record.availableChange || record.totalChange),
          previousStock: cleanNumber(previous.currentStock ?? previous.availableStock ?? previous.availableQuantity ?? previous.available),
          newStock: cleanNumber(next.currentStock ?? next.availableStock ?? next.availableQuantity ?? next.available),
          referenceType: cleanString(record.referenceType),
          referenceId: cleanString(record.referenceId),
          reason: cleanString(record.reason),
          notes: cleanString(record.notes),
          createdAt: record.createdAt || nowIso(),
          updatedAt: record.updatedAt || record.createdAt || nowIso()
        }
      },
      { upsert: true }
    );
  }
}

function deriveOrderItems(orders) {
  return orders.flatMap((order) =>
    (order.items || []).map((item, index) => ({
      id: `${order.id}_item_${index + 1}`,
      orderId: order.id,
      productId: item.productId,
      quantity: cleanNumber(item.quantity),
      unitPrice: cleanNumber(item.unitPrice),
      lineTotal: cleanNumber(item.quantity) * cleanNumber(item.unitPrice),
      productName: item.productName,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    }))
  );
}

function deriveInvoiceItems(invoices) {
  return invoices.flatMap((invoice) =>
    (invoice.items || []).map((item, index) => ({
      id: `${invoice.id}_item_${index + 1}`,
      invoiceId: invoice.id,
      productId: item.productId,
      description: item.description || item.productName,
      quantity: cleanNumber(item.quantity),
      unitPrice: cleanNumber(item.unitPrice),
      lineTotal: cleanNumber(item.lineTotal || cleanNumber(item.quantity) * cleanNumber(item.unitPrice)),
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt
    }))
  );
}

function derivePurchaseItems(purchases) {
  return purchases.flatMap((purchase) =>
    (purchase.items || []).map((item, index) => ({
      id: `${purchase.id}_item_${index + 1}`,
      purchaseId: purchase.id,
      productId: item.productId,
      quantity: cleanNumber(item.quantity),
      unitCost: cleanNumber(item.unitCost),
      lineTotal: cleanNumber(item.lineTotal || cleanNumber(item.quantity) * cleanNumber(item.unitCost)),
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt
    }))
  );
}

async function loadDb() {
  ensureDirectories();
  const db = defaultDb();
  for (const [key, collectionName] of Object.entries(MONGO_COLLECTIONS)) {
    db[key] = (await mongoDb.collection(collectionName).find({}).toArray()).map(cleanMongoDoc);
  }
  const settings = cleanMongoDoc(await mongoDb.collection(SINGLETON_COLLECTIONS.businessSettings).findOne({ id: "business" }));
  const preferences = cleanMongoDoc(await mongoDb.collection(SINGLETON_COLLECTIONS.dashboardPreferences).findOne({ id: "dashboard" }));
  if (settings) db.businessSettings = settings;
  if (preferences) db.dashboardPreferences = preferences;
  return normalizeDb(db);
}

async function syncCollection(collectionName, records) {
  const collection = mongoDb.collection(collectionName);
  const rows = (records || []).map((record) => ({ ...record }));
  if (rows.length) {
    await collection.bulkWrite(
      rows.map((record) => ({
        replaceOne: {
          filter: { id: record.id },
          replacement: record,
          upsert: true
        }
      })),
      { ordered: false }
    );
  }
  const ids = rows.map((record) => record.id).filter(Boolean);
  if (ids.length) {
    await collection.deleteMany({ id: { $nin: ids } });
  } else {
    await collection.deleteMany({});
  }
}

async function saveDb(db) {
  ensureDirectories();
  const normalized = normalizeDb(db);
  normalized.orderItems = deriveOrderItems(normalized.orders);
  normalized.invoiceItems = deriveInvoiceItems(normalized.invoices);
  normalized.purchaseItems = derivePurchaseItems(normalized.purchases);

  await Promise.all([
    ...Object.entries(MONGO_COLLECTIONS).map(([key, collectionName]) => syncCollection(collectionName, normalized[key] || [])),
    mongoDb
      .collection(SINGLETON_COLLECTIONS.businessSettings)
      .replaceOne({ id: "business" }, { ...normalized.businessSettings, id: "business" }, { upsert: true }),
    mongoDb
      .collection(SINGLETON_COLLECTIONS.dashboardPreferences)
      .replaceOne({ id: "dashboard" }, { ...normalized.dashboardPreferences, id: "dashboard" }, { upsert: true })
  ]);
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function signValue(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(String(value)).digest("hex");
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey.toString("hex"));
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt);
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const candidate = await scrypt(password, salt);
  return timingSafeEqual(candidate, hash);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function makeCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (NODE_ENV === "production") parts.push("Secure");
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

function clearCookie(name) {
  return makeCookie(name, "", { maxAge: 0 });
}

function responseHeaders(extra = {}) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
    ...extra
  };
  if (CORS_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = CORS_ORIGIN;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  }
  return headers;
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, responseHeaders({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders }));
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, message, details) {
  const payload = { success: false, message };
  if (details && NODE_ENV !== "production") payload.details = details;
  sendJson(res, statusCode, payload);
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(statusCode, responseHeaders({ "Content-Type": contentType, ...headers }));
  res.end(text);
}

function sendFile(res, filePath, contentType, headers = {}) {
  if (!fs.existsSync(filePath)) return sendError(res, 404, "File not found.");
  res.writeHead(200, responseHeaders({ "Content-Type": contentType, ...headers }));
  fs.createReadStream(filePath).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_JSON_BYTES) {
        reject(Object.assign(new Error("Request body is too large."), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      const parsed = safeJsonParse(body);
      if (parsed === null) reject(Object.assign(new Error("Invalid JSON body."), { statusCode: 400 }));
      else resolve(parsed);
    });
    req.on("error", reject);
  });
}

function getClientIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").toString().split(",")[0].trim();
}

const rateBuckets = new Map();
function rateLimit(req, key, maxAttempts, windowMs) {
  const bucketKey = `${getClientIp(req)}:${key}`;
  const now = Date.now();
  const bucket = rateBuckets.get(bucketKey) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt < now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(bucketKey, bucket);
  return bucket.count <= maxAttempts;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function getSession(req, db) {
  const cookies = parseCookies(req);
  const cookie = cookies.dawngas_session;
  if (!cookie || !cookie.includes(".")) return null;
  const [token, signature] = cookie.split(".");
  if (!timingSafeEqual(signValue(token), signature)) return null;
  const tokenHash = hashValue(token);
  const session = db.sessions.find((item) => item.tokenHash === tokenHash && !item.revokedAt);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const user = db.users.find((item) => item.id === session.userId && item.status === "active");
  if (!user) return null;
  return { session, user };
}

function createSession(res, db, user) {
  const token = crypto.randomBytes(32).toString("hex");
  const session = {
    id: id("session"),
    userId: user.id,
    tokenHash: hashValue(token),
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    revokedAt: null
  };
  db.sessions.push(session);
  res.setHeader("Set-Cookie", makeCookie("dawngas_session", `${token}.${signValue(token)}`, { maxAge: 60 * 60 * 24 * 30 }));
  return session;
}

function revokeCurrentSession(req, res, db) {
  const current = getSession(req, db);
  if (current) current.session.revokedAt = nowIso();
  res.setHeader("Set-Cookie", clearCookie("dawngas_session"));
}

function requireFields(input, fields) {
  const errors = {};
  for (const field of fields) {
    if (input[field] === undefined || input[field] === null || String(input[field]).trim() === "") {
      errors[field] = "Required";
    }
  }
  return errors;
}

function cleanString(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanDate(value) {
  return value ? String(value).slice(0, 10) : todayDate();
}

function isActive(record) {
  return record && !record.archivedAt && !record.deletedAt && cleanString(record.status).toUpperCase() !== "ARCHIVED";
}

function dateInRange(value, from, to) {
  const date = String(value || "").slice(0, 10);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function addActivity(db, action, entityType, entityId, description, metadata = {}) {
  db.activityLogs.unshift({
    id: id("log"),
    action,
    entityType,
    entityId,
    description,
    metadata,
    createdAt: nowIso()
  });
}

function addNotification(db, type, title, message, entityType = "", entityId = "", metadata = {}) {
  const existing = metadata.dedupeKey
    ? db.notifications.find((item) => item.metadata && item.metadata.dedupeKey === metadata.dedupeKey && !item.deletedAt)
    : null;
  if (existing) return existing;
  const notification = {
    id: id("noti"),
    type,
    title,
    message,
    entityType,
    entityId,
    metadata,
    readAt: null,
    deletedAt: null,
    createdAt: nowIso()
  };
  db.notifications.unshift(notification);
  return notification;
}

function getBranding(db) {
  const defaults = defaultDb().businessSettings;
  const settings = { ...defaults, ...(db.businessSettings || {}) };
  settings.phone = settings.businessPhone || settings.phone || "";
  settings.email = settings.businessEmail || settings.email || "";
  settings.address = settings.businessAddress || settings.address || "";
  settings.terms = settings.invoiceTerms || settings.terms || "";
  return settings;
}

function isHexColor(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || "").trim());
}

function cleanColor(value, fallback) {
  const candidate = cleanString(value);
  return isHexColor(candidate) ? candidate.toUpperCase() : fallback;
}

function applyBrandingPayload(current, body) {
  const defaults = defaultDb().businessSettings;
  const next = { ...defaults, ...current };
  const colorFields = [
    "primaryColor",
    "primaryHoverColor",
    "secondaryColor",
    "accentColor",
    "sidebarBackgroundColor",
    "sidebarActiveColor",
    "buttonTextColor",
    "pageBackgroundColor",
    "cardBackgroundColor"
  ];
  for (const field of colorFields) {
    next[field] = cleanColor(body[field] ?? next[field], defaults[field]);
  }
  next.businessName = cleanString(body.businessName ?? next.businessName) || "DawnGas";
  next.phone = cleanString(body.phone ?? body.businessPhone ?? next.phone);
  next.email = cleanString(body.email ?? body.businessEmail ?? next.email);
  next.address = cleanString(body.address ?? body.businessAddress ?? next.address);
  next.businessPhone = next.phone;
  next.businessEmail = next.email;
  next.businessAddress = next.address;
  next.taxNumber = cleanString(body.taxNumber ?? next.taxNumber);
  next.currency = cleanString(body.currency ?? next.currency) || "PKR";
  next.invoicePrefix = cleanString(body.invoicePrefix ?? next.invoicePrefix) || "INV";
  next.receiptPrefix = cleanString(body.receiptPrefix ?? next.receiptPrefix) || "RCT";
  next.purchasePrefix = cleanString(body.purchasePrefix ?? next.purchasePrefix) || "PUR";
  next.productionPrefix = cleanString(body.productionPrefix ?? next.productionPrefix) || "PRD";
  next.orderPrefix = cleanString(body.orderPrefix ?? next.orderPrefix) || "ORD";
  next.deliveryPrefix = cleanString(body.deliveryPrefix ?? next.deliveryPrefix) || "DEL";
  next.lowStockThreshold = Math.max(0, cleanNumber(body.lowStockThreshold ?? next.lowStockThreshold ?? 5));
  next.whatsappSharingEnabled = boolValue(body.whatsappSharingEnabled, next.whatsappSharingEnabled !== false);
  next.sidebarBrandMode = ["logo_only", "logo_name"].includes(cleanString(body.sidebarBrandMode ?? next.sidebarBrandMode)) ? cleanString(body.sidebarBrandMode ?? next.sidebarBrandMode) : "logo_only";
  next.reportHeaderTitle = cleanString(body.reportHeaderTitle ?? next.reportHeaderTitle);
  next.invoiceFooterNote = cleanString(body.invoiceFooterNote ?? next.invoiceFooterNote);
  next.reportFooterNote = cleanString(body.reportFooterNote ?? next.reportFooterNote);
  next.terms = cleanString(body.terms ?? body.invoiceTerms ?? next.terms);
  next.invoiceTerms = next.terms;
  next.paymentInstructions = cleanString(body.paymentInstructions ?? next.paymentInstructions);
  next.logoFileId = cleanString(body.logoFileId ?? next.logoFileId);
  next.logoUrl = cleanString(body.logoUrl ?? next.logoUrl);
  next.logoAttachmentId = next.logoFileId || next.logoAttachmentId || "";
  next.signatureAttachmentId = cleanString(body.signatureAttachmentId ?? next.signatureAttachmentId);
  next.id = "business";
  next.updatedAt = nowIso();
  return next;
}

function validateColorPayload(body) {
  const errors = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (key.toLowerCase().includes("color") && value && !isHexColor(value)) {
      errors[key] = "Use a valid hex color such as #13756D.";
    }
  }
  return errors;
}

function logoMarkup(settings, maxHeight = 80) {
  if (!settings.logoUrl) {
    return `<h1>${escapeHtml(settings.businessName || "DawnGas")}</h1>`;
  }
  return `<img src="${escapeHtml(settings.logoUrl)}" alt="${escapeHtml(settings.businessName || "DawnGas")}" style="max-height:${maxHeight}px;max-width:240px;object-fit:contain">`;
}

function findCustomer(db, customerId) {
  return db.customers.find((item) => item.id === customerId);
}

function findProduct(db, productId) {
  return db.products.find((item) => item.id === productId);
}

function normalizeItemType(value) {
  const raw = cleanString(value).toUpperCase().replaceAll(" ", "_").replaceAll("/", "_").replaceAll("-", "_");
  if (["FINISHED_PRODUCT", "FINISHED"].includes(raw)) return ITEM_TYPES.FINISHED_PRODUCT;
  if (["RAW_MATERIAL", "RAW"].includes(raw)) return ITEM_TYPES.RAW_MATERIAL;
  if (["SPARE_PART", "SPARE_PART_ACCESSORY", "SPARE_ACCESSORY", "ACCESSORY", "SPARE"].includes(raw)) return ITEM_TYPES.SPARE_PART;
  if (raw === "SERVICE") return ITEM_TYPES.SERVICE;
  return raw || ITEM_TYPES.FINISHED_PRODUCT;
}

function displayItemType(value) {
  return {
    FINISHED_PRODUCT: "Finished Product",
    RAW_MATERIAL: "Raw Material",
    SPARE_PART: "Spare Part / Accessory",
    SERVICE: "Service"
  }[normalizeItemType(value)] || cleanString(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Finished Product";
}

function itemTypeRecord(db, value) {
  ensureDefaultMasterData(db);
  const normalized = normalizeItemType(value);
  return (db.masterData || []).find((item) => item.type === "itemTypes" && normalizeItemType(item.value) === normalized) || null;
}

function itemTypeLabel(db, value) {
  const record = itemTypeRecord(db, value);
  return record ? record.label : displayItemType(value);
}

function itemTypeBehavior(db, value) {
  const normalized = normalizeItemType(value);
  const record = itemTypeRecord(db, normalized);
  const defaults = ITEM_TYPE_BEHAVIOR[normalized] || {
    canTrackInventory: true,
    canBeSold: true,
    canBePurchased: true,
    canBeProduced: false,
    canBeUsedInProduction: false,
    canHaveBillOfMaterials: false,
    appearsInInvoices: true,
    appearsInPurchases: true,
    affectsInventoryOnInvoice: true,
    affectsInventoryOnPurchase: true,
    requiresCostPrice: false,
    requiresSellingPrice: false,
    defaultUnitOfMeasure: "piece"
  };
  const behavior = { ...defaults };
  if (record) {
    for (const field of ITEM_TYPE_BEHAVIOR_FIELDS) behavior[field] = boolValue(record[field], behavior[field]);
    behavior.defaultUnitOfMeasure = cleanString(record.defaultUnitOfMeasure || behavior.defaultUnitOfMeasure || "piece");
  }
  return behavior;
}

function normalizeRecordStatus(value) {
  const status = cleanString(value || "ACTIVE").toUpperCase();
  if (["ARCHIVED", "CANCELLED", "DELETED"].includes(status)) return status;
  return "ACTIVE";
}

function normalizeUnit(value) {
  const unit = cleanString(value || "piece").toLowerCase();
  if (!unit) return "piece";
  if (/^[a-z0-9][a-z0-9 _./-]{0,30}$/.test(unit)) return unit;
  return UNIT_OPTIONS.has(unit) ? unit : "other";
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function businessError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function findCategory(db, categoryId) {
  return db.productCategories.find((item) => item.id === categoryId);
}

function categoryName(db, categoryId) {
  return (findCategory(db, categoryId) || {}).name || "";
}

function findMasterDataRecord(db, type, value) {
  const resolvedType = normalizeMasterDataType(type);
  const needle = cleanString(value);
  if (!resolvedType || !needle) return null;
  ensureDefaultMasterData(db);
  const lowered = needle.toLowerCase();
  return (db.masterData || []).find((item) => {
    if (item.type !== resolvedType) return false;
    return [item.id, item.value, item.label, item.code].some((candidate) => cleanString(candidate).toLowerCase() === lowered);
  }) || null;
}

function normalizeStorageLocationRef(db, value, existing = {}) {
  const raw = cleanString(value);
  const fallback = raw || cleanString(existing.storageLocationId || existing.storageLocation || existing.storageLocationSnapshotName);
  const record = findMasterDataRecord(db, "storageLocations", fallback);
  if (record) {
    return {
      id: record.id,
      value: record.value,
      label: record.label || record.value
    };
  }
  return {
    id: "",
    value: fallback,
    label: fallback
  };
}

function applyInventoryLocation(item, db, value, existing = item) {
  const location = normalizeStorageLocationRef(db, value, existing);
  item.storageLocationId = location.id;
  item.storageLocation = location.value;
  item.storageLocationSnapshotName = location.label;
  return item;
}

function storageLocationLabel(db, item = {}) {
  const record = findMasterDataRecord(db, "storageLocations", item.storageLocationId || item.storageLocation || item.storageLocationSnapshotName);
  return (record && (record.label || record.value)) || cleanString(item.storageLocationSnapshotName || item.storageLocation);
}

function inventoryMatchesStorageLocation(db, item, value) {
  const queryValue = cleanString(value);
  if (!queryValue) return true;
  const selected = normalizeStorageLocationRef(db, queryValue);
  const needles = [queryValue, selected.id, selected.value, selected.label]
    .map((entry) => cleanString(entry).toLowerCase())
    .filter(Boolean);
  const haystack = [item.storageLocationId, item.storageLocation, item.storageLocationSnapshotName, storageLocationLabel(db, item)]
    .map((entry) => cleanString(entry).toLowerCase())
    .filter(Boolean);
  return needles.some((needle) => haystack.includes(needle));
}

function isTrackableProduct(product) {
  return product && normalizeItemType(product.itemType) !== ITEM_TYPES.SERVICE && product.trackInventory !== false;
}

function findInventoryItem(db, productId) {
  const item = db.inventory.find((entry) => entry.productId === productId && isActive(entry));
  return item ? syncInventoryAliases(item) : null;
}

function syncInventoryAliases(item) {
  const legacyTotal = cleanNumber(item.totalQuantity ?? item.total);
  const legacyAvailable = cleanNumber(item.availableQuantity ?? item.available);
  item.currentStock = Math.max(0, cleanNumber(item.currentStock ?? legacyTotal ?? legacyAvailable));
  item.reservedStock = Math.max(0, cleanNumber(item.reservedStock));
  item.availableStock = Math.max(0, item.currentStock - item.reservedStock);
  item.lowStockThreshold = cleanNumber(item.lowStockThreshold);
  item.reorderQuantity = cleanNumber(item.reorderQuantity ?? item.suggestedRestockQuantity);
  item.storageLocationId = cleanString(item.storageLocationId);
  item.storageLocation = cleanString(item.storageLocation);
  item.storageLocationSnapshotName = cleanString(item.storageLocationSnapshotName || item.storageLocation);
  item.status = stockStatus(item);

  // Compatibility fields for older records and exports while the UI uses general inventory language.
  item.totalQuantity = item.currentStock;
  item.availableQuantity = item.availableStock;
  item.total = item.currentStock;
  item.available = item.availableStock;
  return item;
}

function inventorySnapshot(item) {
  const synced = syncInventoryAliases({ ...item });
  return {
    currentStock: synced.currentStock,
    reservedStock: synced.reservedStock,
    availableStock: synced.availableStock,
    status: synced.status
  };
}

function stockStatus(item) {
  const currentStock = Math.max(0, cleanNumber(item.currentStock ?? item.totalQuantity ?? item.total ?? item.availableStock ?? item.available));
  const reservedStock = Math.max(0, cleanNumber(item.reservedStock));
  const availableStock = Math.max(0, currentStock - reservedStock);
  if (currentStock <= 0 || availableStock <= 0) return "OUT_OF_STOCK";
  if (cleanNumber(item.lowStockThreshold) > 0 && availableStock <= cleanNumber(item.lowStockThreshold)) return "LOW_STOCK";
  return "IN_STOCK";
}

function activeOrders(db) {
  return db.orders.filter((order) => isActive(order) && order.status !== "cancelled");
}

function activeInvoices(db) {
  return db.invoices.filter((invoice) => isActive(invoice) && invoice.status !== "CANCELLED");
}

function activePayments(db) {
  return db.payments.filter((payment) => isActive(payment) && payment.status !== "VOIDED" && payment.status !== "REFUNDED");
}

function activeExpenses(db) {
  return db.expenses.filter(isActive);
}

function orderTotal(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = items.reduce((sum, item) => sum + cleanNumber(item.quantity) * cleanNumber(item.unitPrice), 0);
  const discount = cleanNumber(order.discount);
  const tax = cleanNumber(order.tax);
  return Math.max(0, subtotal - discount + tax);
}

function invoiceTotal(invoice) {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const subtotal = items.reduce((sum, item) => sum + cleanNumber(item.quantity) * cleanNumber(item.unitPrice), 0);
  const discount = cleanNumber(invoice.discount);
  const tax = cleanNumber(invoice.tax);
  return Math.max(0, subtotal - discount + tax);
}

function formatMoney(db, value) {
  const code = getBranding(db).currency || "PKR";
  return `${code} ${Number(value || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQuantity(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function customerBalance(db, customerId) {
  const customer = findCustomer(db, customerId);
  const opening = cleanNumber(customer && customer.openingBalance);
  const invoiceValue = activeInvoices(db)
    .filter((invoice) => invoice.customerId === customerId)
    .reduce((sum, invoice) => sum + cleanNumber(invoice.totalAmount || invoiceTotal(invoice)), 0);
  const orderValue = activeOrders(db)
    .filter((order) => order.customerId === customerId && !db.invoices.some((invoice) => invoice.orderId === order.id && isActive(invoice)))
    .reduce((sum, order) => sum + orderTotal(order), 0);
  const paid = activePayments(db)
    .filter((payment) => payment.customerId === customerId)
    .reduce((sum, payment) => sum + cleanNumber(payment.amount), 0);
  return opening + invoiceValue + orderValue - paid;
}

function enrichCustomer(db, customer) {
  const orders = activeOrders(db).filter((order) => order.customerId === customer.id);
  const invoices = activeInvoices(db).filter((invoice) => invoice.customerId === customer.id);
  const payments = activePayments(db).filter((payment) => payment.customerId === customer.id);
  const lastOrder = orders.slice().sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)))[0];
  const lastInvoice = invoices.slice().sort((a, b) => String(b.invoiceDate).localeCompare(String(a.invoiceDate)))[0];
  const lastPayment = payments.slice().sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)))[0];
  return {
    ...customer,
    balance: customerBalance(db, customer.id),
    currentBalance: customerBalance(db, customer.id),
    totalOrders: orders.length,
    totalInvoices: invoices.length,
    lastOrderDate: lastOrder ? lastOrder.orderDate : "",
    lastInvoiceAt: lastInvoice ? lastInvoice.invoiceDate : customer.lastInvoiceAt || "",
    lastPaymentDate: lastPayment ? lastPayment.paymentDate : ""
  };
}

function inventoryValue(db) {
  return db.inventory.filter(isActive).reduce((sum, item) => {
    const synced = syncInventoryAliases(item);
    const product = findProduct(db, item.productId);
    return sum + cleanNumber(synced.availableStock) * cleanNumber(product && (product.costPrice ?? product.unitPrice));
  }, 0);
}

function checkLowStock(db, inventoryItem) {
  syncInventoryAliases(inventoryItem);
  const product = findProduct(db, inventoryItem.productId);
  const threshold = cleanNumber(inventoryItem.lowStockThreshold);
  if (threshold > 0 && cleanNumber(inventoryItem.availableStock) <= threshold) {
    addNotification(
      db,
      "low_stock",
      "Low inventory alert",
      `${product ? product.name : "Item"} has ${inventoryItem.availableStock} ${product ? product.unitOfMeasure || "units" : "units"} available.`,
      "inventory",
      inventoryItem.id,
      { dedupeKey: `low_stock_${inventoryItem.id}_${inventoryItem.availableStock}` }
    );
  }
}

function ensureInventoryForProduct(db, product, defaults = {}) {
  if (!isTrackableProduct(product)) return null;
  let item = db.inventory.find((entry) => entry.productId === product.id && isActive(entry));
  if (!item) {
    const location = normalizeStorageLocationRef(db, defaults.storageLocation ?? defaults.storageLocationId ?? defaults.storageLocationSnapshotName);
    item = {
      id: id("inv"),
      productId: product.id,
      currentStock: cleanNumber(defaults.currentStock),
      reservedStock: 0,
      availableStock: cleanNumber(defaults.currentStock),
      lowStockThreshold: cleanNumber(defaults.lowStockThreshold ?? db.businessSettings.lowStockThreshold ?? 5),
      reorderQuantity: cleanNumber(defaults.reorderQuantity),
      storageLocationId: location.id,
      storageLocation: location.value,
      storageLocationSnapshotName: location.label,
      lastMovementAt: "",
      status: "IN_STOCK",
      notes: cleanString(defaults.notes),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      archivedAt: null,
      deletedAt: null
    };
    db.inventory.unshift(item);
  } else {
    let changed = false;
    if (defaults.lowStockThreshold !== undefined) {
      item.lowStockThreshold = cleanNumber(defaults.lowStockThreshold);
      changed = true;
    }
    if (defaults.reorderQuantity !== undefined) {
      item.reorderQuantity = cleanNumber(defaults.reorderQuantity);
      changed = true;
    }
    if (defaults.notes !== undefined) {
      item.notes = cleanString(defaults.notes);
      changed = true;
    }
    if (defaults.storageLocation !== undefined || defaults.storageLocationId !== undefined || defaults.storageLocationSnapshotName !== undefined) {
      applyInventoryLocation(item, db, defaults.storageLocation ?? defaults.storageLocationId ?? defaults.storageLocationSnapshotName, item);
      changed = true;
    }
    if (changed) item.updatedAt = nowIso();
  }
  return syncInventoryAliases(item);
}

function createInventoryMovement(db, item, movement) {
  if (!Array.isArray(db.inventoryMovements)) db.inventoryMovements = [];
  const record = {
    id: id("mov"),
    productId: item.productId,
    inventoryItemId: item.id,
    movementType: cleanString(movement.movementType || "MANUAL_CORRECTION").toUpperCase(),
    quantity: cleanNumber(movement.quantity),
    previousStock: cleanNumber(movement.previousStock),
    newStock: cleanNumber(movement.newStock),
    referenceType: cleanString(movement.referenceType),
    referenceId: cleanString(movement.referenceId),
    reason: cleanString(movement.reason),
    notes: cleanString(movement.notes),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.inventoryMovements.unshift(record);
  return record;
}

function changeInventoryStock(db, productId, quantityDelta, movementType, referenceType = "", referenceId = "", reason = "", notes = "", options = {}) {
  const product = findProduct(db, productId);
  if (!product) throw businessError("Product or item not found.", 404);
  if (!isTrackableProduct(product)) return null;
  const item = ensureInventoryForProduct(db, product, options.defaults || {});
  const quantity = cleanNumber(quantityDelta);
  const previousStock = cleanNumber(item.currentStock);
  const newStock = previousStock + quantity;
  if (newStock < 0 && !options.allowNegative) {
    throw businessError(`Insufficient stock for ${product.name}. Available stock is ${item.availableStock}.`);
  }
  item.currentStock = Math.max(0, newStock);
  item.availableStock = Math.max(0, item.currentStock - cleanNumber(item.reservedStock));
  item.lastMovementAt = nowIso();
  item.updatedAt = nowIso();
  syncInventoryAliases(item);
  createInventoryMovement(db, item, {
    movementType,
    quantity: Math.abs(quantity),
    previousStock,
    newStock: item.currentStock,
    referenceType,
    referenceId,
    reason,
    notes
  });
  checkLowStock(db, item);
  return item;
}

function correctInventoryStock(db, productId, correctedQuantity, reason, notes = "") {
  if (!cleanString(reason) || cleanString(reason).length < 6) throw businessError("Manual correction requires a clear reason.");
  const product = findProduct(db, productId);
  if (!product) throw businessError("Product or item not found.", 404);
  const item = ensureInventoryForProduct(db, product);
  const previousStock = cleanNumber(item.currentStock);
  const nextStock = Math.max(0, cleanNumber(correctedQuantity));
  item.currentStock = nextStock;
  item.availableStock = Math.max(0, item.currentStock - cleanNumber(item.reservedStock));
  item.lastMovementAt = nowIso();
  item.updatedAt = nowIso();
  syncInventoryAliases(item);
  createInventoryMovement(db, item, {
    movementType: "MANUAL_CORRECTION",
    quantity: Math.abs(nextStock - previousStock),
    previousStock,
    newStock: item.currentStock,
    referenceType: "ADJUSTMENT",
    referenceId: item.id,
    reason,
    notes
  });
  checkLowStock(db, item);
  return item;
}

function applyInventoryDelta(db, productId, delta, reason, referenceType, referenceId) {
  const deltaStock =
    delta.current !== undefined
      ? cleanNumber(delta.current)
      : delta.total !== undefined && cleanNumber(delta.total) !== 0
        ? cleanNumber(delta.total)
        : cleanNumber(delta.available);
  const movementType = referenceType === "order" || referenceType === "invoice" ? "SALE_OUT" : referenceType === "product" ? "OPENING_STOCK" : "MANUAL_CORRECTION";
  return changeInventoryStock(db, productId, deltaStock, movementType, String(referenceType || "").toUpperCase(), referenceId, reason);
}

function reportForRange(db, from, to) {
  const orders = activeOrders(db).filter((order) => dateInRange(order.orderDate || order.createdAt, from, to));
  const invoices = activeInvoices(db).filter((invoice) => dateInRange(invoice.invoiceDate || invoice.createdAt, from, to));
  const deliveries = db.deliveries.filter((delivery) => isActive(delivery) && dateInRange(delivery.scheduledDate || delivery.createdAt, from, to));
  const payments = activePayments(db).filter((payment) => dateInRange(payment.paymentDate || payment.createdAt, from, to));
  const expenses = activeExpenses(db).filter((expense) => dateInRange(expense.expenseDate || expense.createdAt, from, to));
  const purchases = db.purchases.filter((purchase) => isActive(purchase) && dateInRange(purchase.purchaseDate || purchase.createdAt, from, to));
  const productionBatches = db.productionBatches.filter((batch) => isActive(batch) && dateInRange(batch.productionDate || batch.createdAt, from, to));
  const inventoryMovements = (db.inventoryMovements || []).filter((movement) => dateInRange(movement.createdAt, from, to));
  const sales = invoices.length ? invoices.reduce((sum, invoice) => sum + cleanNumber(invoice.totalAmount || invoiceTotal(invoice)), 0) : orders.reduce((sum, order) => sum + orderTotal(order), 0);
  const paymentsCollected = payments.reduce((sum, payment) => sum + cleanNumber(payment.amount), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + cleanNumber(expense.amount), 0);
  const purchaseTotal = purchases.reduce((sum, purchase) => sum + cleanNumber(purchase.totalAmount), 0);
  const profit = sales - purchaseTotal - expenseTotal;
  const productTotals = new Map();
  for (const invoice of invoices) {
    for (const item of invoice.items || []) {
      const current = productTotals.get(item.productId) || { productId: item.productId, quantity: 0, total: 0 };
      current.quantity += cleanNumber(item.quantity);
      current.total += cleanNumber(item.quantity) * cleanNumber(item.unitPrice);
      productTotals.set(item.productId, current);
    }
  }
  const customerTotals = new Map();
  for (const invoice of invoices) {
    const current = customerTotals.get(invoice.customerId) || { customerId: invoice.customerId, total: 0, orders: 0 };
    current.total += cleanNumber(invoice.totalAmount || invoiceTotal(invoice));
    current.orders += 1;
    customerTotals.set(invoice.customerId, current);
  }
  return {
    from,
    to,
    totals: {
      orders: orders.length,
      invoices: invoices.length,
      unpaidInvoices: activeInvoices(db).filter((invoice) => refreshInvoicePaymentStatus(db, invoice).paymentStatus !== "PAID").length,
      deliveries: deliveries.length,
      pendingDeliveries: deliveries.filter((item) => item.status !== "completed").length,
      payments: payments.length,
      expenses: expenses.length,
      purchases: purchases.length,
      productionBatches: productionBatches.length,
      inventoryMovements: inventoryMovements.length,
      sales,
      paymentsCollected,
      expenseTotal,
      purchaseTotal,
      estimatedProfit: profit,
      outstandingBalance: db.customers.filter(isActive).reduce((sum, customer) => sum + Math.max(0, customerBalance(db, customer.id)), 0),
      inventoryValue: inventoryValue(db)
    },
    orders,
    invoices,
    deliveries,
    payments,
    expenses,
    purchases,
    productionBatches,
    inventoryMovements,
    topProducts: Array.from(productTotals.values())
      .map((item) => ({ ...item, productName: (findProduct(db, item.productId) || {}).name || "Unknown product" }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    topCustomers: Array.from(customerTotals.values())
      .map((item) => ({ ...item, customerName: (findCustomer(db, item.customerId) || {}).name || "Unknown customer" }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  };
}

function csvEscape(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, headers) {
  const lines = [headers.map((header) => csvEscape(header.label)).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(typeof header.value === "function" ? header.value(row) : row[header.value])).join(","));
  }
  return lines.join("\n");
}

function csvDate(value) {
  return value ? String(value).slice(0, 10) : "";
}

function csvNumber(value) {
  return Number(value || 0).toFixed(2);
}

function humanizeKey(value) {
  const text = cleanString(value);
  const known = {
    unpaidInvoices: "Unpaid Invoices",
    pendingDeliveries: "Pending Deliveries",
    productionBatches: "Production Batches",
    inventoryMovements: "Inventory Movements",
    paymentsCollected: "Payments Collected",
    expenseTotal: "Expense Total",
    purchaseTotal: "Purchase Total",
    estimatedProfit: "Estimated Profit",
    outstandingBalance: "Outstanding Balance",
    inventoryValue: "Inventory Value"
  };
  return known[text] || text.replace(/([A-Z])/g, " $1").replace(/[-_]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function titleCaseEnum(value) {
  return cleanString(value)
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

const REPORT_MONEY_METRICS = new Set(["sales", "paymentsCollected", "expenseTotal", "purchaseTotal", "estimatedProfit", "outstandingBalance", "inventoryValue"]);

function formatReportMetricValue(db, key, value) {
  if (typeof value !== "number") return cleanString(value);
  if (REPORT_MONEY_METRICS.has(key)) return formatMoney(db, value);
  return Number(value || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

function formatReportCell(db, key, value) {
  if (cleanString(key) === "metric") return humanizeKey(value);
  if (typeof value !== "number") return cleanString(value);
  if (/amount|balance|cost|price|profit|sales|total|value|paid/i.test(cleanString(key))) return formatMoney(db, value);
  return formatQuantity(value);
}

function businessCsv(db, title, rows, headers, options = {}) {
  const metadata = [
    [title],
    ["Business", getBranding(db).businessName || "DawnGas"],
    ["Generated Date", todayDate()]
  ];
  if (options.dateRange) metadata.push(["Date Range", options.dateRange]);
  if (options.filters) metadata.push(["Applied Filters", options.filters]);
  metadata.push([]);
  const body = toCsv(rows, headers);
  const totals = options.totals && options.totals.length
    ? ["", ...options.totals.map((row) => row.map(csvEscape).join(","))].join("\n")
    : "";
  return `${metadata.map((row) => row.map(csvEscape).join(",")).join("\n")}${body ? `\n${body}` : ""}${totals ? `\n${totals}` : ""}`;
}

function reportRowsAndHeaders(report) {
  const rows = report.rows || [];
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  return { rows, headers };
}

function pdfText(value) {
  return String(value ?? "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfLine(value, width = 92) {
  const text = String(value ?? "");
  const lines = [];
  for (let index = 0; index < text.length; index += width) lines.push(text.slice(index, index + width));
  return lines.length ? lines : [""];
}

function makeSimplePdf(title, lines) {
  const allLines = [title, "", ...lines].flatMap((line) => wrapPdfLine(line));
  const content = [
    "BT",
    "/F1 12 Tf",
    "14 TL",
    "50 780 Td",
    ...allLines.slice(0, 52).map((line) => `(${pdfText(line)}) Tj T*`),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

function sendPdf(res, title, lines, fileName, db = null) {
  const settings = db ? getBranding(db) : null;
  const brandedLines = settings
    ? [
        settings.businessName || "DawnGas",
        [settings.address, settings.phone, settings.email].filter(Boolean).join(" | "),
        "",
        ...lines,
        "",
        settings.invoiceFooterNote || settings.reportFooterNote || "Generated by DawnGas."
      ].filter((line, index) => index !== 1 || line)
    : lines;
  const buffer = makeSimplePdf(title, brandedLines);
  res.writeHead(200, responseHeaders({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${fileName}"`
  }));
  res.end(buffer);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function zipStore(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const stamp = dosDateTime();
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8");
    const fileName = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, fileName, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + data.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function makeXlsx(rows, headers) {
  const tableRows = [
    headers.map((header) => header),
    ...rows.map((row) => headers.map((header) => row[header] ?? ""))
  ];
  const sheetData = tableRows
    .map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, cellIndex) => `<c r="${String.fromCharCode(65 + cellIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`).join("")}</row>`)
    .join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`;
  return zipStore([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="DawnGas Report" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheet]
  ]);
}

function sendXlsx(res, rows, headers, fileName) {
  const buffer = makeXlsx(rows, headers);
  res.writeHead(200, responseHeaders({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${fileName}"`
  }));
  res.end(buffer);
}

function printableHtml(db, title, body) {
  const settings = getBranding(db);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page{size:A4;margin:14mm}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#172033;margin:0;background:#fff;font-size:13px;line-height:1.45}
    header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:4px solid ${settings.primaryColor};padding-bottom:16px;margin-bottom:22px}
    h1{margin:0;color:${settings.primaryColor};font-size:26px;line-height:1.1}
    h2{margin:0;color:#172033;font-size:24px}
    h3{margin:0 0 8px;font-size:14px;color:#172033;text-transform:uppercase;letter-spacing:.04em}
    table{width:100%;border-collapse:collapse;margin:14px 0}
    th,td{border:1px solid #d7dee8;padding:9px 10px;text-align:left;font-size:12.5px;vertical-align:top}
    th{background:#f2f6f8;color:#344054;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    .brand-contact{color:#64748b;text-align:right;max-width:320px}
    .accent-line{height:4px;background:${settings.primaryColor};margin:16px 0;border-radius:99px}
    .doc-title-row{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}
    .doc-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:260px}
    .meta-item,.doc-box{border:1px solid #d7dee8;border-radius:8px;padding:10px;background:#fbfcfd}
    .meta-item span,.muted{color:#64748b}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}
    .totals{margin-left:auto;width:min(310px,100%);border:1px solid #d7dee8;border-radius:8px;overflow:hidden}
    .total-row{display:flex;justify-content:space-between;gap:16px;padding:8px 10px;border-bottom:1px solid #d7dee8}
    .total-row:last-child{border-bottom:0}
    .total-row.grand{background:#f2f6f8;color:#172033;font-weight:700;font-size:15px}
    .amount-highlight{border:1px solid ${settings.primaryColor};background:#f0faf8;color:${settings.primaryColor};border-radius:10px;padding:14px;margin:14px 0;font-size:20px;font-weight:800;text-align:center}
    .print-guidance{margin:0 0 18px;padding:10px 12px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:8px;font-size:12px}
    footer{margin-top:28px;border-top:1px solid #d7dee8;padding-top:12px;color:#64748b;font-size:11px}
    @media print{button,.no-print{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style>
</head>
<body>
  <header>
    <div>${logoMarkup(settings, 80)}<h1>${escapeHtml(settings.businessName || "DawnGas")}</h1></div>
    <div class="brand-contact">${escapeHtml([settings.address, settings.phone, settings.email].filter(Boolean).join(" | "))}</div>
  </header>
  <div class="print-guidance no-print">For official sharing and saving, use Download PDF. If your browser print dialog adds URL/date margins, disable Headers and Footers in the print dialog.</div>
  ${body}
  ${settings.signatureFileId || settings.signatureAttachmentId ? `<div style="margin-top:24px"><img src="/api/uploads/${escapeHtml(settings.signatureFileId || settings.signatureAttachmentId)}" alt="Signature" style="max-height:70px;max-width:220px;object-fit:contain"><div class="muted">Authorized signature</div></div>` : ""}
  <footer>${escapeHtml(settings.invoiceFooterNote || settings.reportFooterNote || "Generated by DawnGas.")}</footer>
  <script>window.print();</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeBackup(db) {
  const clone = JSON.parse(JSON.stringify(db));
  clone.users = clone.users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  }));
  clone.sessions = [];
  clone.passwordResetTokens = [];
  return {
    manifest: {
      appName: "DawnGas",
      appVersion: db.appVersion || "0.1.0",
      dbName: process.env.MONGODB_DB_NAME || "dawngas",
      generatedAt: nowIso(),
      format: "dawngas-mongodb-json-backup-v1",
      collectionCounts: Object.fromEntries(
        [
          ...Object.keys(MONGO_COLLECTIONS).map((key) => [MONGO_COLLECTIONS[key], Array.isArray(clone[key]) ? clone[key].length : 0]),
          ["businesssettings", clone.businessSettings ? 1 : 0],
          ["dashboardpreferences", clone.dashboardPreferences ? 1 : 0]
        ]
      ),
      includesPasswordHashes: false,
      includesSecrets: false
    },
    data: clone
  };
}

function backupPreview(backup) {
  const manifest = backup && backup.manifest ? backup.manifest : {};
  const data = backup && backup.data ? backup.data : {};
  const collectionCounts = manifest.collectionCounts || Object.fromEntries(
    Object.keys(MONGO_COLLECTIONS).map((key) => [MONGO_COLLECTIONS[key], Array.isArray(data[key]) ? data[key].length : 0])
  );
  return {
    appName: manifest.appName || "Unknown",
    appVersion: manifest.appVersion || "",
    dbName: manifest.dbName || "",
    generatedAt: manifest.generatedAt || "",
    format: manifest.format || "",
    collectionCounts,
    includesPasswordHashes: manifest.includesPasswordHashes === true,
    includesSecrets: manifest.includesSecrets === true,
    warnings: [
      "Current owner login is preserved by default.",
      "Physical uploaded files are not embedded in JSON backups; file metadata is included."
    ]
  };
}

function validateBackupDocument(backup) {
  const errors = [];
  if (!backup || typeof backup !== "object") errors.push("Backup must be a JSON object.");
  if (!backup?.manifest) errors.push("Backup manifest is missing.");
  if (!["dawngas-json-backup-v1", "dawngas-mongodb-json-backup-v1"].includes(backup?.manifest?.format)) errors.push("Backup format is not recognized.");
  if (!backup?.data || typeof backup.data !== "object") errors.push("Backup data section is missing.");
  for (const key of ["customers", "products", "inventory", "invoices", "payments", "businessSettings"]) {
    if (backup?.data && backup.data[key] === undefined) errors.push(`Backup data is missing ${key}.`);
  }
  const preview = backupPreview(backup || {});
  if (preview.includesSecrets || preview.includesPasswordHashes) errors.push("Backup appears to include secrets or password hashes.");
  return { valid: errors.length === 0, errors, preview };
}

function writeBackupFile(backup, kind = "backup") {
  const backupId = id("backup");
  const fileName = `dawngas-${kind}-${todayDate()}-${backupId}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));
  const stats = fs.statSync(filePath);
  return {
    id: backupId,
    backupType: kind === "safety" ? "SAFETY_JSON" : "FULL_JSON",
    type: "json",
    fileName,
    filePath,
    fileSize: stats.size,
    size: stats.size,
    status: "completed",
    completedAt: nowIso(),
    metadata: backup.manifest,
    createdAt: nowIso()
  };
}

function buildStatement(db, customerId, from = "", to = "") {
  const customer = findCustomer(db, customerId);
  if (!customer) return null;
  const orders = activeOrders(db).filter((order) => order.customerId === customerId && dateInRange(order.orderDate, from, to));
  const invoices = activeInvoices(db).filter((invoice) => invoice.customerId === customerId && dateInRange(invoice.invoiceDate, from, to));
  const payments = activePayments(db).filter((payment) => payment.customerId === customerId && dateInRange(payment.paymentDate, from, to));
  const transactions = [
    ...invoices.map((invoice) => ({
      date: invoice.invoiceDate,
      type: "Invoice",
      number: invoice.invoiceNumber,
      debit: cleanNumber(invoice.totalAmount || invoiceTotal(invoice)),
      credit: 0,
      note: invoice.status
    })),
    ...orders.filter((order) => !invoices.some((invoice) => invoice.orderId === order.id)).map((order) => ({
      date: order.orderDate,
      type: "Order",
      number: order.orderNumber,
      debit: orderTotal(order),
      credit: 0,
      note: order.status
    })),
    ...payments.map((payment) => ({
      date: payment.paymentDate,
      type: "Payment",
      number: payment.receiptNumber,
      debit: 0,
      credit: cleanNumber(payment.amount),
      note: payment.method
    }))
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const totalDebit = transactions.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = transactions.reduce((sum, item) => sum + item.credit, 0);
  return {
    customer: enrichCustomer(db, customer),
    from,
    to,
    openingBalance: cleanNumber(customer.openingBalance),
    totalDebit,
    totalCredit,
    balanceDue: cleanNumber(customer.openingBalance) + totalDebit - totalCredit,
    transactions
  };
}

function getRequestOrigin(req) {
  const proto = cleanString(req.headers["x-forwarded-proto"]).split(",")[0] || (req.socket && req.socket.encrypted ? "https" : "http");
  const host = cleanString(req.headers["x-forwarded-host"]).split(",")[0] || cleanString(req.headers.host) || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function invoicePdfDocument(db, invoiceId) {
  const invoice = db.invoices.find((item) => item.id === invoiceId && isActive(item));
  if (!invoice) return null;
  refreshInvoicePaymentStatus(db, invoice);
  const customer = findCustomer(db, invoice.customerId) || {};
  const settings = getBranding(db);
  return {
    entityType: "invoice",
    entityId: invoice.id,
    documentNumber: invoice.invoiceNumber,
    customerName: customer.name || "",
    title: `Invoice ${invoice.invoiceNumber}`,
    fileName: `${invoice.invoiceNumber}.pdf`,
    lines: [
      "Invoice Details",
      `Invoice Number: ${invoice.invoiceNumber}`,
      `Invoice Status: ${invoice.status}`,
      `Payment Status: ${invoice.paymentStatus}`,
      `Invoice Date: ${invoice.invoiceDate}`,
      `Due Date: ${invoice.dueDate || "N/A"}`,
      "",
      "Bill To",
      `Customer: ${customer.name || ""}`,
      `Phone: ${customer.phone || ""}`,
      `Email: ${customer.email || ""}`,
      `Address: ${customer.address || ""}`,
      "",
      "Items",
      "Item | Description | Quantity | Unit | Unit Price | Line Total",
      ...(invoice.items || []).map((item) => `${item.itemName} | ${item.description || ""} | ${formatQuantity(item.quantity)} | ${item.unitOfMeasure || ""} | ${formatMoney(db, item.unitPrice)} | ${formatMoney(db, item.lineTotal)}`),
      "",
      "Totals",
      `Subtotal: ${formatMoney(db, invoice.subtotal)}`,
      `Discount: ${formatMoney(db, invoice.discount)}`,
      `Tax: ${formatMoney(db, invoice.tax)}`,
      `Total: ${formatMoney(db, invoice.totalAmount)}`,
      `Paid: ${formatMoney(db, invoice.paidAmount)}`,
      `Balance: ${formatMoney(db, invoice.balanceAmount)}`,
      "",
      "Payment Instructions",
      settings.paymentInstructions || "Please pay the outstanding balance using the agreed payment method.",
      "",
      "Terms",
      invoice.terms || settings.invoiceTerms || settings.terms || ""
    ],
    totalAmount: cleanNumber(invoice.totalAmount),
    balanceAmount: cleanNumber(invoice.balanceAmount)
  };
}

function receiptPdfDocument(db, paymentId) {
  const payment = db.payments.find((item) => item.id === paymentId && isActive(item));
  if (!payment) return null;
  const customer = findCustomer(db, payment.customerId) || {};
  const invoice = db.invoices.find((item) => item.id === payment.invoiceId);
  if (invoice) refreshInvoicePaymentStatus(db, invoice);
  return {
    entityType: "receipt",
    entityId: payment.id,
    documentNumber: payment.receiptNumber,
    customerName: customer.name || "",
    title: `Receipt ${payment.receiptNumber}`,
    fileName: `${payment.receiptNumber}.pdf`,
    lines: [
      "Receipt Details",
      `Receipt Number: ${payment.receiptNumber}`,
      `Payment Date: ${payment.paymentDate}`,
      `Payment Method: ${titleCaseEnum(payment.paymentMethod || payment.method)}`,
      `Linked Invoice: ${invoice ? invoice.invoiceNumber : "N/A"}`,
      "",
      "Customer",
      `Customer: ${customer.name || ""}`,
      `Phone: ${customer.phone || ""}`,
      `Address: ${customer.address || ""}`,
      "",
      "Payment Summary",
      `Previous Balance: ${formatMoney(db, payment.previousBalance)}`,
      `Amount Received: ${formatMoney(db, payment.amount)}`,
      `Remaining Customer Balance: ${formatMoney(db, customerBalance(db, payment.customerId))}`,
      invoice ? `Invoice Balance Before Payment: ${formatMoney(db, payment.invoicePreviousBalance ?? invoice.totalAmount)}` : "",
      invoice ? `Invoice Balance After Payment: ${formatMoney(db, payment.invoiceRemainingBalance ?? invoice.balanceAmount)}` : "",
      `Notes: ${payment.notes || ""}`
    ].filter((line) => line !== ""),
    totalAmount: cleanNumber(payment.amount),
    balanceAmount: cleanNumber(customerBalance(db, payment.customerId))
  };
}

function statementPdfDocument(db, customerId, from = "", to = "") {
  const statement = buildStatement(db, customerId, from, to);
  if (!statement) return null;
  const lines = [
    `Customer: ${statement.customer.name}`,
    `Phone: ${statement.customer.phone || ""}`,
    `Address: ${statement.customer.address || ""}`,
    `Period: ${from || "All"} to ${to || "Today"}`,
    `Balance Due: ${formatMoney(db, statement.balanceDue)}`,
    "",
    "Date | Type | Number | Debit | Credit | Note"
  ];
  for (const item of statement.transactions.slice(0, 60)) {
    lines.push(`${item.date} | ${item.type} | ${item.number} | ${formatMoney(db, item.debit)} | ${formatMoney(db, item.credit)} | ${item.note || ""}`);
  }
  if (statement.transactions.length > 60) lines.push(`... ${statement.transactions.length - 60} more transactions in CSV export`);
  return {
    entityType: "statement",
    entityId: statement.customer.id,
    documentNumber: `statement-${statement.customer.id}`,
    customerName: statement.customer.name || "",
    title: "Customer Statement",
    fileName: `dawngas-statement-${slug(statement.customer.name)}-${todayDate()}.pdf`,
    lines,
    from,
    to,
    balanceAmount: cleanNumber(statement.balanceDue)
  };
}

function reportPdfDocument(db, reportType = "summary", from = "", to = "") {
  const safeType = cleanString(reportType || "summary") || "summary";
  const reportFrom = from || todayDate().slice(0, 7) + "-01";
  const reportTo = to || todayDate();
  if (safeType === "summary") {
    const report = reportForRange(db, reportFrom, reportTo);
    return {
      entityType: "report",
      entityId: "summary",
      documentNumber: "summary",
      title: "Business Report",
      fileName: `dawngas-summary-report-${todayDate()}.pdf`,
      from: report.from,
      to: report.to,
      reportType: "summary",
      lines: [
        `Date Range: ${report.from} to ${report.to}`,
        "",
        "Business Summary",
        ...Object.entries(report.totals).map(([metric, value]) => `${humanizeKey(metric)}: ${formatReportMetricValue(db, metric, value)}`)
      ]
    };
  }
  const report = buildNamedReport(db, safeType, { from: reportFrom, to: reportTo });
  const { rows, headers } = reportRowsAndHeaders(report);
  const lines = [`Date Range: ${report.from} to ${report.to}`, "", headers.map(humanizeKey).join(" | ")];
  for (const row of rows.slice(0, 45)) {
    lines.push(headers.map((header) => formatReportCell(db, header === "value" && row.metric ? row.metric : header, row[header])).join(" | "));
  }
  if (rows.length > 45) lines.push(`... ${rows.length - 45} more rows in CSV/XLSX export`);
  return {
    entityType: "report",
    entityId: safeType,
    documentNumber: safeType,
    title: report.title,
    fileName: `dawngas-${slug(report.title)}-${todayDate()}.pdf`,
    from: report.from,
    to: report.to,
    reportType: safeType,
    lines
  };
}

function sharedPdfDocument(db, link) {
  const entityType = cleanString(link.entityType).toLowerCase();
  if (entityType === "invoice") return invoicePdfDocument(db, link.entityId);
  if (entityType === "receipt" || entityType === "payment") return receiptPdfDocument(db, link.entityId);
  if (entityType === "statement" || entityType === "customer-statement") return statementPdfDocument(db, link.entityId, link.from, link.to);
  if (entityType === "report") return reportPdfDocument(db, link.reportType || link.entityId || "summary", link.from, link.to);
  return null;
}

const routes = [];
function route(method, pattern, handler, options = {}) {
  routes.push({ method, pattern, handler, auth: options.auth !== false });
}

function matchRoute(method, pathname) {
  const pathParts = pathname.split("/").filter(Boolean);
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const patternParts = candidate.pattern.split("/").filter(Boolean);
    if (patternParts.length !== pathParts.length) continue;
    const params = {};
    let ok = true;
    for (let index = 0; index < patternParts.length; index += 1) {
      const patternPart = patternParts[index];
      const pathPart = pathParts[index];
      if (patternPart.startsWith(":")) params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      else if (patternPart !== pathPart) {
        ok = false;
        break;
      }
    }
    if (ok) return { ...candidate, params };
  }
  return null;
}

function queryObject(url) {
  const output = {};
  for (const [key, value] of url.searchParams.entries()) output[key] = value;
  return output;
}

function listQuery(records, query, searchable = []) {
  let output = records.filter(isActive);
  const search = cleanString(query.search).toLowerCase();
  if (search) {
    output = output.filter((record) => searchable.some((field) => cleanString(record[field]).toLowerCase().includes(search)));
  }
  if (query.status) output = output.filter((record) => record.status === query.status);
  if (query.from || query.to) {
    output = output.filter((record) => dateInRange(record.createdAt, query.from, query.to));
  }
  const sort = query.sort || "createdAt";
  const direction = query.direction === "asc" ? 1 : -1;
  output.sort((a, b) => String(a[sort] || "").localeCompare(String(b[sort] || "")) * direction);
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 50)));
  const start = (page - 1) * limit;
  return {
    rows: output.slice(start, start + limit),
    meta: { total: output.length, page, limit }
  };
}

route("GET", "/api/health", async ({ res }) => {
  sendJson(res, 200, { success: true, message: "DawnGas API is running.", timestamp: nowIso() });
}, { auth: false });

route("GET", "/api/auth/owner-exists", async ({ db, res }) => {
  sendJson(res, 200, { success: true, exists: db.users.length > 0 });
}, { auth: false });

route("POST", "/api/auth/signup", async ({ req, db, body, res }) => {
  if (!rateLimit(req, "signup", 5, 15 * 60 * 1000)) return sendError(res, 429, "Too many signup attempts. Please try again later.");
  if (db.users.length > 0) return sendError(res, 409, "Owner account already exists. Please log in.");
  const errors = requireFields(body, ["name", "email", "phone", "password"]);
  if (cleanString(body.password).length < 8) errors.password = "Password must be at least 8 characters.";
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Please fix the highlighted fields.", errors });
  const user = {
    id: id("owner"),
    role: "owner",
    name: cleanString(body.name),
    email: cleanString(body.email).toLowerCase(),
    phone: cleanString(body.phone),
    passwordHash: await hashPassword(cleanString(body.password)),
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.users.push(user);
  addActivity(db, "owner_signup", "owner", user.id, "Owner account created.");
  addNotification(db, "system", "Welcome to DawnGas", "Your owner dashboard is ready.", "owner", user.id);
  createSession(res, db, user);
  await saveDb(db);
  sendJson(res, 201, { success: true, user: publicUser(user) });
}, { auth: false });

route("POST", "/api/auth/login", async ({ req, db, body, res }) => {
  if (!rateLimit(req, "login", 10, 15 * 60 * 1000)) return sendError(res, 429, "Too many login attempts. Please wait and try again.");
  const email = cleanString(body.email).toLowerCase();
  const password = cleanString(body.password);
  const user = db.users.find((item) => item.email === email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return sendError(res, 401, "Invalid email or password.");
  if (user.status !== "active") return sendError(res, 403, "Account is not active.");
  createSession(res, db, user);
  user.lastLoginAt = nowIso();
  addActivity(db, "login", "owner", user.id, "Owner logged in.");
  await saveDb(db);
  sendJson(res, 200, { success: true, user: publicUser(user) });
}, { auth: false });

route("POST", "/api/auth/logout", async ({ req, db, res }) => {
  revokeCurrentSession(req, res, db);
  await saveDb(db);
  sendJson(res, 200, { success: true, message: "Logged out." });
}, { auth: false });

route("GET", "/api/auth/me", async ({ current, res }) => {
  sendJson(res, 200, { success: true, user: publicUser(current.user) });
});

route("POST", "/api/share-links", async ({ req, db, body, current, res }) => {
  const entityType = cleanString(body.entityType).toLowerCase();
  const reportType = cleanString(body.reportType || body.type || "summary") || "summary";
  const entityId = cleanString(body.entityId || (entityType === "report" ? reportType : ""));
  const draftLink = {
    entityType,
    entityId,
    reportType,
    from: cleanString(body.from),
    to: cleanString(body.to)
  };
  const document = sharedPdfDocument(db, draftLink);
  if (!document) return sendError(res, 404, "Document not found for sharing.");

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const shareLink = {
    id: id("share"),
    entityType: document.entityType,
    entityId: document.entityId,
    reportType: document.reportType || "",
    from: document.from || draftLink.from || "",
    to: document.to || draftLink.to || "",
    tokenHash: hashValue(token),
    tokenPrefix: token.slice(0, 8),
    documentTitle: document.title,
    documentNumber: document.documentNumber || "",
    customerName: document.customerName || "",
    expiresAt,
    revokedAt: null,
    createdAt: nowIso(),
    createdBy: current.user.id
  };
  db.shareLinks = (db.shareLinks || []).filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > Date.now());
  db.shareLinks.unshift(shareLink);
  addActivity(db, "share_link_created", document.entityType, document.entityId, `${document.title} share link created.`, { expiresAt });
  await saveDb(db);

  const pdfPath = `/api/share/${encodeURIComponent(token)}/pdf`;
  sendJson(res, 201, {
    success: true,
    shareLink: {
      id: shareLink.id,
      entityType: shareLink.entityType,
      entityId: shareLink.entityId,
      documentTitle: shareLink.documentTitle,
      documentNumber: shareLink.documentNumber,
      expiresAt: shareLink.expiresAt,
      pdfUrl: `${getRequestOrigin(req)}${pdfPath}`,
      pdfPath
    }
  });
});

route("GET", "/api/share/:token/pdf", async ({ db, params, res }) => {
  const tokenHash = hashValue(params.token);
  const shareLink = (db.shareLinks || []).find((item) => item.tokenHash === tokenHash && !item.revokedAt);
  if (!shareLink) return sendError(res, 404, "Share link not found.");
  if (shareLink.expiresAt && new Date(shareLink.expiresAt).getTime() < Date.now()) return sendError(res, 410, "Share link has expired.");
  const document = sharedPdfDocument(db, shareLink);
  if (!document) return sendError(res, 404, "Shared document not found.");
  sendPdf(res, document.title, document.lines, document.fileName, db);
}, { auth: false });

route("POST", "/api/auth/forgot-password", async ({ req, db, body, res }) => {
  if (!rateLimit(req, "forgot-password", 5, 15 * 60 * 1000)) return sendError(res, 429, "Too many reset requests. Please try again later.");
  const email = cleanString(body.email).toLowerCase();
  const user = db.users.find((item) => item.email === email);
  let devResetToken = "";
  if (user) {
    const token = crypto.randomBytes(24).toString("hex");
    db.passwordResetTokens.push({
      id: id("reset"),
      userId: user.id,
      tokenHash: hashValue(token),
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      usedAt: null
    });
    addActivity(db, "password_reset_requested", "owner", user.id, "Password reset requested.");
    if (NODE_ENV !== "production") devResetToken = token;
    await saveDb(db);
  }
  sendJson(res, 200, {
    success: true,
    message: "If that email exists, a password reset token has been created.",
    devResetToken
  });
}, { auth: false });

route("POST", "/api/auth/reset-password", async ({ req, db, body, res }) => {
  if (!rateLimit(req, "reset-password", 5, 15 * 60 * 1000)) return sendError(res, 429, "Too many reset attempts. Please try again later.");
  const token = cleanString(body.token);
  const password = cleanString(body.password);
  if (!token || password.length < 8) return sendError(res, 400, "Token and a password of at least 8 characters are required.");
  const reset = db.passwordResetTokens.find((item) => item.tokenHash === hashValue(token) && !item.usedAt);
  if (!reset || new Date(reset.expiresAt).getTime() < Date.now()) return sendError(res, 400, "Reset token is invalid or expired.");
  const user = db.users.find((item) => item.id === reset.userId);
  if (!user) return sendError(res, 404, "Owner account not found.");
  user.passwordHash = await hashPassword(password);
  user.updatedAt = nowIso();
  reset.usedAt = nowIso();
  db.sessions.forEach((session) => {
    if (session.userId === user.id) session.revokedAt = session.revokedAt || nowIso();
  });
  addActivity(db, "password_reset", "owner", user.id, "Owner password was reset.");
  await saveDb(db);
  sendJson(res, 200, { success: true, message: "Password reset. Please log in." });
}, { auth: false });

route("GET", "/api/dashboard/summary", async ({ db, res }) => {
  const today = todayDate();
  const monthStart = today.slice(0, 7) + "-01";
  const todayReport = reportForRange(db, today, today);
  const monthReport = reportForRange(db, monthStart, today);
  const lowStock = db.inventory.filter(isActive).map((item) => syncInventoryAliases(item)).filter((item) => item.status === "LOW_STOCK" || item.status === "OUT_OF_STOCK");
  const rawMaterialsLowStock = lowStock.filter((item) => normalizeItemType((findProduct(db, item.productId) || {}).itemType) === ITEM_TYPES.RAW_MATERIAL);
  const finishedProductsStock = db.inventory
    .filter(isActive)
    .map((item) => enrichInventory(db, item))
    .filter((item) => normalizeItemType(item.itemType) === ITEM_TYPES.FINISHED_PRODUCT)
    .reduce((sum, item) => sum + cleanNumber(item.currentStock), 0);
  const balanceReminders = db.customers
    .filter(isActive)
    .map((customer) => enrichCustomer(db, customer))
    .filter((customer) => customer.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 8);
  sendJson(res, 200, {
    success: true,
    summary: {
      ordersToday: todayReport.totals.orders,
      totalProducts: db.products.filter(isActive).length,
      rawMaterialsLowStock: rawMaterialsLowStock.length,
      finishedProductsStock,
      invoicesToday: todayReport.totals.invoices,
      unpaidInvoices: activeInvoices(db).filter((invoice) => refreshInvoicePaymentStatus(db, invoice).paymentStatus !== "PAID").length,
      purchasesThisMonth: monthReport.totals.purchaseTotal,
      pendingDeliveries: db.deliveries.filter((item) => isActive(item) && item.status !== "completed").length,
      completedDeliveriesToday: db.deliveries.filter((item) => isActive(item) && item.status === "completed" && String(item.completedDate || "").slice(0, 10) === today).length,
      totalCustomers: db.customers.filter(isActive).length,
      lowStockItems: lowStock.length,
      paymentsCollectedToday: todayReport.totals.paymentsCollected,
      outstandingBalance: monthReport.totals.outstandingBalance,
      expensesThisMonth: monthReport.totals.expenseTotal,
      estimatedProfit: monthReport.totals.estimatedProfit,
      unreadNotifications: db.notifications.filter((item) => !item.deletedAt && !item.readAt).length
    },
    lowStock,
    balanceReminders,
    monthlySnapshot: monthReport.totals,
    recentProduction: db.productionBatches.filter(isActive).slice(0, 6).map((batch) => enrichProductionBatch(db, batch)),
    recentInventoryMovements: (db.inventoryMovements || []).slice(0, 8),
    recentInvoices: activeInvoices(db).slice(0, 6).map((invoice) => enrichInvoice(db, invoice)),
    recentPayments: activePayments(db).slice(0, 6).map((payment) => ({ ...payment, customer: findCustomer(db, payment.customerId) || null })),
    recentOrders: activeOrders(db).slice(0, 6)
  });
});

route("GET", "/api/dashboard/recent-activity", async ({ db, res }) => {
  sendJson(res, 200, { success: true, activity: db.activityLogs.slice(0, 25) });
});

route("GET", "/api/dashboard/preferences", async ({ db, res }) => {
  sendJson(res, 200, { success: true, preferences: db.dashboardPreferences });
});

route("PATCH", "/api/dashboard/preferences", async ({ db, body, res }) => {
  db.dashboardPreferences = { ...db.dashboardPreferences, ...body, updatedAt: nowIso() };
  addActivity(db, "dashboard_preferences_updated", "settings", "dashboard", "Dashboard preferences updated.");
  await saveDb(db);
  sendJson(res, 200, { success: true, preferences: db.dashboardPreferences });
});

route("GET", "/api/customers", async ({ db, query, res }) => {
  const result = listQuery(db.customers, query, ["name", "phone", "email", "address"]).rows.map((customer) => enrichCustomer(db, customer));
  sendJson(res, 200, { success: true, customers: result });
});

route("POST", "/api/customers", async ({ db, body, res }) => {
  const errors = requireFields(body, ["name", "phone"]);
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Customer name and phone are required.", errors });
  const customer = {
    id: id("cus"),
    name: cleanString(body.name),
    phone: cleanString(body.phone),
    email: cleanString(body.email),
    address: cleanString(body.address),
    customerType: cleanString(body.customerType) || "regular",
    openingBalance: cleanNumber(body.openingBalance),
    notes: cleanString(body.notes),
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null
  };
  db.customers.unshift(customer);
  addActivity(db, "customer_created", "customer", customer.id, `Customer ${customer.name} created.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, customer: enrichCustomer(db, customer) });
});

route("GET", "/api/customers/:id", async ({ db, params, res }) => {
  const customer = db.customers.find((item) => item.id === params.id);
  if (!customer) return sendError(res, 404, "Customer not found.");
  sendJson(res, 200, {
    success: true,
    customer: enrichCustomer(db, customer),
    orders: activeOrders(db).filter((order) => order.customerId === params.id),
    invoices: activeInvoices(db).filter((invoice) => invoice.customerId === params.id).map((invoice) => enrichInvoice(db, invoice)),
    payments: activePayments(db).filter((payment) => payment.customerId === params.id),
    notes: db.notes.filter((note) => isActive(note) && note.entityType === "customer" && note.entityId === params.id),
    attachments: db.attachments.filter((attachment) => isActive(attachment) && attachment.entityType === "customer" && attachment.entityId === params.id)
  });
});

route("PATCH", "/api/customers/:id", async ({ db, params, body, res }) => {
  const customer = db.customers.find((item) => item.id === params.id);
  if (!customer) return sendError(res, 404, "Customer not found.");
  Object.assign(customer, {
    name: cleanString(body.name ?? customer.name),
    phone: cleanString(body.phone ?? customer.phone),
    email: cleanString(body.email ?? customer.email),
    address: cleanString(body.address ?? customer.address),
    customerType: cleanString(body.customerType ?? customer.customerType),
    openingBalance: cleanNumber(body.openingBalance ?? customer.openingBalance),
    notes: cleanString(body.notes ?? customer.notes),
    status: cleanString(body.status ?? customer.status) || "active",
    updatedAt: nowIso()
  });
  addActivity(db, "customer_updated", "customer", customer.id, `Customer ${customer.name} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, customer: enrichCustomer(db, customer) });
});

route("PATCH", "/api/customers/:id/archive", async ({ db, params, res }) => {
  const customer = db.customers.find((item) => item.id === params.id);
  if (!customer) return sendError(res, 404, "Customer not found.");
  customer.archivedAt = nowIso();
  customer.status = "archived";
  addActivity(db, "customer_archived", "customer", customer.id, `Customer ${customer.name} archived.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, customer });
});

route("GET", "/api/customers/:id/orders", async ({ db, params, res }) => {
  sendJson(res, 200, { success: true, orders: activeOrders(db).filter((order) => order.customerId === params.id) });
});

route("GET", "/api/customers/:id/payments", async ({ db, params, res }) => {
  sendJson(res, 200, { success: true, payments: activePayments(db).filter((payment) => payment.customerId === params.id) });
});

route("GET", "/api/customers/:id/statement", async ({ db, params, query, res }) => {
  const statement = buildStatement(db, params.id, query.from, query.to);
  if (!statement) return sendError(res, 404, "Customer not found.");
  sendJson(res, 200, { success: true, statement, branding: getBranding(db) });
});

route("GET", "/api/customers/:id/statement/print", async ({ db, params, query, res }) => {
  const statement = buildStatement(db, params.id, query.from, query.to);
  if (!statement) return sendError(res, 404, "Customer not found.");
  const rows = statement.transactions
    .map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.number)}</td><td>${currency(item.debit)}</td><td>${currency(item.credit)}</td><td>${escapeHtml(item.note)}</td></tr>`)
    .join("");
  sendText(
    res,
    200,
    printableHtml(
      db,
      "Customer Statement",
      `<h2>Customer Statement</h2><p><strong>${escapeHtml(statement.customer.name)}</strong><br>${escapeHtml(statement.customer.phone)}<br>${escapeHtml(statement.customer.address)}</p><table><thead><tr><th>Date</th><th>Type</th><th>Number</th><th>Debit</th><th>Credit</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table><p class="total">Balance Due: ${currency(statement.balanceDue)}</p>`
    ),
    "text/html; charset=utf-8"
  );
});

route("GET", "/api/customers/:id/statement/pdf", async ({ db, params, query, res }) => {
  const statement = buildStatement(db, params.id, query.from, query.to);
  if (!statement) return sendError(res, 404, "Customer not found.");
  const lines = [
    `Customer: ${statement.customer.name}`,
    `Phone: ${statement.customer.phone || ""}`,
    `Address: ${statement.customer.address || ""}`,
    `Balance Due: ${formatMoney(db, statement.balanceDue)}`,
    "",
    "Date | Type | Number | Debit | Credit | Note"
  ];
  for (const item of statement.transactions.slice(0, 60)) {
    lines.push(`${item.date} | ${item.type} | ${item.number} | ${formatMoney(db, item.debit)} | ${formatMoney(db, item.credit)} | ${item.note || ""}`);
  }
  if (statement.transactions.length > 60) lines.push(`... ${statement.transactions.length - 60} more transactions in CSV export`);
  sendPdf(res, "Customer Statement", lines, `dawngas-statement-${slug(statement.customer.name)}-${todayDate()}.pdf`, db);
});

route("GET", "/api/customers/:id/statement/csv", async ({ db, params, query, res }) => {
  const statement = buildStatement(db, params.id, query.from, query.to);
  if (!statement) return sendError(res, 404, "Customer not found.");
  const csv = toCsv(statement.transactions, [
    { label: "Date", value: "date" },
    { label: "Type", value: "type" },
    { label: "Number", value: "number" },
    { label: "Debit", value: (row) => currency(row.debit) },
    { label: "Credit", value: (row) => currency(row.credit) },
    { label: "Note", value: "note" }
  ]);
  sendText(res, 200, csv, "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename="dawngas-customer-statement-${todayDate()}.csv"` });
});

function categoryPayload(body, existing = {}) {
  const type = normalizeItemType(body.type ?? existing.type);
  return {
    name: cleanString(body.name ?? existing.name),
    type,
    itemTypeId: type,
    description: cleanString(body.description ?? existing.description),
    status: normalizeRecordStatus(body.status ?? existing.status),
    updatedAt: nowIso()
  };
}

function firstCategoryForType(db, itemType) {
  return db.productCategories.find((category) => isActive(category) && normalizeItemType(category.type) === itemType);
}

function parseBomInput(body) {
  const source = body.bom ?? body.billOfMaterials ?? [];
  if (Array.isArray(source)) return source;
  const parsed = safeJsonParse(source);
  return Array.isArray(parsed) ? parsed : [];
}

function productHasBusinessHistory(db, productId) {
  return (
    db.invoices.some((invoice) => isActive(invoice) && (invoice.items || []).some((item) => item.productId === productId)) ||
    db.purchases.some((purchase) => isActive(purchase) && (purchase.items || []).some((item) => item.productId === productId)) ||
    db.orders.some((order) => isActive(order) && (order.items || []).some((item) => item.productId === productId)) ||
    db.productionBatches.some((batch) => isActive(batch) && batch.finishedProductId === productId) ||
    db.billOfMaterials.some((row) => row.finishedProductId === productId || row.rawMaterialId === productId) ||
    db.inventoryMovements.some((movement) => movement.productId === productId)
  );
}

function normalizeProductPayload(db, body, existing = {}) {
  const itemType = normalizeItemType(body.itemType ?? existing.itemType);
  const categoryId = cleanString(body.categoryId ?? existing.categoryId) || (firstCategoryForType(db, itemType) || {}).id || "";
  const category = findCategory(db, categoryId);
  const behavior = itemTypeBehavior(db, itemType);
  const name = cleanString(body.name ?? body.itemName ?? body.materialName ?? body.serviceName ?? existing.name);
  const costPrice = cleanNumber(body.costPrice ?? body.costPerUnit ?? existing.costPrice);
  const sellingPrice = cleanNumber(body.sellingPrice ?? body.unitPrice ?? existing.sellingPrice);
  const standardServiceCharge = cleanNumber(body.standardServiceCharge ?? body.serviceCharge ?? existing.standardServiceCharge);
  if (!name) throw businessError("Item name is required.");
  if (!categoryId || !category) throw businessError("A valid category is required.");
  if (normalizeItemType(category.type) !== itemType) throw businessError("Please select a category that belongs to the selected item type.");
  if (!isActive(category) && categoryId !== existing.categoryId) throw businessError("Archived categories cannot be selected for new item changes.");
  if (costPrice < 0 || sellingPrice < 0 || standardServiceCharge < 0) throw businessError("Prices cannot be negative.");
  const trackInventory = behavior.canTrackInventory ? boolValue(body.trackInventory, existing.trackInventory !== false) : false;
  const canBeProduced = behavior.canBeProduced && boolValue(body.canBeProduced, existing.canBeProduced || false);
  const hasBillOfMaterials = behavior.canHaveBillOfMaterials && canBeProduced && boolValue(body.hasBillOfMaterials, existing.hasBillOfMaterials || false);
  const allowDirectSale = boolValue(body.allowDirectSale, existing.allowDirectSale || (behavior.appearsInInvoices && itemType !== ITEM_TYPES.RAW_MATERIAL));
  const unitOfMeasure = trackInventory || itemType === ITEM_TYPES.SERVICE
    ? normalizeUnit(body.unitOfMeasure ?? existing.unitOfMeasure ?? behavior.defaultUnitOfMeasure)
    : "";
  return {
    itemTypeId: itemType,
    itemType,
    itemTypeSnapshotName: itemTypeLabel(db, itemType),
    categoryId,
    categorySnapshotName: category.name,
    name,
    invoiceDisplayName: cleanString(body.invoiceDisplayName ?? existing.invoiceDisplayName),
    sku: cleanString(body.sku ?? body.itemCode ?? existing.sku),
    description: cleanString(body.description ?? existing.description),
    unitOfMeasure,
    costPrice,
    sellingPrice,
    unitPrice: itemType === ITEM_TYPES.SERVICE ? standardServiceCharge : sellingPrice,
    standardServiceCharge,
    taxable: boolValue(body.taxable, existing.taxable || false),
    warrantyPeriod: cleanString(body.warrantyPeriod ?? existing.warrantyPeriod),
    trackInventory,
    canBeProduced,
    hasBillOfMaterials,
    allowDirectSale,
    status: normalizeRecordStatus(body.status ?? existing.status),
    imageFileId: cleanString(body.imageFileId ?? existing.imageFileId),
    notes: cleanString(body.notes ?? existing.notes)
  };
}

function saveProductBom(db, product, bomInput) {
  db.billOfMaterials = db.billOfMaterials.filter((item) => item.finishedProductId !== product.id);
  const productBehavior = itemTypeBehavior(db, product.itemType);
  if (!product.hasBillOfMaterials || !productBehavior.canHaveBillOfMaterials) return [];
  const rows = [];
  for (const row of bomInput) {
    const rawMaterialId = cleanString(row.rawMaterialId ?? row.productId);
    const material = findProduct(db, rawMaterialId);
    if (!material) continue;
    const materialBehavior = itemTypeBehavior(db, material.itemType);
    if (!materialBehavior.canBeUsedInProduction || normalizeItemType(material.itemType) === ITEM_TYPES.SERVICE) continue;
    const quantityRequired = cleanNumber(row.quantityRequired ?? row.quantity);
    if (quantityRequired <= 0) continue;
    rows.push({
      id: id("bom"),
      finishedProductId: product.id,
      rawMaterialId,
      quantityRequired,
      unitOfMeasure: normalizeUnit(row.unitOfMeasure ?? material.unitOfMeasure),
      wastagePercentage: Math.max(0, cleanNumber(row.wastagePercentage)),
      estimatedCost: cleanNumber(material.costPrice) * quantityRequired,
      notes: cleanString(row.notes),
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }
  db.billOfMaterials.unshift(...rows);
  return rows;
}

function enrichProduct(db, product) {
  const category = findCategory(db, product.categoryId) || null;
  const stock = findInventoryItem(db, product.id);
  const bom = db.billOfMaterials
    .filter((item) => item.finishedProductId === product.id)
    .map((item) => ({ ...item, material: findProduct(db, item.rawMaterialId) || null }));
  const normalizedType = normalizeItemType(product.itemType);
  return {
    ...product,
    itemType: normalizedType,
    itemTypeId: product.itemTypeId || normalizedType,
    itemTypeName: product.itemTypeSnapshotName || itemTypeLabel(db, normalizedType),
    displayItemType: product.itemTypeSnapshotName || itemTypeLabel(db, normalizedType),
    itemTypeBehavior: itemTypeBehavior(db, normalizedType),
    category,
    categoryName: category ? category.name : product.categorySnapshotName || "",
    stockStatus: product.trackInventory ? stockStatus(stock || {}) : "NOT_TRACKED",
    stock,
    bom
  };
}

function enrichInventory(db, item) {
  const synced = syncInventoryAliases({ ...item });
  const product = findProduct(db, item.productId) || null;
  const category = product ? findCategory(db, product.categoryId) || null : null;
  const locationName = storageLocationLabel(db, synced);
  return {
    ...synced,
    product,
    category,
    itemType: product ? normalizeItemType(product.itemType) : "",
    categoryName: category ? category.name : "",
    storageLocationName: locationName,
    displayStorageLocation: locationName
  };
}

route("GET", "/api/categories", async ({ db, query, res }) => {
  let categories = query.includeArchived === "true" ? db.productCategories : db.productCategories.filter(isActive);
  if (query.type) categories = categories.filter((category) => normalizeItemType(category.type) === normalizeItemType(query.type));
  sendJson(res, 200, { success: true, categories });
});

route("POST", "/api/categories", async ({ db, body, res }) => {
  const next = categoryPayload(body);
  if (!next.name) return sendError(res, 400, "Category name is required.");
  const duplicate = db.productCategories.find((item) => normalizeItemType(item.type) === next.type && cleanString(item.name).toLowerCase() === next.name.toLowerCase());
  if (duplicate && isActive(duplicate)) return sendError(res, 409, "Category already exists.");
  const category = { id: id("cat"), ...next, createdAt: nowIso(), archivedAt: null, deletedAt: null };
  db.productCategories.unshift(category);
  addActivity(db, "category_created", "category", category.id, `Category ${category.name} created.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, category });
});

route("PATCH", "/api/categories/:id", async ({ db, params, body, res }) => {
  const category = db.productCategories.find((item) => item.id === params.id);
  if (!category) return sendError(res, 404, "Category not found.");
  Object.assign(category, categoryPayload(body, category));
  addActivity(db, "category_updated", "category", category.id, `Category ${category.name} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, category });
});

route("PATCH", "/api/categories/:id/archive", async ({ db, params, res }) => {
  const category = db.productCategories.find((item) => item.id === params.id);
  if (!category) return sendError(res, 404, "Category not found.");
  category.status = "ARCHIVED";
  category.archivedAt = nowIso();
  category.updatedAt = nowIso();
  addActivity(db, "category_archived", "category", category.id, `Category ${category.name} archived.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, category });
});

route("PATCH", "/api/categories/:id/restore", async ({ db, params, res }) => {
  const category = db.productCategories.find((item) => item.id === params.id);
  if (!category) return sendError(res, 404, "Category not found.");
  category.status = "ACTIVE";
  category.archivedAt = null;
  category.deletedAt = null;
  category.updatedAt = nowIso();
  addActivity(db, "category_restored", "category", category.id, `Category ${category.name} restored.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, category });
});

function groupedMasterData(db, includeArchived = false) {
  ensureDefaultMasterData(db);
  const grouped = {};
  for (const type of Object.keys(MASTER_DATA_DEFINITIONS)) grouped[type] = [];
  for (const item of db.masterData || []) {
    if (!includeArchived && !isActive(item)) continue;
    const type = normalizeMasterDataType(item.type) || item.type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(item);
  }
  for (const rows of Object.values(grouped)) {
    rows.sort((a, b) => cleanNumber(a.sortOrder) - cleanNumber(b.sortOrder) || cleanString(a.label).localeCompare(cleanString(b.label)));
  }
  return grouped;
}

function masterDataPayload(body, existing = {}) {
  const type = normalizeMasterDataType(body.type ?? existing.type);
  if (!type) throw businessError("Choose a valid master data type.");
  const label = cleanString(body.label ?? existing.label);
  if (!label) throw businessError("Label is required.");
  const protectedValue = existing.isSystemDefault && existing.value;
  const value = protectedValue || cleanString(body.value ?? existing.value) || masterDataValue(type, label);
  if (!value) throw businessError("Value is required.");
  const payload = {
    type,
    value,
    label,
    description: cleanString(body.description ?? existing.description),
    status: normalizeRecordStatus(body.status ?? existing.status),
    sortOrder: cleanNumber(body.sortOrder ?? existing.sortOrder)
  };
  if (type === "itemTypes") {
    for (const field of ITEM_TYPE_BEHAVIOR_FIELDS) payload[field] = boolValue(body[field], existing[field] ?? false);
    payload.defaultUnitOfMeasure = normalizeUnit(body.defaultUnitOfMeasure ?? existing.defaultUnitOfMeasure ?? "piece");
  }
  if (type === "storageLocations") {
    payload.code = cleanString(body.code ?? existing.code);
    payload.isDefault = boolValue(body.isDefault, existing.isDefault || false);
  }
  if (type === "unitsOfMeasure") {
    payload.symbol = cleanString(body.symbol ?? existing.symbol);
    payload.isDefault = boolValue(body.isDefault, existing.isDefault || false);
  }
  return payload;
}

function enforceSingleMasterDefault(db, record) {
  if (!record || !record.isDefault || !["storageLocations", "unitsOfMeasure"].includes(record.type)) return;
  for (const item of db.masterData || []) {
    if (item.id !== record.id && item.type === record.type) item.isDefault = false;
  }
}

route("GET", "/api/master-data", async ({ db, query, res }) => {
  sendJson(res, 200, { success: true, masterData: groupedMasterData(db, query.includeArchived === "true") });
});

route("GET", "/api/master-data/:type", async ({ db, params, query, res }) => {
  const type = normalizeMasterDataType(params.type);
  if (!type) return sendError(res, 404, "Master data type not found.");
  const rows = groupedMasterData(db, query.includeArchived === "true")[type] || [];
  sendJson(res, 200, { success: true, type, items: rows });
});

route("POST", "/api/master-data", async ({ db, body, res }) => {
  const payload = masterDataPayload(body);
  const duplicate = db.masterData.find((item) => item.type === payload.type && cleanString(item.value).toLowerCase() === payload.value.toLowerCase());
  if (duplicate && isActive(duplicate)) return sendError(res, 409, "This master data value already exists.");
  const record = {
    id: id("md"),
    ...payload,
    isSystemDefault: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null,
    deletedAt: null
  };
  db.masterData.unshift(record);
  enforceSingleMasterDefault(db, record);
  addActivity(db, "master_data_created", "masterData", record.id, `${record.label} added to ${record.type}.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, item: record, masterData: groupedMasterData(db, true) });
});

route("PATCH", "/api/master-data/:id", async ({ db, params, body, res }) => {
  const record = db.masterData.find((item) => item.id === params.id);
  if (!record) return sendError(res, 404, "Master data record not found.");
  const payload = masterDataPayload({ ...body, type: record.type }, record);
  const duplicate = db.masterData.find(
    (item) => item.id !== record.id && item.type === payload.type && cleanString(item.value).toLowerCase() === payload.value.toLowerCase() && isActive(item)
  );
  if (duplicate) return sendError(res, 409, "This master data value already exists.");
  Object.assign(record, payload, { updatedAt: nowIso() });
  enforceSingleMasterDefault(db, record);
  addActivity(db, "master_data_updated", "masterData", record.id, `${record.label} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, item: record, masterData: groupedMasterData(db, true) });
});

route("PATCH", "/api/master-data/:id/archive", async ({ db, params, res }) => {
  const record = db.masterData.find((item) => item.id === params.id);
  if (!record) return sendError(res, 404, "Master data record not found.");
  if (record.isSystemDefault) return sendError(res, 400, "System defaults can be renamed but not archived.");
  record.status = "ARCHIVED";
  record.archivedAt = nowIso();
  record.updatedAt = nowIso();
  addActivity(db, "master_data_archived", "masterData", record.id, `${record.label} archived.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, item: record, masterData: groupedMasterData(db, true) });
});

route("PATCH", "/api/master-data/:id/restore", async ({ db, params, res }) => {
  const record = db.masterData.find((item) => item.id === params.id);
  if (!record) return sendError(res, 404, "Master data record not found.");
  record.status = "ACTIVE";
  record.archivedAt = null;
  record.deletedAt = null;
  record.updatedAt = nowIso();
  addActivity(db, "master_data_restored", "masterData", record.id, `${record.label} restored.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, item: record, masterData: groupedMasterData(db, true) });
});

route("POST", "/api/master-data/:type", async ({ db, params, body, res }) => {
  const type = normalizeMasterDataType(params.type);
  if (!type) return sendError(res, 404, "Master data type not found.");
  const payload = masterDataPayload({ ...body, type });
  const duplicate = db.masterData.find((item) => item.type === payload.type && cleanString(item.value).toLowerCase() === payload.value.toLowerCase());
  if (duplicate && isActive(duplicate)) return sendError(res, 409, "This master data value already exists.");
  const record = {
    id: id("md"),
    ...payload,
    isSystemDefault: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null,
    deletedAt: null
  };
  db.masterData.unshift(record);
  enforceSingleMasterDefault(db, record);
  addActivity(db, "master_data_created", "masterData", record.id, `${record.label} added to ${record.type}.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, item: record, masterData: groupedMasterData(db, true) });
});

route("PATCH", "/api/master-data/:type/:id", async ({ db, params, body, res }) => {
  const type = normalizeMasterDataType(params.type);
  if (!type) return sendError(res, 404, "Master data type not found.");
  const record = db.masterData.find((item) => item.id === params.id && item.type === type);
  if (!record) return sendError(res, 404, "Master data record not found.");
  const payload = masterDataPayload({ ...body, type }, record);
  const duplicate = db.masterData.find(
    (item) => item.id !== record.id && item.type === payload.type && cleanString(item.value).toLowerCase() === payload.value.toLowerCase() && isActive(item)
  );
  if (duplicate) return sendError(res, 409, "This master data value already exists.");
  Object.assign(record, payload, { updatedAt: nowIso() });
  enforceSingleMasterDefault(db, record);
  addActivity(db, "master_data_updated", "masterData", record.id, `${record.label} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, item: record, masterData: groupedMasterData(db, true) });
});

route("PATCH", "/api/master-data/:type/:id/archive", async ({ db, params, res }) => {
  const type = normalizeMasterDataType(params.type);
  if (!type) return sendError(res, 404, "Master data type not found.");
  const record = db.masterData.find((item) => item.id === params.id && item.type === type);
  if (!record) return sendError(res, 404, "Master data record not found.");
  if (record.isSystemDefault) return sendError(res, 400, "System defaults can be renamed but not archived.");
  record.status = "ARCHIVED";
  record.archivedAt = nowIso();
  record.updatedAt = nowIso();
  addActivity(db, "master_data_archived", "masterData", record.id, `${record.label} archived.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, item: record, masterData: groupedMasterData(db, true) });
});

route("PATCH", "/api/master-data/:type/:id/restore", async ({ db, params, res }) => {
  const type = normalizeMasterDataType(params.type);
  if (!type) return sendError(res, 404, "Master data type not found.");
  const record = db.masterData.find((item) => item.id === params.id && item.type === type);
  if (!record) return sendError(res, 404, "Master data record not found.");
  record.status = "ACTIVE";
  record.archivedAt = null;
  record.deletedAt = null;
  record.updatedAt = nowIso();
  addActivity(db, "master_data_restored", "masterData", record.id, `${record.label} restored.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, item: record, masterData: groupedMasterData(db, true) });
});

route("GET", "/api/item-types", async ({ db, query, res }) => {
  sendJson(res, 200, { success: true, itemTypes: groupedMasterData(db, query.includeArchived === "true").itemTypes || [] });
});

route("POST", "/api/item-types", async ({ db, body, res }) => {
  const payload = masterDataPayload({ ...body, type: "itemTypes" });
  const duplicate = db.masterData.find((item) => item.type === "itemTypes" && cleanString(item.value).toLowerCase() === payload.value.toLowerCase());
  if (duplicate && isActive(duplicate)) return sendError(res, 409, "This item type already exists.");
  const record = { id: id("md"), ...payload, isSystemDefault: false, createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null, deletedAt: null };
  db.masterData.unshift(record);
  addActivity(db, "item_type_created", "masterData", record.id, `${record.label} item type created.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, itemType: record });
});

route("PATCH", "/api/item-types/:id", async ({ db, params, body, res }) => {
  const record = db.masterData.find((item) => item.id === params.id && item.type === "itemTypes");
  if (!record) return sendError(res, 404, "Item type not found.");
  Object.assign(record, masterDataPayload({ ...body, type: "itemTypes" }, record), { updatedAt: nowIso() });
  addActivity(db, "item_type_updated", "masterData", record.id, `${record.label} item type updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, itemType: record });
});

route("PATCH", "/api/item-types/:id/archive", async ({ db, params, res }) => {
  const record = db.masterData.find((item) => item.id === params.id && item.type === "itemTypes");
  if (!record) return sendError(res, 404, "Item type not found.");
  if (record.isSystemDefault) return sendError(res, 400, "System default item types cannot be archived.");
  record.status = "ARCHIVED";
  record.archivedAt = nowIso();
  record.updatedAt = nowIso();
  await saveDb(db);
  sendJson(res, 200, { success: true, itemType: record });
});

route("PATCH", "/api/item-types/:id/restore", async ({ db, params, res }) => {
  const record = db.masterData.find((item) => item.id === params.id && item.type === "itemTypes");
  if (!record) return sendError(res, 404, "Item type not found.");
  record.status = "ACTIVE";
  record.archivedAt = null;
  record.deletedAt = null;
  record.updatedAt = nowIso();
  await saveDb(db);
  sendJson(res, 200, { success: true, itemType: record });
});

route("GET", "/api/products", async ({ db, query, res }) => {
  let products = listQuery(db.products, query, ["name", "sku", "invoiceDisplayName", "description"]).rows;
  if (query.itemType) products = products.filter((product) => normalizeItemType(product.itemType) === normalizeItemType(query.itemType));
  if (query.categoryId) products = products.filter((product) => product.categoryId === query.categoryId);
  if (query.sellable === "true") {
    products = products.filter((product) => normalizeItemType(product.itemType) !== ITEM_TYPES.RAW_MATERIAL || product.allowDirectSale || cleanNumber(product.sellingPrice) > 0);
  }
  sendJson(res, 200, { success: true, products: products.map((product) => enrichProduct(db, product)) });
});

route("POST", "/api/products", async ({ db, body, res }) => {
  const productData = normalizeProductPayload(db, body);
  if (productData.sku && db.products.some((item) => isActive(item) && cleanString(item.sku).toLowerCase() === productData.sku.toLowerCase())) {
    return sendError(res, 409, "SKU or item code already exists.");
  }
  const openingStock = cleanNumber(body.openingStockQuantity ?? body.openingStock ?? body.initialStock);
  if (openingStock < 0) return sendError(res, 400, "Opening stock cannot be negative.");
  const product = {
    id: id("prd"),
    ...productData,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null,
    deletedAt: null
  };
  db.products.unshift(product);
  const bomRows = saveProductBom(db, product, parseBomInput(body));
  if (product.trackInventory) {
    const inventory = ensureInventoryForProduct(db, product, {
      currentStock: 0,
      lowStockThreshold: cleanNumber(body.lowStockThreshold ?? db.businessSettings.lowStockThreshold ?? 5),
      reorderQuantity: cleanNumber(body.reorderQuantity),
      storageLocation: cleanString(body.storageLocation),
      notes: cleanString(body.inventoryNotes)
    });
    if (openingStock > 0) {
      changeInventoryStock(db, product.id, openingStock, "OPENING_STOCK", "PRODUCT", product.id, "Opening stock");
    } else {
      checkLowStock(db, inventory);
    }
  }
  addActivity(db, "product_created", "product", product.id, `${displayItemType(product.itemType)} ${product.name} created.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, product: enrichProduct(db, product), billOfMaterials: bomRows });
});

function productSelectRows(db, mode) {
  return db.products
    .filter(isActive)
    .map((product) => enrichProduct(db, product))
    .filter((product) => {
      const behavior = itemTypeBehavior(db, product.itemType);
      if (mode === "invoice") return behavior.appearsInInvoices && (normalizeItemType(product.itemType) !== ITEM_TYPES.RAW_MATERIAL || product.allowDirectSale || cleanNumber(product.sellingPrice) > 0);
      if (mode === "purchase") return behavior.appearsInPurchases;
      if (mode === "production-components") return behavior.canBeUsedInProduction && normalizeItemType(product.itemType) !== ITEM_TYPES.SERVICE;
      if (mode === "production-finished") return behavior.canBeProduced || behavior.canHaveBillOfMaterials || product.canBeProduced;
      return true;
    });
}

function skuPrefixFor(db, itemType, categoryId) {
  const category = findCategory(db, categoryId);
  const categoryNameText = cleanString(category && category.name).toUpperCase();
  if (categoryNameText.includes("HOB")) return "HOB";
  if (categoryNameText.includes("STOVE")) return "STV";
  if (categoryNameText.includes("HEATER")) return "HTR";
  if (categoryNameText.includes("GEYSER")) return "GYS";
  const type = normalizeItemType(itemType);
  return { FINISHED_PRODUCT: "PRD", RAW_MATERIAL: "RAW", SPARE_PART: "SPR", SERVICE: "SRV" }[type] || slug(type).slice(0, 4).toUpperCase() || "ITM";
}

route("GET", "/api/products/sku/suggest", async ({ db, query, res }) => {
  const prefix = skuPrefixFor(db, query.itemType || query.itemTypeId || ITEM_TYPES.FINISHED_PRODUCT, query.categoryId);
  const existing = new Set(db.products.map((product) => cleanString(product.sku).toUpperCase()).filter(Boolean));
  let counter = 1;
  let sku = "";
  do {
    sku = `${prefix}-${String(counter).padStart(3, "0")}`;
    counter += 1;
  } while (existing.has(sku));
  sendJson(res, 200, { success: true, sku });
});

route("GET", "/api/products/invoice-select", async ({ db, res }) => {
  sendJson(res, 200, { success: true, products: productSelectRows(db, "invoice") });
});

route("GET", "/api/products/purchase-select", async ({ db, res }) => {
  sendJson(res, 200, { success: true, products: productSelectRows(db, "purchase") });
});

route("GET", "/api/products/production-components", async ({ db, res }) => {
  sendJson(res, 200, { success: true, products: productSelectRows(db, "production-components") });
});

route("GET", "/api/products/production-finished", async ({ db, res }) => {
  sendJson(res, 200, { success: true, products: productSelectRows(db, "production-finished") });
});

route("GET", "/api/products/:id", async ({ db, params, res }) => {
  const product = db.products.find((item) => item.id === params.id);
  if (!product) return sendError(res, 404, "Product not found.");
  sendJson(res, 200, { success: true, product: enrichProduct(db, product) });
});

route("GET", "/api/products/:id/bom", async ({ db, params, res }) => {
  const product = db.products.find((item) => item.id === params.id);
  if (!product) return sendError(res, 404, "Product not found.");
  const rows = db.billOfMaterials
    .filter((item) => item.finishedProductId === product.id)
    .map((item) => ({ ...item, material: findProduct(db, item.rawMaterialId) || null }));
  sendJson(res, 200, { success: true, billOfMaterials: rows, product: enrichProduct(db, product) });
});

route("POST", "/api/products/:id/bom", async ({ db, params, body, res }) => {
  const product = db.products.find((item) => item.id === params.id);
  if (!product) return sendError(res, 404, "Product not found.");
  product.canBeProduced = true;
  product.hasBillOfMaterials = true;
  const rows = saveProductBom(db, product, parseBomInput(body));
  product.updatedAt = nowIso();
  addActivity(db, "bom_updated", "product", product.id, `Bill of materials updated for ${product.name}.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, billOfMaterials: rows, product: enrichProduct(db, product) });
});

route("PATCH", "/api/products/:id/bom", async ({ db, params, body, res }) => {
  const product = db.products.find((item) => item.id === params.id);
  if (!product) return sendError(res, 404, "Product not found.");
  product.canBeProduced = true;
  product.hasBillOfMaterials = true;
  const rows = saveProductBom(db, product, parseBomInput(body));
  product.updatedAt = nowIso();
  addActivity(db, "bom_updated", "product", product.id, `Bill of materials updated for ${product.name}.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, billOfMaterials: rows, product: enrichProduct(db, product) });
});

route("DELETE", "/api/products/:id/bom/:bomItemId", async ({ db, params, res }) => {
  const product = db.products.find((item) => item.id === params.id);
  if (!product) return sendError(res, 404, "Product not found.");
  const before = db.billOfMaterials.length;
  db.billOfMaterials = db.billOfMaterials.filter((item) => !(item.finishedProductId === product.id && item.id === params.bomItemId));
  if (before === db.billOfMaterials.length) return sendError(res, 404, "BOM item not found.");
  product.updatedAt = nowIso();
  addActivity(db, "bom_item_removed", "product", product.id, `Bill of materials row removed for ${product.name}.`);
  await saveDb(db);
  sendJson(res, 200, { success: true });
});

route("PATCH", "/api/products/:id", async ({ db, params, body, res }) => {
  const product = db.products.find((item) => item.id === params.id);
  if (!product) return sendError(res, 404, "Product not found.");
  const nextItemType = normalizeItemType(body.itemType ?? product.itemType);
  if (nextItemType !== normalizeItemType(product.itemType) && productHasBusinessHistory(db, product.id)) {
    return sendError(res, 400, "This item has business history. Item type cannot be changed safely. Archive this item and create a new one instead.");
  }
  const productData = normalizeProductPayload(db, body, product);
  if (productData.sku && db.products.some((item) => item.id !== product.id && isActive(item) && cleanString(item.sku).toLowerCase() === productData.sku.toLowerCase())) {
    return sendError(res, 409, "SKU or item code already exists.");
  }
  Object.assign(product, productData, { updatedAt: nowIso() });
  if (!product.trackInventory) {
    const inventory = db.inventory.find((item) => item.productId === product.id && isActive(item));
    if (inventory) {
      inventory.status = "ARCHIVED";
      inventory.archivedAt = nowIso();
      inventory.updatedAt = nowIso();
    }
  } else {
    ensureInventoryForProduct(db, product, {
      lowStockThreshold: cleanNumber(body.lowStockThreshold ?? db.businessSettings.lowStockThreshold ?? 5),
      reorderQuantity: cleanNumber(body.reorderQuantity),
      storageLocation: cleanString(body.storageLocation)
    });
  }
  const bomRows = saveProductBom(db, product, parseBomInput(body));
  addActivity(db, "product_updated", "product", product.id, `${product.name} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, product: enrichProduct(db, product), billOfMaterials: bomRows });
});

route("PATCH", "/api/products/:id/archive", async ({ db, params, res }) => {
  const product = db.products.find((item) => item.id === params.id);
  if (!product) return sendError(res, 404, "Product not found.");
  product.status = "ARCHIVED";
  product.archivedAt = nowIso();
  product.updatedAt = nowIso();
  addActivity(db, "product_archived", "product", product.id, `${product.name} archived.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, product });
});

route("PATCH", "/api/products/:id/restore", async ({ db, params, res }) => {
  const product = db.products.find((item) => item.id === params.id);
  if (!product) return sendError(res, 404, "Product not found.");
  product.status = "ACTIVE";
  product.archivedAt = null;
  product.deletedAt = null;
  product.updatedAt = nowIso();
  addActivity(db, "product_restored", "product", product.id, `${product.name} restored.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, product: enrichProduct(db, product) });
});

route("GET", "/api/inventory", async ({ db, query, res }) => {
  let inventory = db.inventory.filter(isActive).map((item) => enrichInventory(db, item));
  if (query.itemType) inventory = inventory.filter((item) => normalizeItemType(item.itemType) === normalizeItemType(query.itemType));
  if (query.categoryId) inventory = inventory.filter((item) => item.product && item.product.categoryId === query.categoryId);
  if (query.storageLocation) inventory = inventory.filter((item) => inventoryMatchesStorageLocation(db, item, query.storageLocation));
  if (query.status) inventory = inventory.filter((item) => item.status === cleanString(query.status).toUpperCase());
  if (query.lowStock === "true") inventory = inventory.filter((item) => item.status === "LOW_STOCK" || item.status === "OUT_OF_STOCK");
  if (query.search) {
    const term = cleanString(query.search).toLowerCase();
    inventory = inventory.filter((item) => [item.product?.name, item.product?.sku, item.storageLocation, item.storageLocationSnapshotName, item.storageLocationName].some((value) => cleanString(value).toLowerCase().includes(term)));
  }
  sendJson(res, 200, { success: true, inventory });
});

route("GET", "/api/inventory/:id", async ({ db, params, query, res }) => {
  if (params.id === "history") {
    let history = db.inventoryMovements || [];
    if (query.productId) history = history.filter((item) => item.productId === query.productId);
    return sendJson(res, 200, { success: true, history: history.slice(0, 200) });
  }
  if (params.id === "low-stock") {
    const lowStock = db.inventory.filter(isActive).map((item) => syncInventoryAliases(item)).filter((item) => item.status === "LOW_STOCK" || item.status === "OUT_OF_STOCK");
    return sendJson(res, 200, { success: true, lowStock });
  }
  if (params.id === "value") {
    return sendJson(res, 200, { success: true, value: inventoryValue(db) });
  }
  const item = db.inventory.find((entry) => entry.id === params.id);
  if (!item) return sendError(res, 404, "Inventory record not found.");
  sendJson(res, 200, { success: true, inventory: enrichInventory(db, item) });
});

route("POST", "/api/inventory", async ({ db, body, res }) => {
  const product = findProduct(db, cleanString(body.productId));
  if (!product) return sendError(res, 404, "Product not found.");
  if (!isTrackableProduct(product)) return sendError(res, 400, "Service items do not use inventory records.");
  const item = ensureInventoryForProduct(db, product, {
    currentStock: cleanNumber(body.currentStock),
    lowStockThreshold: cleanNumber(body.lowStockThreshold ?? db.businessSettings.lowStockThreshold ?? 5),
    reorderQuantity: cleanNumber(body.reorderQuantity),
    storageLocation: cleanString(body.storageLocation),
    notes: cleanString(body.notes)
  });
  addActivity(db, "inventory_created", "inventory", item.id, `Inventory record created for ${product.name}.`);
  checkLowStock(db, item);
  await saveDb(db);
  sendJson(res, 201, { success: true, inventory: enrichInventory(db, item) });
});

route("PATCH", "/api/inventory/:id", async ({ db, params, body, res }) => {
  const item = db.inventory.find((entry) => entry.id === params.id);
  if (!item) return sendError(res, 404, "Inventory record not found.");
  Object.assign(item, {
    lowStockThreshold: cleanNumber(body.lowStockThreshold ?? item.lowStockThreshold),
    reorderQuantity: cleanNumber(body.reorderQuantity ?? item.reorderQuantity),
    notes: cleanString(body.notes ?? item.notes),
    updatedAt: nowIso()
  });
  if (body.storageLocation !== undefined || body.storageLocationId !== undefined) {
    applyInventoryLocation(item, db, body.storageLocation ?? body.storageLocationId, item);
  }
  syncInventoryAliases(item);
  addActivity(db, "inventory_updated", "inventory", item.id, "Inventory settings updated.");
  checkLowStock(db, item);
  await saveDb(db);
  sendJson(res, 200, { success: true, inventory: enrichInventory(db, item) });
});

route("PATCH", "/api/inventory/:id/threshold", async ({ db, params, body, res }) => {
  const item = db.inventory.find((entry) => entry.id === params.id);
  if (!item) return sendError(res, 404, "Inventory record not found.");
  item.lowStockThreshold = Math.max(0, cleanNumber(body.lowStockThreshold));
  item.reorderQuantity = Math.max(0, cleanNumber(body.reorderQuantity ?? item.reorderQuantity));
  item.updatedAt = nowIso();
  syncInventoryAliases(item);
  addActivity(db, "inventory_threshold_updated", "inventory", item.id, "Inventory threshold updated.");
  checkLowStock(db, item);
  await saveDb(db);
  sendJson(res, 200, { success: true, inventory: enrichInventory(db, item) });
});

route("PATCH", "/api/inventory/:id/location", async ({ db, params, body, res }) => {
  const item = db.inventory.find((entry) => entry.id === params.id);
  if (!item) return sendError(res, 404, "Inventory record not found.");
  applyInventoryLocation(item, db, body.storageLocation ?? body.storageLocationId, item);
  item.updatedAt = nowIso();
  addActivity(db, "inventory_location_updated", "inventory", item.id, "Inventory location updated.");
  await saveDb(db);
  sendJson(res, 200, { success: true, inventory: enrichInventory(db, item) });
});

route("POST", "/api/inventory/adjustments", async ({ db, body, res }) => {
  const productId = cleanString(body.productId);
  const movementType = cleanString(body.movementType).toUpperCase().replaceAll(" ", "_");
  const quantity = cleanNumber(body.quantity);
  const reason = cleanString(body.reason);
  if (!productId || !movementType || quantity < 0) return sendError(res, 400, "Product, movement type, and a non-negative quantity are required.");
  if (!reason) return sendError(res, 400, "Reason is required for stock adjustments.");
  let item;
  if (movementType === "MANUAL_CORRECTION") {
    item = correctInventoryStock(db, productId, quantity, reason, cleanString(body.notes));
  } else {
    const movementMap = {
      ADD_STOCK: ["ADJUSTMENT_IN", quantity],
      ADJUSTMENT_IN: ["ADJUSTMENT_IN", quantity],
      REMOVE_STOCK: ["ADJUSTMENT_OUT", -quantity],
      ADJUSTMENT_OUT: ["ADJUSTMENT_OUT", -quantity],
      MARK_DAMAGED: ["DAMAGED", -quantity],
      DAMAGED: ["DAMAGED", -quantity],
      RETURN_STOCK: ["RETURN_IN", quantity],
      RETURN_IN: ["RETURN_IN", quantity]
    };
    const mapped = movementMap[movementType];
    if (!mapped) return sendError(res, 400, "Invalid movement type.");
    item = changeInventoryStock(db, productId, mapped[1], mapped[0], "ADJUSTMENT", "", reason, cleanString(body.notes));
  }
  addActivity(db, "inventory_adjusted", "inventory", item.id, reason);
  await saveDb(db);
  sendJson(res, 201, { success: true, inventory: enrichInventory(db, item) });
});

route("GET", "/api/inventory/history", async ({ db, query, res }) => {
  let history = db.inventoryMovements || [];
  if (query.productId) history = history.filter((item) => item.productId === query.productId);
  sendJson(res, 200, { success: true, history: history.slice(0, 200) });
});

route("GET", "/api/inventory/:id/history", async ({ db, params, res }) => {
  const item = db.inventory.find((entry) => entry.id === params.id);
  if (!item) return sendError(res, 404, "Inventory record not found.");
  const history = (db.inventoryMovements || []).filter((movement) => movement.inventoryItemId === item.id || movement.productId === item.productId);
  sendJson(res, 200, { success: true, history: history.slice(0, 200), inventory: enrichInventory(db, item) });
});

route("GET", "/api/inventory/low-stock", async ({ db, res }) => {
  const lowStock = db.inventory.filter(isActive).map((item) => syncInventoryAliases(item)).filter((item) => item.status === "LOW_STOCK" || item.status === "OUT_OF_STOCK");
  sendJson(res, 200, { success: true, lowStock });
});

route("GET", "/api/inventory/value", async ({ db, res }) => {
  sendJson(res, 200, { success: true, value: inventoryValue(db) });
});

function productionPlan(db, finishedProductId, quantityProduced) {
  const finishedProduct = findProduct(db, finishedProductId);
  if (!finishedProduct || !itemTypeBehavior(db, finishedProduct.itemType).canBeProduced) {
    throw businessError("Choose a finished product for production.");
  }
  const quantity = cleanNumber(quantityProduced);
  if (quantity <= 0) throw businessError("Production quantity must be greater than zero.");
  const bom = db.billOfMaterials.filter((item) => item.finishedProductId === finishedProduct.id);
  if (!bom.length) throw businessError("This finished product does not have a bill of materials.");
  const materials = bom.map((row) => {
    const material = findProduct(db, row.rawMaterialId);
    if (material && !itemTypeBehavior(db, material.itemType).canBeUsedInProduction) throw businessError(`${material.name} cannot be used in production.`);
    const inventory = material ? findInventoryItem(db, material.id) : null;
    const wastage = cleanNumber(row.wastagePercentage) / 100;
    const quantityRequired = cleanNumber(row.quantityRequired) * quantity;
    const quantityUsed = quantityRequired + quantityRequired * wastage;
    const availableQuantity = cleanNumber(inventory && inventory.availableStock);
    return {
      rawMaterialId: row.rawMaterialId,
      material,
      quantityRequired,
      quantityUsed,
      unitOfMeasure: row.unitOfMeasure || (material && material.unitOfMeasure) || "piece",
      costPerUnit: cleanNumber(material && material.costPrice),
      totalCost: cleanNumber(material && material.costPrice) * quantityUsed,
      availableQuantity,
      shortageQuantity: Math.max(0, quantityUsed - availableQuantity)
    };
  });
  return {
    finishedProduct,
    quantityProduced: quantity,
    materials,
    estimatedCost: materials.reduce((sum, item) => sum + item.totalCost, 0),
    hasShortage: materials.some((item) => item.shortageQuantity > 0)
  };
}

function enrichProductionBatch(db, batch) {
  const product = findProduct(db, batch.finishedProductId) || null;
  const materials = db.productionMaterialUsages
    .filter((item) => item.productionBatchId === batch.id)
    .map((item) => ({ ...item, material: findProduct(db, item.rawMaterialId) || null }));
  return { ...batch, finishedProduct: product, materials };
}

function completeProductionBatch(db, batch) {
  if (batch.status === "COMPLETED") return batch;
  const plan = productionPlan(db, batch.finishedProductId, batch.quantityProduced);
  if (plan.hasShortage) {
    addNotification(db, "production_shortage", "Production blocked", `${plan.finishedProduct.name} cannot be produced because materials are short.`, "production", batch.id);
    throw businessError("Raw materials are insufficient for this production batch.");
  }
  db.productionMaterialUsages = db.productionMaterialUsages.filter((item) => item.productionBatchId !== batch.id);
  for (const material of plan.materials) {
    changeInventoryStock(db, material.rawMaterialId, -material.quantityUsed, "MATERIAL_USED", "PRODUCTION", batch.id, `Production ${batch.batchNumber}`);
    db.productionMaterialUsages.unshift({
      id: id("pmu"),
      productionBatchId: batch.id,
      rawMaterialId: material.rawMaterialId,
      quantityRequired: material.quantityRequired,
      quantityUsed: material.quantityUsed,
      unitOfMeasure: material.unitOfMeasure,
      costPerUnit: material.costPerUnit,
      totalCost: material.totalCost,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }
  changeInventoryStock(db, batch.finishedProductId, cleanNumber(batch.quantityProduced), "PRODUCTION_IN", "PRODUCTION", batch.id, `Production ${batch.batchNumber}`);
  batch.status = "COMPLETED";
  batch.estimatedCost = plan.estimatedCost;
  batch.completedAt = nowIso();
  batch.updatedAt = nowIso();
  addNotification(db, "production_completed", "Production completed", `${batch.batchNumber} completed for ${plan.finishedProduct.name}.`, "production", batch.id);
  addActivity(db, "production_completed", "production", batch.id, `Production batch ${batch.batchNumber} completed.`);
  return batch;
}

route("GET", "/api/production", async ({ db, res }) => {
  const production = db.productionBatches.filter(isActive).map((batch) => enrichProductionBatch(db, batch));
  sendJson(res, 200, { success: true, production });
});

route("POST", "/api/production", async ({ db, body, res }) => {
  const plan = productionPlan(db, cleanString(body.finishedProductId), cleanNumber(body.quantityProduced));
  if (plan.hasShortage) {
    addNotification(db, "production_shortage", "Raw material shortage", `${plan.finishedProduct.name} needs more raw materials before production.`, "production", "");
    return sendJson(res, 409, { success: false, message: "Raw materials are insufficient.", shortages: plan.materials.filter((item) => item.shortageQuantity > 0) });
  }
  const batch = {
    id: id("prdctn"),
    batchNumber: makeNumber(getBranding(db).productionPrefix || "PRD", db.productionBatches.length),
    finishedProductId: plan.finishedProduct.id,
    quantityProduced: plan.quantityProduced,
    productionDate: cleanDate(body.productionDate),
    status: "DRAFT",
    estimatedCost: plan.estimatedCost,
    notes: cleanString(body.notes),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null
  };
  db.productionBatches.unshift(batch);
  if (body.completeNow !== false && body.status !== "DRAFT") completeProductionBatch(db, batch);
  else addActivity(db, "production_created", "production", batch.id, `Production batch ${batch.batchNumber} created.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, production: enrichProductionBatch(db, batch) });
});

route("GET", "/api/production/:id", async ({ db, params, res }) => {
  const batch = db.productionBatches.find((item) => item.id === params.id);
  if (!batch) return sendError(res, 404, "Production batch not found.");
  sendJson(res, 200, { success: true, production: enrichProductionBatch(db, batch) });
});

route("PATCH", "/api/production/:id/complete", async ({ db, params, res }) => {
  const batch = db.productionBatches.find((item) => item.id === params.id);
  if (!batch) return sendError(res, 404, "Production batch not found.");
  completeProductionBatch(db, batch);
  await saveDb(db);
  sendJson(res, 200, { success: true, production: enrichProductionBatch(db, batch) });
});

route("PATCH", "/api/production/:id/cancel", async ({ db, params, res }) => {
  const batch = db.productionBatches.find((item) => item.id === params.id);
  if (!batch) return sendError(res, 404, "Production batch not found.");
  if (batch.status === "COMPLETED") return sendError(res, 400, "Completed production batches cannot be cancelled safely.");
  batch.status = "CANCELLED";
  batch.deletedAt = nowIso();
  batch.updatedAt = nowIso();
  addActivity(db, "production_cancelled", "production", batch.id, `Production batch ${batch.batchNumber} cancelled.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, production: batch });
});

function enrichSupplier(db, supplier) {
  const purchases = db.purchases.filter((purchase) => isActive(purchase) && purchase.supplierId === supplier.id);
  return {
    ...supplier,
    totalPurchases: purchases.length,
    purchaseTotal: purchases.reduce((sum, purchase) => sum + cleanNumber(purchase.totalAmount), 0),
    outstandingBalance: purchases.reduce((sum, purchase) => sum + cleanNumber(purchase.balanceAmount), 0)
  };
}

route("GET", "/api/suppliers", async ({ db, query, res }) => {
  const suppliers = listQuery(db.suppliers, query, ["name", "phone", "email", "contactPerson"]).rows.map((supplier) => enrichSupplier(db, supplier));
  sendJson(res, 200, { success: true, suppliers });
});

route("POST", "/api/suppliers", async ({ db, body, res }) => {
  if (!cleanString(body.name)) return sendError(res, 400, "Supplier name is required.");
  const supplier = {
    id: id("sup"),
    name: cleanString(body.name),
    phone: cleanString(body.phone),
    email: cleanString(body.email),
    address: cleanString(body.address),
    contactPerson: cleanString(body.contactPerson),
    notes: cleanString(body.notes),
    status: "ACTIVE",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null,
    deletedAt: null
  };
  db.suppliers.unshift(supplier);
  addActivity(db, "supplier_created", "supplier", supplier.id, `Supplier ${supplier.name} created.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, supplier: enrichSupplier(db, supplier) });
});

route("GET", "/api/suppliers/:id", async ({ db, params, res }) => {
  const supplier = db.suppliers.find((item) => item.id === params.id);
  if (!supplier) return sendError(res, 404, "Supplier not found.");
  const purchases = db.purchases.filter((purchase) => isActive(purchase) && purchase.supplierId === supplier.id);
  sendJson(res, 200, { success: true, supplier: enrichSupplier(db, supplier), purchases });
});

route("PATCH", "/api/suppliers/:id", async ({ db, params, body, res }) => {
  const supplier = db.suppliers.find((item) => item.id === params.id);
  if (!supplier) return sendError(res, 404, "Supplier not found.");
  Object.assign(supplier, {
    name: cleanString(body.name ?? supplier.name),
    phone: cleanString(body.phone ?? supplier.phone),
    email: cleanString(body.email ?? supplier.email),
    address: cleanString(body.address ?? supplier.address),
    contactPerson: cleanString(body.contactPerson ?? supplier.contactPerson),
    notes: cleanString(body.notes ?? supplier.notes),
    status: normalizeRecordStatus(body.status ?? supplier.status),
    updatedAt: nowIso()
  });
  addActivity(db, "supplier_updated", "supplier", supplier.id, `Supplier ${supplier.name} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, supplier: enrichSupplier(db, supplier) });
});

route("PATCH", "/api/suppliers/:id/archive", async ({ db, params, res }) => {
  const supplier = db.suppliers.find((item) => item.id === params.id);
  if (!supplier) return sendError(res, 404, "Supplier not found.");
  supplier.status = "ARCHIVED";
  supplier.archivedAt = nowIso();
  supplier.updatedAt = nowIso();
  addActivity(db, "supplier_archived", "supplier", supplier.id, `Supplier ${supplier.name} archived.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, supplier });
});

function normalizePurchaseItems(db, items) {
  if (!Array.isArray(items) || !items.length) throw businessError("At least one purchase item is required.");
  return items.map((item) => {
    const product = findProduct(db, cleanString(item.productId));
    const behavior = product ? itemTypeBehavior(db, product.itemType) : null;
    if (!product || !behavior.appearsInPurchases) throw businessError("This item type is not configured to appear in purchases.");
    const quantity = cleanNumber(item.quantity);
    const unitCost = cleanNumber(item.unitCost ?? item.costPrice);
    if (quantity <= 0 || unitCost < 0) throw businessError("Purchase quantity must be positive and unit cost cannot be negative.");
    return {
      productId: product.id,
      itemName: product.name,
      itemTypeName: itemTypeLabel(db, product.itemType),
      sku: cleanString(product.sku),
      unitOfMeasure: cleanString(product.unitOfMeasure),
      quantity,
      unitCost,
      lineTotal: quantity * unitCost
    };
  });
}

function enrichPurchase(db, purchase) {
  return {
    ...purchase,
    supplier: db.suppliers.find((item) => item.id === purchase.supplierId) || null,
    items: (purchase.items || []).map((item) => ({ ...item, product: findProduct(db, item.productId) || null }))
  };
}

function receivePurchase(db, purchase) {
  if (purchase.status === "RECEIVED" && purchase.receivedAt) return purchase;
  for (const item of purchase.items || []) {
    const product = findProduct(db, item.productId);
    const behavior = product ? itemTypeBehavior(db, product.itemType) : {};
    if (isTrackableProduct(product) && behavior.affectsInventoryOnPurchase !== false) {
      changeInventoryStock(db, item.productId, cleanNumber(item.quantity), "PURCHASE_IN", "PURCHASE", purchase.id, `Purchase ${purchase.purchaseNumber}`);
    }
  }
  purchase.status = "RECEIVED";
  purchase.receivedAt = nowIso();
  purchase.updatedAt = nowIso();
  addNotification(db, "purchase_received", "Purchase received", `${purchase.purchaseNumber} added stock to inventory.`, "purchase", purchase.id);
  addActivity(db, "purchase_received", "purchase", purchase.id, `Purchase ${purchase.purchaseNumber} received.`);
  return purchase;
}

route("GET", "/api/purchases", async ({ db, query, res }) => {
  let purchases = db.purchases.filter(isActive);
  if (query.supplierId) purchases = purchases.filter((purchase) => purchase.supplierId === query.supplierId);
  if (query.status) purchases = purchases.filter((purchase) => purchase.status === cleanString(query.status).toUpperCase());
  if (query.from || query.to) purchases = purchases.filter((purchase) => dateInRange(purchase.purchaseDate || purchase.createdAt, query.from, query.to));
  sendJson(res, 200, { success: true, purchases: purchases.map((purchase) => enrichPurchase(db, purchase)) });
});

route("POST", "/api/purchases", async ({ db, body, res }) => {
  const items = normalizePurchaseItems(db, body.items);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = cleanNumber(body.discount);
  const tax = cleanNumber(body.tax);
  const totalAmount = Math.max(0, subtotal - discount + tax);
  const paidAmount = Math.max(0, cleanNumber(body.paidAmount));
  const purchase = {
    id: id("pur"),
    purchaseNumber: makeNumber(getBranding(db).purchasePrefix || "PUR", db.purchases.length),
    supplierId: cleanString(body.supplierId),
    purchaseDate: cleanDate(body.purchaseDate),
    status: cleanString(body.status || "RECEIVED").toUpperCase(),
    items,
    subtotal,
    discount,
    tax,
    totalAmount,
    paidAmount,
    balanceAmount: Math.max(0, totalAmount - paidAmount),
    notes: cleanString(body.notes),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null
  };
  db.purchases.unshift(purchase);
  if (purchase.status === "RECEIVED") receivePurchase(db, purchase);
  else addActivity(db, "purchase_created", "purchase", purchase.id, `Purchase ${purchase.purchaseNumber} created.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, purchase: enrichPurchase(db, purchase) });
});

route("GET", "/api/purchases/:id", async ({ db, params, res }) => {
  const purchase = db.purchases.find((item) => item.id === params.id);
  if (!purchase) return sendError(res, 404, "Purchase not found.");
  sendJson(res, 200, { success: true, purchase: enrichPurchase(db, purchase) });
});

route("PATCH", "/api/purchases/:id", async ({ db, params, body, res }) => {
  const purchase = db.purchases.find((item) => item.id === params.id);
  if (!purchase) return sendError(res, 404, "Purchase not found.");
  if (purchase.status === "RECEIVED" && purchase.receivedAt) return sendError(res, 400, "Received purchases cannot be edited safely.");
  const items = body.items ? normalizePurchaseItems(db, body.items) : purchase.items;
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = cleanNumber(body.discount ?? purchase.discount);
  const tax = cleanNumber(body.tax ?? purchase.tax);
  const totalAmount = Math.max(0, subtotal - discount + tax);
  const paidAmount = Math.max(0, cleanNumber(body.paidAmount ?? purchase.paidAmount));
  Object.assign(purchase, {
    supplierId: cleanString(body.supplierId ?? purchase.supplierId),
    purchaseDate: cleanDate(body.purchaseDate ?? purchase.purchaseDate),
    items,
    subtotal,
    discount,
    tax,
    totalAmount,
    paidAmount,
    balanceAmount: Math.max(0, totalAmount - paidAmount),
    notes: cleanString(body.notes ?? purchase.notes),
    updatedAt: nowIso()
  });
  addActivity(db, "purchase_updated", "purchase", purchase.id, `Purchase ${purchase.purchaseNumber} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, purchase: enrichPurchase(db, purchase) });
});

route("PATCH", "/api/purchases/:id/receive", async ({ db, params, res }) => {
  const purchase = db.purchases.find((item) => item.id === params.id);
  if (!purchase) return sendError(res, 404, "Purchase not found.");
  receivePurchase(db, purchase);
  await saveDb(db);
  sendJson(res, 200, { success: true, purchase: enrichPurchase(db, purchase) });
});

route("PATCH", "/api/purchases/:id/cancel", async ({ db, params, res }) => {
  const purchase = db.purchases.find((item) => item.id === params.id);
  if (!purchase) return sendError(res, 404, "Purchase not found.");
  if (purchase.status === "RECEIVED" && purchase.receivedAt) return sendError(res, 400, "Received purchases cannot be cancelled safely.");
  purchase.status = "CANCELLED";
  purchase.deletedAt = nowIso();
  purchase.updatedAt = nowIso();
  addActivity(db, "purchase_cancelled", "purchase", purchase.id, `Purchase ${purchase.purchaseNumber} cancelled.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, purchase });
});

function currentProductInvoicePrice(product) {
  if (!product) return 0;
  return normalizeItemType(product.itemType) === ITEM_TYPES.SERVICE
    ? cleanNumber(product.standardServiceCharge || product.unitPrice || product.sellingPrice)
    : cleanNumber(product.sellingPrice || product.unitPrice);
}

function invoicePriceChanges(db, invoice) {
  if (!invoice || invoice.status !== "DRAFT") return [];
  return (invoice.items || [])
    .map((item, index) => {
      const product = item.productId ? findProduct(db, item.productId) : null;
      if (!product) return null;
      const latestUnitPrice = currentProductInvoicePrice(product);
      const invoiceUnitPrice = cleanNumber(item.unitPrice);
      if (Math.abs(latestUnitPrice - invoiceUnitPrice) < 0.001) return null;
      return {
        index,
        productId: product.id,
        itemName: item.itemName || product.invoiceDisplayName || product.name,
        invoiceUnitPrice,
        latestUnitPrice
      };
    })
    .filter(Boolean);
}

function invoicePaymentStatus(totalAmount, paidAmount) {
  const total = cleanNumber(totalAmount);
  const paid = cleanNumber(paidAmount);
  if (paid <= 0) return "UNPAID";
  if (paid + 0.001 < total) return "PARTIAL";
  return "PAID";
}

function recalculateInvoiceTotals(invoice) {
  invoice.items = (invoice.items || []).map((item) => ({
    ...item,
    quantity: cleanNumber(item.quantity),
    unitPrice: cleanNumber(item.unitPrice),
    lineTotal: cleanNumber(item.quantity) * cleanNumber(item.unitPrice)
  }));
  invoice.subtotal = invoice.items.reduce((sum, item) => sum + cleanNumber(item.lineTotal), 0);
  invoice.totalAmount = Math.max(0, cleanNumber(invoice.subtotal) - cleanNumber(invoice.discount) + cleanNumber(invoice.tax));
  invoice.balanceAmount = Math.max(0, cleanNumber(invoice.totalAmount) - cleanNumber(invoice.paidAmount));
  invoice.paymentStatus = invoicePaymentStatus(invoice.totalAmount, invoice.paidAmount);
  invoice.updatedAt = nowIso();
  return invoice;
}

function normalizeInvoiceItems(db, items, options = {}) {
  if (!Array.isArray(items) || !items.length) throw businessError("At least one invoice item is required.");
  const useCurrentPricing = options.useCurrentPricing !== false;
  return items.map((item) => {
    const product = item.productId ? findProduct(db, cleanString(item.productId)) : null;
    if (item.productId && !product) throw businessError("Invoice product not found.");
    if (product) {
      const behavior = itemTypeBehavior(db, product.itemType);
      const type = normalizeItemType(product.itemType);
      const rawSaleBlocked = type === ITEM_TYPES.RAW_MATERIAL && !product.allowDirectSale && cleanNumber(product.sellingPrice) <= 0;
      if (!behavior.appearsInInvoices) throw businessError(`${product.name} is not configured to appear on invoices.`);
      if (rawSaleBlocked) throw businessError("Raw materials can only be sold when direct sale is enabled or selling price is set.");
    }
    const quantity = cleanNumber(item.quantity);
    const requestedUnitPrice = cleanNumber(item.unitPrice ?? (product ? currentProductInvoicePrice(product) : 0));
    const unitPrice = product && useCurrentPricing ? currentProductInvoicePrice(product) : requestedUnitPrice;
    if (quantity <= 0 || unitPrice < 0) throw businessError("Invoice quantity must be positive and unit price cannot be negative.");
    return {
      productId: product ? product.id : "",
      itemName: cleanString(item.itemName ?? item.productName ?? (product && (product.invoiceDisplayName || product.name)) ?? "Invoice item"),
      itemType: product ? normalizeItemType(product.itemType) : "SERVICE",
      itemTypeName: product ? itemTypeLabel(db, product.itemType) : cleanString(item.itemTypeName || "Service"),
      categoryName: product ? categoryName(db, product.categoryId) : cleanString(item.categoryName),
      sku: product ? cleanString(product.sku) : cleanString(item.sku),
      unitOfMeasure: product ? cleanString(product.unitOfMeasure) : cleanString(item.unitOfMeasure),
      description: cleanString(item.description),
      quantity,
      unitPrice,
      lineTotal: quantity * unitPrice
    };
  });
}

function refreshInvoicePaymentStatus(db, invoice) {
  const paidAmount = activePayments(db)
    .filter((payment) => payment.invoiceId === invoice.id && payment.status !== "VOIDED" && payment.status !== "REFUNDED")
    .reduce((sum, payment) => sum + cleanNumber(payment.amount), 0);
  invoice.paidAmount = paidAmount;
  invoice.totalAmount = invoiceTotal(invoice);
  invoice.balanceAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount);
  invoice.paymentStatus = invoicePaymentStatus(invoice.totalAmount, invoice.paidAmount);
  if (invoice.status !== "DRAFT" && invoice.status !== "CANCELLED") {
    if (invoice.dueDate && invoice.dueDate < todayDate() && invoice.balanceAmount > 0) invoice.status = "OVERDUE";
    else invoice.status = "ISSUED";
  }
  invoice.updatedAt = nowIso();
  return invoice;
}

function enrichInvoice(db, invoice) {
  refreshInvoicePaymentStatus(db, invoice);
  const priceChanges = invoicePriceChanges(db, invoice);
  return {
    ...invoice,
    hasPriceChanges: priceChanges.length > 0,
    priceChanges,
    customer: findCustomer(db, invoice.customerId) || null,
    items: (invoice.items || []).map((item) => ({ ...item, product: item.productId ? findProduct(db, item.productId) || null : null }))
  };
}

function issueInvoice(db, invoice) {
  if (invoice.status === "CANCELLED") throw businessError("Cancelled invoices cannot be issued.");
  if (invoice.issuedAt) return refreshInvoicePaymentStatus(db, invoice);
  for (const item of invoice.items || []) {
    if (!item.productId) continue;
    const product = findProduct(db, item.productId);
    const behavior = product ? itemTypeBehavior(db, product.itemType) : {};
    if (isTrackableProduct(product) && behavior.affectsInventoryOnInvoice !== false) {
      changeInventoryStock(db, item.productId, -cleanNumber(item.quantity), "SALE_OUT", "INVOICE", invoice.id, `Invoice ${invoice.invoiceNumber}`);
    }
  }
  invoice.status = "ISSUED";
  invoice.issuedAt = nowIso();
  refreshInvoicePaymentStatus(db, invoice);
  if (invoice.balanceAmount > 0) addNotification(db, "invoice_unpaid", "Invoice unpaid", `${invoice.invoiceNumber} has a balance of ${formatMoney(db, invoice.balanceAmount)}.`, "invoice", invoice.id);
  addActivity(db, "invoice_issued", "invoice", invoice.id, `Invoice ${invoice.invoiceNumber} issued.`);
  return invoice;
}

route("GET", "/api/invoices", async ({ db, query, res }) => {
  let invoices = activeInvoices(db);
  if (query.customerId) invoices = invoices.filter((invoice) => invoice.customerId === query.customerId);
  if (query.status) invoices = invoices.filter((invoice) => invoice.status === cleanString(query.status).toUpperCase());
  if (query.from || query.to) invoices = invoices.filter((invoice) => dateInRange(invoice.invoiceDate || invoice.createdAt, query.from, query.to));
  sendJson(res, 200, { success: true, invoices: invoices.map((invoice) => enrichInvoice(db, invoice)) });
});

route("POST", "/api/invoices", async ({ db, body, res }) => {
  if (!findCustomer(db, cleanString(body.customerId))) return sendError(res, 404, "Customer not found.");
  const items = normalizeInvoiceItems(db, body.items, { useCurrentPricing: true });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = cleanNumber(body.discount);
  const tax = cleanNumber(body.tax);
  const totalAmount = Math.max(0, subtotal - discount + tax);
  const invoice = {
    id: id("inv"),
    invoiceNumber: makeNumber(getBranding(db).invoicePrefix || "INV", db.invoices.length),
    customerId: cleanString(body.customerId),
    orderId: cleanString(body.orderId),
    invoiceDate: cleanDate(body.invoiceDate),
    dueDate: cleanString(body.dueDate),
    status: cleanString(body.status || "DRAFT").toUpperCase(),
    items,
    subtotal,
    discount,
    tax,
    totalAmount,
    paidAmount: 0,
    balanceAmount: totalAmount,
    paymentStatus: "UNPAID",
    notes: cleanString(body.notes),
    terms: cleanString(body.terms) || getBranding(db).invoiceTerms || getBranding(db).terms || "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null
  };
  db.invoices.unshift(invoice);
  if (body.issueNow || invoice.status === "ISSUED") issueInvoice(db, invoice);
  else addActivity(db, "invoice_created", "invoice", invoice.id, `Invoice ${invoice.invoiceNumber} created.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, invoice: enrichInvoice(db, invoice) });
});

route("GET", "/api/invoices/:id", async ({ db, params, res }) => {
  const invoice = db.invoices.find((item) => item.id === params.id);
  if (!invoice) return sendError(res, 404, "Invoice not found.");
  sendJson(res, 200, { success: true, invoice: enrichInvoice(db, invoice) });
});

route("PATCH", "/api/invoices/:id", async ({ db, params, body, res }) => {
  const invoice = db.invoices.find((item) => item.id === params.id);
  if (!invoice) return sendError(res, 404, "Invoice not found.");
  if (invoice.issuedAt) return sendError(res, 400, "Issued invoices cannot be edited. Cancel and recreate if needed.");
  const items = body.items ? normalizeInvoiceItems(db, body.items, { useCurrentPricing: body.updatePrices === true }) : invoice.items;
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = cleanNumber(body.discount ?? invoice.discount);
  const tax = cleanNumber(body.tax ?? invoice.tax);
  Object.assign(invoice, {
    customerId: cleanString(body.customerId ?? invoice.customerId),
    invoiceDate: cleanDate(body.invoiceDate ?? invoice.invoiceDate),
    dueDate: cleanString(body.dueDate ?? invoice.dueDate),
    items,
    subtotal,
    discount,
    tax,
    totalAmount: Math.max(0, subtotal - discount + tax),
    notes: cleanString(body.notes ?? invoice.notes),
    terms: cleanString(body.terms ?? invoice.terms),
    updatedAt: nowIso()
  });
  refreshInvoicePaymentStatus(db, invoice);
  addActivity(db, "invoice_updated", "invoice", invoice.id, `Invoice ${invoice.invoiceNumber} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, invoice: enrichInvoice(db, invoice) });
});

route("PATCH", "/api/invoices/:id/refresh-prices", async ({ db, params, res }) => {
  const invoice = db.invoices.find((item) => item.id === params.id);
  if (!invoice) return sendError(res, 404, "Invoice not found.");
  if (invoice.status !== "DRAFT" || invoice.issuedAt) return sendError(res, 400, "Only draft invoices can refresh product prices.");
  const changes = invoicePriceChanges(db, invoice);
  invoice.items = normalizeInvoiceItems(db, invoice.items, { useCurrentPricing: true });
  recalculateInvoiceTotals(invoice);
  addActivity(db, "invoice_prices_refreshed", "invoice", invoice.id, `Draft invoice ${invoice.invoiceNumber} prices refreshed.`, { changes });
  await saveDb(db);
  sendJson(res, 200, { success: true, invoice: enrichInvoice(db, invoice), changes });
});

route("PATCH", "/api/invoices/:id/issue", async ({ db, params, res }) => {
  const invoice = db.invoices.find((item) => item.id === params.id);
  if (!invoice) return sendError(res, 404, "Invoice not found.");
  issueInvoice(db, invoice);
  await saveDb(db);
  sendJson(res, 200, { success: true, invoice: enrichInvoice(db, invoice) });
});

route("PATCH", "/api/invoices/:id/cancel", async ({ db, params, res }) => {
  const invoice = db.invoices.find((item) => item.id === params.id);
  if (!invoice) return sendError(res, 404, "Invoice not found.");
  if (invoice.issuedAt) return sendError(res, 400, "Issued invoices cannot be cancelled without a stock reversal workflow.");
  invoice.status = "CANCELLED";
  invoice.deletedAt = nowIso();
  invoice.updatedAt = nowIso();
  addActivity(db, "invoice_cancelled", "invoice", invoice.id, `Invoice ${invoice.invoiceNumber} cancelled.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, invoice });
});

function invoicePrintBody(db, invoice) {
  const customer = findCustomer(db, invoice.customerId) || {};
  const rows = (invoice.items || [])
    .map(
      (item) =>
        `<tr><td><strong>${escapeHtml(item.itemName)}</strong></td><td>${escapeHtml(item.description)}</td><td>${formatQuantity(item.quantity)}</td><td>${escapeHtml(item.unitOfMeasure || "")}</td><td>${formatMoney(db, item.unitPrice)}</td><td>${formatMoney(db, item.lineTotal)}</td></tr>`
    )
    .join("");
  const settings = getBranding(db);
  return `
    <section class="doc-title-row">
      <div>
        <h2>Invoice</h2>
        <div class="muted">${escapeHtml(invoice.invoiceNumber)}</div>
      </div>
      <div class="doc-meta">
        <div class="meta-item"><span>Invoice Date</span><br><strong>${escapeHtml(invoice.invoiceDate)}</strong></div>
        <div class="meta-item"><span>Due Date</span><br><strong>${escapeHtml(invoice.dueDate || "N/A")}</strong></div>
        <div class="meta-item"><span>Invoice Status</span><br><strong>${escapeHtml(invoice.status)}</strong></div>
        <div class="meta-item"><span>Payment Status</span><br><strong>${escapeHtml(invoice.paymentStatus || invoicePaymentStatus(invoice.totalAmount, invoice.paidAmount))}</strong></div>
        <div class="meta-item"><span>Balance</span><br><strong>${formatMoney(db, invoice.balanceAmount)}</strong></div>
      </div>
    </section>
    <section class="info-grid">
      <div class="doc-box"><h3>Bill To</h3><strong>${escapeHtml(customer.name || "")}</strong><br>${escapeHtml(customer.phone || "")}<br>${escapeHtml(customer.email || "")}<br>${escapeHtml(customer.address || "")}</div>
      <div class="doc-box"><h3>Payment Instructions</h3>${escapeHtml(settings.paymentInstructions || "Please pay the outstanding balance by the due date.")}</div>
    </section>
    <table><thead><tr><th>Item</th><th>Description</th><th>Quantity</th><th>Unit</th><th>Unit Price</th><th>Line Total</th></tr></thead><tbody>${rows}</tbody></table>
    <section class="totals">
      <div class="total-row"><span>Subtotal</span><strong>${formatMoney(db, invoice.subtotal)}</strong></div>
      <div class="total-row"><span>Discount</span><strong>${formatMoney(db, invoice.discount)}</strong></div>
      <div class="total-row"><span>Tax</span><strong>${formatMoney(db, invoice.tax)}</strong></div>
      <div class="total-row grand"><span>Total</span><strong>${formatMoney(db, invoice.totalAmount)}</strong></div>
      <div class="total-row"><span>Paid</span><strong>${formatMoney(db, invoice.paidAmount)}</strong></div>
      <div class="total-row"><span>Balance</span><strong>${formatMoney(db, invoice.balanceAmount)}</strong></div>
    </section>
    <p class="muted">${escapeHtml(invoice.terms || settings.invoiceTerms || "")}</p>
  `;
}

route("GET", "/api/invoices/:id/print", async ({ db, params, res }) => {
  const invoice = db.invoices.find((item) => item.id === params.id);
  if (!invoice) return sendError(res, 404, "Invoice not found.");
  refreshInvoicePaymentStatus(db, invoice);
  sendText(res, 200, printableHtml(db, `Invoice ${invoice.invoiceNumber}`, invoicePrintBody(db, invoice)), "text/html; charset=utf-8");
});

route("GET", "/api/invoices/:id/pdf", async ({ db, params, res }) => {
  const document = invoicePdfDocument(db, params.id);
  if (!document) return sendError(res, 404, "Invoice not found.");
  sendPdf(res, document.title, document.lines, document.fileName, db);
});

route("GET", "/api/orders", async ({ db, query, res }) => {
  let orders = activeOrders(db);
  if (query.status) orders = orders.filter((order) => order.status === query.status);
  if (query.customerId) orders = orders.filter((order) => order.customerId === query.customerId);
  if (query.from || query.to) orders = orders.filter((order) => dateInRange(order.orderDate, query.from, query.to));
  orders = orders.map((order) => ({ ...order, customer: findCustomer(db, order.customerId) || null, total: orderTotal(order) }));
  sendJson(res, 200, { success: true, orders });
});

route("POST", "/api/orders", async ({ db, body, res }) => {
  const errors = requireFields(body, ["customerId", "items"]);
  if (!Array.isArray(body.items) || body.items.length === 0) errors.items = "At least one item is required.";
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Customer and items are required.", errors });
  const order = {
    id: id("ord"),
    orderNumber: makeNumber(getBranding(db).orderPrefix || "ORD", db.orders.length),
    customerId: cleanString(body.customerId),
    items: body.items.map((item) => ({
      productId: cleanString(item.productId),
      productName: cleanString(item.productName) || ((findProduct(db, item.productId) || {}).name || "Product"),
      quantity: cleanNumber(item.quantity),
      unitPrice: cleanNumber(item.unitPrice)
    })),
    discount: cleanNumber(body.discount),
    tax: cleanNumber(body.tax),
    deliveryAddress: cleanString(body.deliveryAddress),
    paymentStatus: cleanString(body.paymentStatus) || "unpaid",
    deliveryStatus: cleanString(body.deliveryStatus) || "pending",
    status: "active",
    notes: cleanString(body.notes),
    orderDate: cleanDate(body.orderDate),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null
  };
  db.orders.unshift(order);
  for (const item of order.items) {
    applyInventoryDelta(db, item.productId, { current: -item.quantity }, `Order ${order.orderNumber}`, "order", order.id);
  }
  addNotification(db, "order_created", "New order created", `${order.orderNumber} was created.`, "order", order.id);
  addActivity(db, "order_created", "order", order.id, `Order ${order.orderNumber} created.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, order: { ...order, total: orderTotal(order) } });
});

route("GET", "/api/orders/:id", async ({ db, params, res }) => {
  const order = db.orders.find((item) => item.id === params.id);
  if (!order) return sendError(res, 404, "Order not found.");
  sendJson(res, 200, {
    success: true,
    order: { ...order, customer: findCustomer(db, order.customerId) || null, total: orderTotal(order) },
    deliveries: db.deliveries.filter((item) => isActive(item) && item.orderId === order.id),
    payments: activePayments(db).filter((item) => item.orderId === order.id),
    activity: db.activityLogs.filter((item) => item.entityType === "order" && item.entityId === order.id)
  });
});

route("PATCH", "/api/orders/:id", async ({ db, params, body, res }) => {
  const order = db.orders.find((item) => item.id === params.id);
  if (!order) return sendError(res, 404, "Order not found.");
  Object.assign(order, {
    deliveryAddress: cleanString(body.deliveryAddress ?? order.deliveryAddress),
    paymentStatus: cleanString(body.paymentStatus ?? order.paymentStatus),
    deliveryStatus: cleanString(body.deliveryStatus ?? order.deliveryStatus),
    status: cleanString(body.status ?? order.status),
    notes: cleanString(body.notes ?? order.notes),
    orderDate: cleanDate(body.orderDate ?? order.orderDate),
    discount: cleanNumber(body.discount ?? order.discount),
    tax: cleanNumber(body.tax ?? order.tax),
    updatedAt: nowIso()
  });
  addActivity(db, "order_updated", "order", order.id, `Order ${order.orderNumber} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, order: { ...order, total: orderTotal(order) } });
});

route("PATCH", "/api/orders/:id/cancel", async ({ db, params, res }) => {
  const order = db.orders.find((item) => item.id === params.id);
  if (!order) return sendError(res, 404, "Order not found.");
  if (order.status !== "cancelled") {
    order.status = "cancelled";
    order.cancelledAt = nowIso();
    for (const item of order.items || []) {
      applyInventoryDelta(db, item.productId, { current: item.quantity }, `Cancelled ${order.orderNumber}`, "order", order.id);
    }
  }
  addNotification(db, "order_cancelled", "Order cancelled", `${order.orderNumber} was cancelled.`, "order", order.id);
  addActivity(db, "order_cancelled", "order", order.id, `Order ${order.orderNumber} cancelled.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, order });
});

route("POST", "/api/orders/:id/repeat", async ({ db, params, res }) => {
  const original = db.orders.find((item) => item.id === params.id);
  if (!original) return sendError(res, 404, "Order not found.");
  const order = {
    ...original,
    id: id("ord"),
    orderNumber: makeNumber(getBranding(db).orderPrefix || "ORD", db.orders.length),
    status: "active",
    paymentStatus: "unpaid",
    deliveryStatus: "pending",
    orderDate: todayDate(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null,
    cancelledAt: null,
    notes: `Repeated from ${original.orderNumber}. ${original.notes || ""}`.trim()
  };
  db.orders.unshift(order);
  for (const item of order.items || []) {
    applyInventoryDelta(db, item.productId, { current: -item.quantity }, `Repeated order ${order.orderNumber}`, "order", order.id);
  }
  addActivity(db, "order_repeated", "order", order.id, `Order ${original.orderNumber} repeated as ${order.orderNumber}.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, order: { ...order, total: orderTotal(order) } });
});

route("POST", "/api/orders/repeat/:customerId", async ({ db, params, res }) => {
  const latest = activeOrders(db)
    .filter((order) => order.customerId === params.customerId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (!latest) return sendError(res, 404, "No previous order found for this customer.");
  const fakeParams = { id: latest.id };
  await routes.find((item) => item.method === "POST" && item.pattern === "/api/orders/:id/repeat").handler({ db, params: fakeParams, res });
});

route("GET", "/api/orders/:id/invoice", async ({ db, params, res }) => {
  const order = db.orders.find((item) => item.id === params.id);
  if (!order) return sendError(res, 404, "Order not found.");
  sendJson(res, 200, { success: true, invoice: { order: { ...order, total: orderTotal(order) }, customer: findCustomer(db, order.customerId), branding: getBranding(db) } });
});

route("GET", "/api/orders/:id/invoice/print", async ({ db, params, res }) => {
  const order = db.orders.find((item) => item.id === params.id);
  if (!order) return sendError(res, 404, "Order not found.");
  const customer = findCustomer(db, order.customerId) || {};
  const rows = (order.items || [])
    .map((item) => `<tr><td>${escapeHtml(item.productName)}</td><td>${currency(item.quantity)}</td><td>${currency(item.unitPrice)}</td><td>${currency(cleanNumber(item.quantity) * cleanNumber(item.unitPrice))}</td></tr>`)
    .join("");
  sendText(res, 200, printableHtml(db, `Invoice ${order.orderNumber}`, `<h2>Invoice ${escapeHtml(order.orderNumber)}</h2><p><strong>Customer:</strong> ${escapeHtml(customer.name || "")}<br><strong>Phone:</strong> ${escapeHtml(customer.phone || "")}<br><strong>Date:</strong> ${escapeHtml(order.orderDate)}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p>Discount: ${currency(order.discount)}<br>Tax: ${currency(order.tax)}</p><p class="total">Invoice Total: ${currency(orderTotal(order))}</p>`), "text/html; charset=utf-8");
});

route("GET", "/api/deliveries", async ({ db, query, res }) => {
  let deliveries = db.deliveries.filter(isActive);
  if (query.status) deliveries = deliveries.filter((item) => item.status === query.status);
  if (query.customerId) deliveries = deliveries.filter((item) => item.customerId === query.customerId);
  if (query.from || query.to) deliveries = deliveries.filter((item) => dateInRange(item.scheduledDate, query.from, query.to));
  deliveries = deliveries.map((item) => ({ ...item, customer: findCustomer(db, item.customerId) || null, order: db.orders.find((order) => order.id === item.orderId) || null }));
  sendJson(res, 200, { success: true, deliveries });
});

route("POST", "/api/deliveries", async ({ db, body, res }) => {
  const errors = requireFields(body, ["orderId"]);
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Order is required.", errors });
  const order = db.orders.find((item) => item.id === body.orderId);
  if (!order) return sendError(res, 404, "Order not found.");
  const delivery = {
    id: id("del"),
    deliveryNumber: makeNumber(getBranding(db).deliveryPrefix || "DEL", db.deliveries.length),
    orderId: order.id,
    customerId: order.customerId,
    address: cleanString(body.address) || order.deliveryAddress,
    status: cleanString(body.status) || "scheduled",
    scheduledDate: cleanDate(body.scheduledDate),
    completedDate: "",
    notes: cleanString(body.notes),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null
  };
  order.deliveryStatus = delivery.status;
  db.deliveries.unshift(delivery);
  addNotification(db, "delivery_created", "Delivery created", `${delivery.deliveryNumber} was created.`, "delivery", delivery.id);
  addActivity(db, "delivery_created", "delivery", delivery.id, `Delivery ${delivery.deliveryNumber} created.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, delivery });
});

route("GET", "/api/deliveries/:id", async ({ db, params, res }) => {
  const delivery = db.deliveries.find((item) => item.id === params.id);
  if (!delivery) return sendError(res, 404, "Delivery not found.");
  sendJson(res, 200, { success: true, delivery, customer: findCustomer(db, delivery.customerId), order: db.orders.find((item) => item.id === delivery.orderId) });
});

route("PATCH", "/api/deliveries/:id", async ({ db, params, body, res }) => {
  const delivery = db.deliveries.find((item) => item.id === params.id);
  if (!delivery) return sendError(res, 404, "Delivery not found.");
  Object.assign(delivery, {
    address: cleanString(body.address ?? delivery.address),
    status: cleanString(body.status ?? delivery.status),
    scheduledDate: cleanDate(body.scheduledDate ?? delivery.scheduledDate),
    completedDate: cleanString(body.completedDate ?? delivery.completedDate),
    notes: cleanString(body.notes ?? delivery.notes),
    updatedAt: nowIso()
  });
  addActivity(db, "delivery_updated", "delivery", delivery.id, `Delivery ${delivery.deliveryNumber} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, delivery });
});

route("PATCH", "/api/deliveries/:id/status", async ({ db, params, body, res }) => {
  const delivery = db.deliveries.find((item) => item.id === params.id);
  if (!delivery) return sendError(res, 404, "Delivery not found.");
  delivery.status = cleanString(body.status) || delivery.status;
  delivery.completedDate = delivery.status === "completed" ? cleanDate(body.completedDate || todayDate()) : delivery.completedDate;
  delivery.updatedAt = nowIso();
  const order = db.orders.find((item) => item.id === delivery.orderId);
  if (order) order.deliveryStatus = delivery.status;
  addNotification(db, "delivery_status", "Delivery status updated", `${delivery.deliveryNumber} is now ${delivery.status}.`, "delivery", delivery.id);
  addActivity(db, "delivery_status_updated", "delivery", delivery.id, `Delivery ${delivery.deliveryNumber} status changed to ${delivery.status}.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, delivery });
});

function normalizePaymentMethod(value) {
  const method = cleanString(value || "CASH").toUpperCase().replaceAll(" ", "_");
  if (["CASH", "BANK_TRANSFER", "CARD", "MOBILE_WALLET", "OTHER", "BANK", "JAZZCASH", "EASYPAISA"].includes(method)) return method;
  return /^[A-Z0-9_]{2,40}$/.test(method) ? method : "OTHER";
}

function enrichPayment(db, payment) {
  return {
    ...payment,
    method: payment.paymentMethod || payment.method,
    customer: findCustomer(db, payment.customerId) || null,
    invoice: db.invoices.find((invoice) => invoice.id === payment.invoiceId) || null,
    order: db.orders.find((order) => order.id === payment.orderId) || null
  };
}

route("GET", "/api/payments", async ({ db, query, res }) => {
  let payments = activePayments(db);
  if (query.customerId) payments = payments.filter((item) => item.customerId === query.customerId);
  if (query.invoiceId) payments = payments.filter((item) => item.invoiceId === query.invoiceId);
  if (query.method) payments = payments.filter((item) => normalizePaymentMethod(item.paymentMethod || item.method) === normalizePaymentMethod(query.method));
  if (query.from || query.to) payments = payments.filter((item) => dateInRange(item.paymentDate, query.from, query.to));
  sendJson(res, 200, { success: true, payments: payments.map((payment) => enrichPayment(db, payment)) });
});

route("POST", "/api/payments", async ({ db, body, res }) => {
  const invoice = body.invoiceId ? db.invoices.find((item) => item.id === cleanString(body.invoiceId) && isActive(item) && item.status !== "CANCELLED") : null;
  const requestedCustomerId = cleanString(body.customerId);
  const customerId = invoice ? invoice.customerId : requestedCustomerId;
  const amount = cleanNumber(body.amount);
  if (!customerId || amount <= 0) return sendError(res, 400, "Customer and a positive payment amount are required.");
  if (!findCustomer(db, customerId)) return sendError(res, 404, "Customer not found.");
  if (body.invoiceId && !invoice) return sendError(res, 404, "Invoice not found.");
  if (invoice && requestedCustomerId && requestedCustomerId !== invoice.customerId) return sendError(res, 400, "Selected invoice belongs to a different customer.");
  if (invoice) {
    refreshInvoicePaymentStatus(db, invoice);
    if (!boolValue(body.allowOverpayment, false) && amount > cleanNumber(invoice.balanceAmount) + 0.001) {
      return sendError(res, 400, `Payment exceeds invoice balance of ${formatMoney(db, invoice.balanceAmount)}.`);
    }
  }
  const previousBalance = customerBalance(db, customerId);
  const invoicePreviousBalance = invoice ? cleanNumber(invoice.balanceAmount) : 0;
  const invoicePaidBefore = invoice ? cleanNumber(invoice.paidAmount) : 0;
  const payment = {
    id: id("pay"),
    paymentNumber: makeNumber("PAY", db.payments.length),
    receiptNumber: makeNumber(getBranding(db).receiptPrefix || "RCT", db.payments.length),
    customerId,
    invoiceId: invoice ? invoice.id : "",
    orderId: cleanString(body.orderId || (invoice && invoice.orderId)),
    amount,
    paymentMethod: normalizePaymentMethod(body.paymentMethod || body.method),
    method: normalizePaymentMethod(body.paymentMethod || body.method),
    paymentDate: cleanDate(body.paymentDate),
    previousBalance,
    remainingBalance: Math.max(0, previousBalance - amount),
    invoiceTotalAmount: invoice ? cleanNumber(invoice.totalAmount) : 0,
    invoicePaidBefore,
    invoicePreviousBalance,
    invoiceRemainingBalance: invoice ? Math.max(0, invoicePreviousBalance - amount) : 0,
    notes: cleanString(body.notes),
    status: "COMPLETED",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null
  };
  db.payments.unshift(payment);
  if (invoice) refreshInvoicePaymentStatus(db, invoice);
  const order = db.orders.find((item) => item.id === payment.orderId);
  if (order) {
    const paidForOrder = activePayments(db).filter((item) => item.orderId === order.id).reduce((sum, item) => sum + cleanNumber(item.amount), 0);
    const total = orderTotal(order);
    order.paymentStatus = paidForOrder >= total ? "paid" : paidForOrder > 0 ? "partial" : "unpaid";
  }
  const customer = findCustomer(db, customerId);
  if (customer) {
    customer.currentBalance = customerBalance(db, customer.id);
    customer.lastPaymentAt = payment.paymentDate;
    customer.updatedAt = nowIso();
  }
  addNotification(db, "payment_received", "Payment received", `${payment.receiptNumber} for ${formatMoney(db, payment.amount)} received.`, "payment", payment.id);
  addActivity(db, "payment_created", "payment", payment.id, `Payment ${payment.receiptNumber} recorded.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, payment: enrichPayment(db, payment) });
});

route("GET", "/api/payments/:id", async ({ db, params, res }) => {
  const payment = db.payments.find((item) => item.id === params.id);
  if (!payment) return sendError(res, 404, "Payment not found.");
  sendJson(res, 200, { success: true, payment: enrichPayment(db, payment) });
});

route("PATCH", "/api/payments/:id", async ({ db, params, body, res }) => {
  const payment = db.payments.find((item) => item.id === params.id);
  if (!payment) return sendError(res, 404, "Payment not found.");
  if (payment.status !== "COMPLETED") return sendError(res, 400, "Only completed payments can be updated.");
  Object.assign(payment, {
    paymentMethod: normalizePaymentMethod(body.paymentMethod ?? body.method ?? payment.paymentMethod),
    method: normalizePaymentMethod(body.paymentMethod ?? body.method ?? payment.method),
    paymentDate: cleanDate(body.paymentDate ?? payment.paymentDate),
    notes: cleanString(body.notes ?? payment.notes),
    updatedAt: nowIso()
  });
  const invoice = db.invoices.find((item) => item.id === payment.invoiceId);
  if (invoice) refreshInvoicePaymentStatus(db, invoice);
  addActivity(db, "payment_updated", "payment", payment.id, `Payment ${payment.receiptNumber} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, payment: enrichPayment(db, payment) });
});

route("PATCH", "/api/payments/:id/void", async ({ db, params, res }) => {
  const payment = db.payments.find((item) => item.id === params.id);
  if (!payment) return sendError(res, 404, "Payment not found.");
  payment.status = "VOIDED";
  payment.updatedAt = nowIso();
  const invoice = db.invoices.find((item) => item.id === payment.invoiceId);
  if (invoice) refreshInvoicePaymentStatus(db, invoice);
  const customer = findCustomer(db, payment.customerId);
  if (customer) {
    customer.currentBalance = customerBalance(db, customer.id);
    customer.updatedAt = nowIso();
  }
  addActivity(db, "payment_voided", "payment", payment.id, `Payment ${payment.receiptNumber} voided.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, payment: enrichPayment(db, payment) });
});

route("GET", "/api/payments/:id/receipt", async ({ db, params, res }) => {
  const payment = db.payments.find((item) => item.id === params.id);
  if (!payment) return sendError(res, 404, "Payment not found.");
  sendJson(res, 200, { success: true, receipt: { payment: enrichPayment(db, payment), branding: getBranding(db) } });
});

function receiptPrintBody(db, payment) {
  const enriched = enrichPayment(db, payment);
  const customer = enriched.customer || {};
  if (enriched.invoice) refreshInvoicePaymentStatus(db, enriched.invoice);
  const method = titleCaseEnum(payment.paymentMethod || payment.method);
  return `
    <section class="doc-title-row">
      <div>
        <h2>Payment Receipt</h2>
        <div class="muted">${escapeHtml(payment.receiptNumber)}</div>
      </div>
      <div class="doc-meta">
        <div class="meta-item"><span>Payment Date</span><br><strong>${escapeHtml(payment.paymentDate)}</strong></div>
        <div class="meta-item"><span>Method</span><br><strong>${escapeHtml(method)}</strong></div>
        <div class="meta-item"><span>Invoice</span><br><strong>${escapeHtml(enriched.invoice?.invoiceNumber || "N/A")}</strong></div>
        <div class="meta-item"><span>Status</span><br><strong>${escapeHtml(payment.status || "COMPLETED")}</strong></div>
      </div>
    </section>
    <section class="info-grid">
      <div class="doc-box"><h3>Customer</h3><strong>${escapeHtml(customer.name || "")}</strong><br>${escapeHtml(customer.phone || "")}<br>${escapeHtml(customer.address || "")}</div>
      <div class="doc-box"><h3>Receipt Details</h3>Receipt Number: ${escapeHtml(payment.receiptNumber)}<br>Linked Invoice: ${escapeHtml(enriched.invoice?.invoiceNumber || "N/A")}</div>
    </section>
    <div class="amount-highlight">Amount Received: ${formatMoney(db, payment.amount)}</div>
    <table><tbody>
      <tr><td>Previous Balance</td><td>${formatMoney(db, payment.previousBalance)}</td></tr>
      <tr><td>Amount Received</td><td>${formatMoney(db, payment.amount)}</td></tr>
      <tr><td>Remaining Customer Balance</td><td>${formatMoney(db, customerBalance(db, payment.customerId))}</td></tr>
      ${enriched.invoice ? `<tr><td>Invoice Balance Before Payment</td><td>${formatMoney(db, payment.invoicePreviousBalance ?? enriched.invoice.totalAmount)}</td></tr>` : ""}
      ${enriched.invoice ? `<tr><td>Invoice Balance After Payment</td><td>${formatMoney(db, payment.invoiceRemainingBalance ?? enriched.invoice.balanceAmount)}</td></tr>` : ""}
    </tbody></table>
    <p class="muted">${escapeHtml(payment.notes || "")}</p>
  `;
}

route("GET", "/api/payments/:id/receipt/print", async ({ db, params, res }) => {
  const payment = db.payments.find((item) => item.id === params.id);
  if (!payment) return sendError(res, 404, "Payment not found.");
  sendText(res, 200, printableHtml(db, `Receipt ${payment.receiptNumber}`, receiptPrintBody(db, payment)), "text/html; charset=utf-8");
});

route("GET", "/api/payments/:id/receipt/pdf", async ({ db, params, res }) => {
  const document = receiptPdfDocument(db, params.id);
  if (!document) return sendError(res, 404, "Payment not found.");
  sendPdf(res, document.title, document.lines, document.fileName, db);
});

route("GET", "/api/expenses", async ({ db, query, res }) => {
  let expenses = activeExpenses(db);
  if (query.category) expenses = expenses.filter((item) => item.category === query.category);
  if (query.from || query.to) expenses = expenses.filter((item) => dateInRange(item.expenseDate, query.from, query.to));
  sendJson(res, 200, { success: true, expenses });
});

route("POST", "/api/expenses", async ({ db, body, res }) => {
  const errors = requireFields(body, ["title", "amount"]);
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Expense title and amount are required.", errors });
  const paymentMethod = normalizePaymentMethod(body.paymentMethod || body.method || "CASH");
  const expense = {
    id: id("exp"),
    title: cleanString(body.title),
    category: cleanString(body.category) || "general",
    amount: cleanNumber(body.amount),
    paymentMethod,
    method: paymentMethod,
    expenseDate: cleanDate(body.expenseDate),
    receiptFileId: cleanString(body.receiptFileId),
    receiptFileName: cleanString(body.receiptFileName),
    notes: cleanString(body.notes),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null
  };
  db.expenses.unshift(expense);
  addNotification(db, "expense_added", "Expense added", `${expense.title} for ${currency(expense.amount)} added.`, "expense", expense.id);
  addActivity(db, "expense_created", "expense", expense.id, `Expense ${expense.title} added.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, expense });
});

route("PATCH", "/api/expenses/:id", async ({ db, params, body, res }) => {
  const expense = db.expenses.find((item) => item.id === params.id);
  if (!expense) return sendError(res, 404, "Expense not found.");
  const paymentMethod = normalizePaymentMethod(body.paymentMethod ?? body.method ?? expense.paymentMethod ?? expense.method ?? "CASH");
  const previousReceiptFileId = cleanString(expense.receiptFileId);
  const nextReceiptFileId = body.receiptFileId === undefined ? previousReceiptFileId : cleanString(body.receiptFileId);
  Object.assign(expense, {
    title: cleanString(body.title ?? expense.title),
    category: cleanString(body.category ?? expense.category),
    amount: cleanNumber(body.amount ?? expense.amount),
    paymentMethod,
    method: paymentMethod,
    expenseDate: cleanDate(body.expenseDate ?? expense.expenseDate),
    receiptFileId: nextReceiptFileId,
    receiptFileName: body.receiptFileName === undefined ? cleanString(expense.receiptFileName) : cleanString(body.receiptFileName),
    notes: cleanString(body.notes ?? expense.notes),
    updatedAt: nowIso()
  });
  if (previousReceiptFileId && previousReceiptFileId !== nextReceiptFileId) {
    markUploadedFileDeleted(db, previousReceiptFileId);
    addActivity(db, nextReceiptFileId ? "expense_attachment_replaced" : "expense_attachment_removed", "expense", expense.id, `Receipt attachment ${nextReceiptFileId ? "replaced" : "removed"} for ${expense.title}.`);
  }
  addActivity(db, "expense_updated", "expense", expense.id, `Expense ${expense.title} updated.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, expense });
});

route("DELETE", "/api/expenses/:id/attachment", async ({ db, params, res }) => {
  const expense = db.expenses.find((item) => item.id === params.id);
  if (!expense) return sendError(res, 404, "Expense not found.");
  if (!expense.receiptFileId) return sendError(res, 404, "Expense attachment not found.");
  const oldFileId = expense.receiptFileId;
  markUploadedFileDeleted(db, oldFileId);
  expense.receiptFileId = "";
  expense.receiptFileName = "";
  expense.updatedAt = nowIso();
  addActivity(db, "expense_attachment_removed", "expense", expense.id, `Receipt attachment removed for ${expense.title}.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, expense });
});

route("PATCH", "/api/expenses/:id/archive", async ({ db, params, res }) => {
  const expense = db.expenses.find((item) => item.id === params.id);
  if (!expense) return sendError(res, 404, "Expense not found.");
  expense.archivedAt = nowIso();
  addActivity(db, "expense_archived", "expense", expense.id, `Expense ${expense.title} archived.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, expense });
});

route("GET", "/api/reports/summary", async ({ db, query, res }) => {
  const report = reportForRange(db, query.from || todayDate().slice(0, 7) + "-01", query.to || todayDate());
  addActivity(db, "report_generated", "report", "summary", "Business report generated.", { from: report.from, to: report.to });
  addNotification(db, "report_generated", "Report generated", `Report for ${report.from} to ${report.to} generated.`, "report", "summary");
  await saveDb(db);
  sendJson(res, 200, { success: true, report, branding: getBranding(db) });
});

route("GET", "/api/reports/summary/csv", async ({ db, query, res }) => {
  const report = reportForRange(db, query.from || todayDate().slice(0, 7) + "-01", query.to || todayDate());
  const rows = [
    { label: "Orders", value: report.totals.orders, type: "Count" },
    { label: "Invoices", value: report.totals.invoices, type: "Count" },
    { label: "Unpaid Invoices", value: report.totals.unpaidInvoices, type: "Count" },
    { label: "Payments", value: report.totals.payments, type: "Count" },
    { label: "Sales", value: csvNumber(report.totals.sales), type: "Currency" },
    { label: "Payments Collected", value: csvNumber(report.totals.paymentsCollected), type: "Currency" },
    { label: "Purchases", value: csvNumber(report.totals.purchaseTotal), type: "Currency" },
    { label: "Expenses", value: csvNumber(report.totals.expenseTotal), type: "Currency" },
    { label: "Estimated Profit", value: csvNumber(report.totals.estimatedProfit), type: "Currency" },
    { label: "Outstanding Balance", value: csvNumber(report.totals.outstandingBalance), type: "Currency" },
    { label: "Inventory Value", value: csvNumber(report.totals.inventoryValue), type: "Currency" }
  ];
  const csv = businessCsv(db, "Business Summary Report", rows, [{ label: "Metric", value: "label" }, { label: "Value", value: "value" }, { label: "Value Type", value: "type" }], { dateRange: `${report.from} to ${report.to}` });
  sendText(res, 200, csv, "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename="dawngas-summary-report-${todayDate()}.csv"` });
});

route("GET", "/api/reports/summary/xlsx", async ({ db, query, res }) => {
  const report = reportForRange(db, query.from || todayDate().slice(0, 7) + "-01", query.to || todayDate());
  const rows = Object.entries(report.totals).map(([metric, value]) => ({
    Metric: metric,
    Value: typeof value === "number" ? value : cleanString(value)
  }));
  sendXlsx(res, rows, ["Metric", "Value"], `dawngas-summary-report-${todayDate()}.xlsx`);
});

route("GET", "/api/reports/summary/pdf", async ({ db, query, res }) => {
  const report = reportForRange(db, query.from || todayDate().slice(0, 7) + "-01", query.to || todayDate());
  const lines = [
    `Date Range: ${report.from} to ${report.to}`,
    "",
    "Business Summary",
    ...Object.entries(report.totals).map(([metric, value]) => `${humanizeKey(metric)}: ${formatReportMetricValue(db, metric, value)}`)
  ];
  sendPdf(res, "Business Report", lines, `dawngas-summary-report-${todayDate()}.pdf`, db);
});

route("GET", "/api/reports/summary/print", async ({ db, query, res }) => {
  const report = reportForRange(db, query.from || todayDate().slice(0, 7) + "-01", query.to || todayDate());
  const rows = Object.entries(report.totals).map(([key, value]) => `<tr><td>${escapeHtml(humanizeKey(key))}</td><td>${escapeHtml(formatReportMetricValue(db, key, value))}</td></tr>`).join("");
  sendText(res, 200, printableHtml(db, "Business Report", `<section class="doc-title-row"><div><h2>Business Report</h2><div class="muted">${escapeHtml(report.from)} to ${escapeHtml(report.to)}</div></div><div class="doc-meta"><div class="meta-item"><span>Generated</span><br><strong>${todayDate()}</strong></div><div class="meta-item"><span>Currency</span><br><strong>${escapeHtml(getBranding(db).currency || "PKR")}</strong></div></div></section><table><tbody>${rows}</tbody></table>`), "text/html; charset=utf-8");
});

function buildNamedReport(db, type, query = {}) {
  const from = query.from || todayDate().slice(0, 7) + "-01";
  const to = query.to || todayDate();
  const titleMap = {
    "product-stock": "Product Stock Report",
    "raw-material-stock": "Raw Material Stock Report",
    "low-stock": "Low Stock Report",
    "inventory-movements": "Inventory Movement Report",
    production: "Production Report",
    purchases: "Purchase Report",
    invoices: "Invoice Report",
    payments: "Payment Report",
    "customer-balances": "Customer Balance Report",
    sales: "Sales Report",
    expenses: "Expense Report",
    profit: "Profit Summary Report"
  };
  let rows = [];
  if (type === "product-stock" || type === "raw-material-stock" || type === "low-stock") {
    rows = db.inventory
      .filter(isActive)
      .map((item) => enrichInventory(db, item))
      .filter((item) => type !== "raw-material-stock" || normalizeItemType(item.itemType) === ITEM_TYPES.RAW_MATERIAL)
      .filter((item) => type !== "low-stock" || item.status === "LOW_STOCK" || item.status === "OUT_OF_STOCK")
      .map((item) => ({
        itemName: item.product ? item.product.name : "",
        itemType: displayItemType(item.itemType),
        category: item.categoryName,
        sku: item.product ? item.product.sku : "",
        unit: item.product ? item.product.unitOfMeasure : "",
        currentStock: item.currentStock,
        availableStock: item.availableStock,
        lowStockThreshold: item.lowStockThreshold,
        status: item.status
      }));
  } else if (type === "inventory-movements") {
    rows = (db.inventoryMovements || [])
      .filter((movement) => dateInRange(movement.createdAt, from, to))
      .map((movement) => ({ ...movement, itemName: (findProduct(db, movement.productId) || {}).name || "" }));
  } else if (type === "production") {
    rows = db.productionBatches.filter((item) => isActive(item) && dateInRange(item.productionDate || item.createdAt, from, to)).map((item) => ({
      batchNumber: item.batchNumber,
      finishedProduct: (findProduct(db, item.finishedProductId) || {}).name || "",
      quantityProduced: item.quantityProduced,
      estimatedCost: item.estimatedCost,
      status: item.status,
      productionDate: item.productionDate
    }));
  } else if (type === "purchases") {
    rows = db.purchases.filter((item) => isActive(item) && dateInRange(item.purchaseDate || item.createdAt, from, to)).map((item) => ({
      purchaseNumber: item.purchaseNumber,
      supplier: (db.suppliers.find((supplier) => supplier.id === item.supplierId) || {}).name || "",
      totalAmount: item.totalAmount,
      paidAmount: item.paidAmount,
      balanceAmount: item.balanceAmount,
      status: item.status,
      purchaseDate: item.purchaseDate
    }));
  } else if (type === "invoices" || type === "sales") {
    rows = activeInvoices(db).filter((item) => dateInRange(item.invoiceDate || item.createdAt, from, to)).map((item) => {
      refreshInvoicePaymentStatus(db, item);
      return {
        invoiceNumber: item.invoiceNumber,
        customer: (findCustomer(db, item.customerId) || {}).name || "",
        totalAmount: item.totalAmount,
        paidAmount: item.paidAmount,
        balanceAmount: item.balanceAmount,
        status: item.status,
        paymentStatus: item.paymentStatus,
        invoiceDate: item.invoiceDate
      };
    });
  } else if (type === "payments") {
    rows = activePayments(db).filter((item) => dateInRange(item.paymentDate || item.createdAt, from, to)).map((item) => ({
      receiptNumber: item.receiptNumber,
      customer: (findCustomer(db, item.customerId) || {}).name || "",
      invoice: (db.invoices.find((invoice) => invoice.id === item.invoiceId) || {}).invoiceNumber || "",
      amount: item.amount,
      paymentMethod: item.paymentMethod || item.method,
      paymentDate: item.paymentDate
    }));
  } else if (type === "customer-balances") {
    rows = db.customers.filter(isActive).map((customer) => enrichCustomer(db, customer)).map((customer) => ({
      customer: customer.name,
      phone: customer.phone,
      currentBalance: customer.currentBalance,
      lastInvoiceAt: customer.lastInvoiceAt,
      lastPaymentDate: customer.lastPaymentDate
    }));
  } else if (type === "expenses") {
    rows = activeExpenses(db).filter((item) => dateInRange(item.expenseDate || item.createdAt, from, to));
  } else if (type === "profit") {
    const report = reportForRange(db, from, to);
    rows = Object.entries(report.totals).map(([metric, value]) => ({ metric, value }));
  }
  return { title: titleMap[type] || "Business Report", from, to, rows };
}

function reportToCsv(db, report) {
  const metadata = [
    ["Business", getBranding(db).businessName || "DawnGas"],
    ["Report", report.title],
    ["Date Range", `${report.from} to ${report.to}`],
    ["Export Date", todayDate()],
    []
  ];
  const rows = report.rows || [];
  if (!rows.length) return metadata.map((row) => row.join(",")).join("\n") + "\nNo records";
  const headers = Object.keys(rows[0]).map((key) => ({
    label: humanizeKey(key),
    value: (row) => key === "metric" ? humanizeKey(row[key]) : typeof row[key] === "number" ? (REPORT_MONEY_METRICS.has(row.metric || key) ? csvNumber(row[key]) : formatQuantity(row[key])) : row[key]
  }));
  return `${metadata.map((row) => row.map(csvEscape).join(",")).join("\n")}\n${toCsv(rows, headers)}`;
}

for (const reportType of ["product-stock", "raw-material-stock", "low-stock", "inventory-movements", "production", "purchases", "invoices", "payments", "customer-balances", "sales", "expenses", "profit"]) {
  route("GET", `/api/reports/${reportType}`, async ({ db, query, res }) => {
    sendJson(res, 200, { success: true, report: buildNamedReport(db, reportType, query), branding: getBranding(db) });
  });
}

route("GET", "/api/reports/export/csv", async ({ db, query, res }) => {
  const report = buildNamedReport(db, query.type || "profit", query);
  sendText(res, 200, reportToCsv(db, report), "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename="dawngas-${slug(report.title)}-${todayDate()}.csv"` });
});

route("GET", "/api/reports/export/xlsx", async ({ db, query, res }) => {
  const report = buildNamedReport(db, query.type || "profit", query);
  const { rows, headers } = reportRowsAndHeaders(report);
  sendXlsx(res, rows, headers, `dawngas-${slug(report.title)}-${todayDate()}.xlsx`);
});

route("GET", "/api/reports/export/pdf", async ({ db, query, res }) => {
  const report = buildNamedReport(db, query.type || "profit", query);
  const { rows, headers } = reportRowsAndHeaders(report);
  const lines = [`Date Range: ${report.from} to ${report.to}`, "", headers.map(humanizeKey).join(" | ")];
  for (const row of rows.slice(0, 45)) {
    lines.push(headers.map((header) => formatReportCell(db, header === "value" && row.metric ? row.metric : header, row[header])).join(" | "));
  }
  if (rows.length > 45) lines.push(`... ${rows.length - 45} more rows in CSV/XLSX export`);
  sendPdf(res, report.title, lines, `dawngas-${slug(report.title)}-${todayDate()}.pdf`, db);
});

route("GET", "/api/reports/:reportType/pdf", async ({ db, params, query, res }) => {
  const document = reportPdfDocument(db, params.reportType, query.from, query.to);
  if (!document) return sendError(res, 404, "Report not found.");
  sendPdf(res, document.title, document.lines, document.fileName, db);
});

route("GET", "/api/monthly-snapshot", async ({ db, query, res }) => {
  const month = query.month || todayDate().slice(0, 7);
  const report = reportForRange(db, `${month}-01`, `${month}-31`);
  sendJson(res, 200, { success: true, snapshot: report });
});

route("GET", "/api/search", async ({ db, query, res }) => {
  const term = cleanString(query.q).toLowerCase();
  if (!term) return sendJson(res, 200, { success: true, results: [] });
  const results = [];
  function push(type, title, subtitle, url, record) {
    results.push({ type, title, subtitle, url, id: record.id });
  }
  db.customers.filter(isActive).forEach((item) => {
    if ([item.name, item.phone, item.email].some((value) => cleanString(value).toLowerCase().includes(term))) push("Customer", item.name, item.phone, "#customers", item);
  });
  db.productCategories.filter(isActive).forEach((item) => {
    if ([item.name, item.type, item.description].some((value) => cleanString(value).toLowerCase().includes(term))) push("Category", item.name, displayItemType(item.type), "#products", item);
  });
  db.products.filter(isActive).forEach((item) => {
    if ([item.name, item.sku, item.invoiceDisplayName, item.description, categoryName(db, item.categoryId)].some((value) => cleanString(value).toLowerCase().includes(term))) {
      push(displayItemType(item.itemType), item.name, item.sku || categoryName(db, item.categoryId), "#products", item);
    }
  });
  db.suppliers.filter(isActive).forEach((item) => {
    if ([item.name, item.phone, item.email, item.contactPerson].some((value) => cleanString(value).toLowerCase().includes(term))) push("Supplier", item.name, item.phone, "#suppliers", item);
  });
  db.purchases.filter(isActive).forEach((item) => {
    if ([item.purchaseNumber, item.notes].some((value) => cleanString(value).toLowerCase().includes(term))) push("Purchase", item.purchaseNumber, formatMoney(db, item.totalAmount), "#purchases", item);
  });
  db.productionBatches.filter(isActive).forEach((item) => {
    if ([item.batchNumber, item.notes].some((value) => cleanString(value).toLowerCase().includes(term))) push("Production", item.batchNumber, `${item.quantityProduced || 0} produced`, "#production", item);
  });
  activeInvoices(db).forEach((item) => {
    if ([item.invoiceNumber, item.notes].some((value) => cleanString(value).toLowerCase().includes(term))) push("Invoice", item.invoiceNumber, formatMoney(db, item.totalAmount), "#invoices", item);
  });
  activeOrders(db).forEach((item) => {
    if ([item.orderNumber, item.notes].some((value) => cleanString(value).toLowerCase().includes(term))) push("Order", item.orderNumber, currency(orderTotal(item)), "#orders", item);
  });
  activePayments(db).forEach((item) => {
    if ([item.paymentNumber, item.receiptNumber, item.paymentMethod, item.method, item.notes].some((value) => cleanString(value).toLowerCase().includes(term))) {
      push("Payment", item.receiptNumber || item.paymentNumber, formatMoney(db, item.amount), "#payments", item);
    }
  });
  db.deliveries.filter(isActive).forEach((item) => {
    if ([item.deliveryNumber, item.address, item.notes].some((value) => cleanString(value).toLowerCase().includes(term))) push("Delivery", item.deliveryNumber, item.status, "#deliveries", item);
  });
  activeExpenses(db).forEach((item) => {
    if ([item.title, item.category, item.notes].some((value) => cleanString(value).toLowerCase().includes(term))) push("Expense", item.title, currency(item.amount), "#expenses", item);
  });
  db.notes.filter(isActive).forEach((item) => {
    if ([item.title, item.content].some((value) => cleanString(value).toLowerCase().includes(term))) push("Note", item.title || item.entityType, item.content.slice(0, 80), "#notes", item);
  });
  sendJson(res, 200, { success: true, results: results.slice(0, 30) });
});

route("GET", "/api/notifications", async ({ db, res }) => {
  sendJson(res, 200, { success: true, notifications: db.notifications.filter((item) => !item.deletedAt).slice(0, 100) });
});

route("GET", "/api/notifications/unread-count", async ({ db, res }) => {
  sendJson(res, 200, { success: true, count: db.notifications.filter((item) => !item.deletedAt && !item.readAt).length });
});

route("PATCH", "/api/notifications/:id/read", async ({ db, params, res }) => {
  const notification = db.notifications.find((item) => item.id === params.id);
  if (!notification) return sendError(res, 404, "Notification not found.");
  notification.readAt = notification.readAt || nowIso();
  await saveDb(db);
  sendJson(res, 200, { success: true, notification });
});

route("PATCH", "/api/notifications/mark-all-read", async ({ db, res }) => {
  db.notifications.forEach((item) => {
    if (!item.deletedAt) item.readAt = item.readAt || nowIso();
  });
  await saveDb(db);
  sendJson(res, 200, { success: true });
});

route("DELETE", "/api/notifications/:id", async ({ db, params, res }) => {
  const notification = db.notifications.find((item) => item.id === params.id);
  if (!notification) return sendError(res, 404, "Notification not found.");
  notification.deletedAt = nowIso();
  await saveDb(db);
  sendJson(res, 200, { success: true });
});

route("GET", "/api/settings/business", async ({ db, res }) => {
  sendJson(res, 200, { success: true, settings: getBranding(db) });
});

route("GET", "/api/settings", async ({ db, res }) => {
  sendJson(res, 200, { success: true, settings: getBranding(db) });
});

route("PATCH", "/api/settings/business", async ({ db, body, res }) => {
  const errors = validateColorPayload(body);
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Please fix the highlighted color fields.", errors });
  db.businessSettings = applyBrandingPayload(db.businessSettings, body);
  addActivity(db, "business_settings_updated", "settings", "business", "Business branding settings updated.");
  await saveDb(db);
  sendJson(res, 200, { success: true, settings: getBranding(db) });
});

route("PATCH", "/api/settings", async ({ db, body, res }) => {
  const errors = validateColorPayload(body);
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Please fix the highlighted color fields.", errors });
  db.businessSettings = applyBrandingPayload(db.businessSettings, body);
  addActivity(db, "business_settings_updated", "settings", "business", "Business settings updated.");
  await saveDb(db);
  sendJson(res, 200, { success: true, settings: getBranding(db) });
});

route("GET", "/api/settings/branding", async ({ db, res }) => {
  sendJson(res, 200, { success: true, settings: getBranding(db) });
}, { auth: false });

route("PATCH", "/api/settings/branding", async ({ db, body, res }) => {
  const errors = validateColorPayload(body);
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Please fix the highlighted color fields.", errors });
  db.businessSettings = applyBrandingPayload(db.businessSettings, body);
  addActivity(db, "branding_updated", "settings", "business", "Branding settings updated.");
  await saveDb(db);
  sendJson(res, 200, { success: true, settings: getBranding(db) });
});

route("POST", "/api/settings/logo", async ({ db, body, res }) => {
  const errors = requireFields(body, ["fileName", "mimeType", "data"]);
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Logo file is required.", errors });
  const mimeType = cleanString(body.mimeType);
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
  if (!allowed.includes(mimeType)) return sendError(res, 400, "Logo must be a PNG, JPG, WEBP, or SVG file.");
  const base64 = String(body.data).includes(",") ? String(body.data).split(",").pop() : String(body.data);
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > 5 * 1024 * 1024) return sendError(res, 413, "Logo must be 5 MB or smaller.");

  const existingLogoId = cleanString(db.businessSettings.logoFileId || db.businessSettings.logoAttachmentId);
  if (existingLogoId) {
    const existing = db.fileUploads.find((item) => item.id === existingLogoId);
    if (existing) existing.deletedAt = nowIso();
  }

  const fileId = id("file");
  const safeName = cleanString(body.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const extension = path.extname(safeName) || (mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : mimeType === "image/svg+xml" ? ".svg" : ".jpg");
  const storedName = `${fileId}${extension}`;
  const storagePath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(storagePath, buffer);
  const upload = {
    id: fileId,
    originalName: safeName,
    fileName: storedName,
    mimeType,
    size: buffer.byteLength,
    storagePath,
    entityType: "businessSettings",
    entityId: "business",
    deletedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.fileUploads.unshift(upload);
  db.businessSettings = applyBrandingPayload(db.businessSettings, {
    logoFileId: fileId,
    logoUrl: `/api/uploads/${fileId}`
  });
  addActivity(db, "logo_uploaded", "settings", "business", "Business logo uploaded.");
  await saveDb(db);
  sendJson(res, 201, { success: true, settings: getBranding(db), file: upload });
});

route("DELETE", "/api/settings/logo", async ({ db, res }) => {
  const logoId = cleanString(db.businessSettings.logoFileId || db.businessSettings.logoAttachmentId);
  if (logoId) {
    const file = db.fileUploads.find((item) => item.id === logoId);
    if (file) file.deletedAt = nowIso();
  }
  db.businessSettings.logoFileId = "";
  db.businessSettings.logoAttachmentId = "";
  db.businessSettings.logoUrl = "";
  db.businessSettings.updatedAt = nowIso();
  addActivity(db, "logo_removed", "settings", "business", "Business logo removed.");
  await saveDb(db);
  sendJson(res, 200, { success: true, settings: getBranding(db) });
});

route("POST", "/api/settings/signature", async ({ db, body, res }) => {
  const errors = requireFields(body, ["fileName", "mimeType", "data"]);
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Signature file is required.", errors });
  const mimeType = cleanString(body.mimeType);
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(mimeType)) return sendError(res, 400, "Signature must be a PNG, JPG, or WEBP file.");
  const base64 = String(body.data).includes(",") ? String(body.data).split(",").pop() : String(body.data);
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > 5 * 1024 * 1024) return sendError(res, 413, "Signature must be 5 MB or smaller.");
  const fileId = id("file");
  const safeName = cleanString(body.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const extension = path.extname(safeName) || ".png";
  const storedName = `${fileId}${extension}`;
  const storagePath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(storagePath, buffer);
  const upload = {
    id: fileId,
    originalName: safeName,
    fileName: storedName,
    mimeType,
    size: buffer.byteLength,
    storagePath,
    entityType: "businessSettings",
    entityId: "signature",
    deletedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.fileUploads.unshift(upload);
  db.businessSettings.signatureFileId = fileId;
  db.businessSettings.signatureAttachmentId = fileId;
  db.businessSettings.updatedAt = nowIso();
  addActivity(db, "signature_uploaded", "settings", "business", "Business signature uploaded.");
  await saveDb(db);
  sendJson(res, 201, { success: true, settings: getBranding(db), file: upload });
});

route("DELETE", "/api/settings/signature", async ({ db, res }) => {
  const signatureId = cleanString(db.businessSettings.signatureFileId || db.businessSettings.signatureAttachmentId);
  if (signatureId) {
    const file = db.fileUploads.find((item) => item.id === signatureId);
    if (file) file.deletedAt = nowIso();
  }
  db.businessSettings.signatureFileId = "";
  db.businessSettings.signatureAttachmentId = "";
  db.businessSettings.updatedAt = nowIso();
  addActivity(db, "signature_removed", "settings", "business", "Business signature removed.");
  await saveDb(db);
  sendJson(res, 200, { success: true, settings: getBranding(db) });
});

route("GET", "/api/profile", async ({ current, res }) => {
  sendJson(res, 200, { success: true, profile: publicUser(current.user) });
});

route("PATCH", "/api/profile", async ({ db, current, body, res }) => {
  const email = cleanString(body.email ?? current.user.email).toLowerCase();
  if (!email) return sendError(res, 400, "Email is required.");
  const duplicate = db.users.find((user) => user.id !== current.user.id && cleanString(user.email).toLowerCase() === email);
  if (duplicate) return sendError(res, 409, "Email is already used by another owner account.");
  current.user.name = cleanString(body.name ?? current.user.name);
  current.user.phone = cleanString(body.phone ?? current.user.phone);
  current.user.email = email;
  current.user.updatedAt = nowIso();
  addActivity(db, "profile_updated", "owner", current.user.id, "Owner profile updated.");
  await saveDb(db);
  sendJson(res, 200, { success: true, profile: publicUser(current.user) });
});

route("POST", "/api/profile/change-password", async ({ db, current, body, res }) => {
  const oldPassword = cleanString(body.oldPassword);
  const newPassword = cleanString(body.newPassword);
  if (!(await verifyPassword(oldPassword, current.user.passwordHash))) return sendError(res, 400, "Current password is incorrect.");
  if (newPassword.length < 8) return sendError(res, 400, "New password must be at least 8 characters.");
  current.user.passwordHash = await hashPassword(newPassword);
  current.user.updatedAt = nowIso();
  addActivity(db, "password_changed", "owner", current.user.id, "Owner password changed.");
  await saveDb(db);
  sendJson(res, 200, { success: true, message: "Password changed." });
});

route("GET", "/api/notes", async ({ db, query, res }) => {
  let notes = db.notes.filter(isActive);
  if (query.entityType) notes = notes.filter((item) => item.entityType === query.entityType);
  if (query.entityId) notes = notes.filter((item) => item.entityId === query.entityId);
  sendJson(res, 200, { success: true, notes });
});

route("GET", "/api/notes/:entityType/:entityId", async ({ db, params, res }) => {
  const notes = db.notes.filter((item) => isActive(item) && item.entityType === params.entityType && item.entityId === params.entityId);
  sendJson(res, 200, { success: true, notes });
});

route("POST", "/api/notes", async ({ db, body, res }) => {
  const errors = requireFields(body, ["entityType", "entityId", "content"]);
  if (!ENTITY_TYPES.has(cleanString(body.entityType))) errors.entityType = "Invalid entity type.";
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Note content and entity are required.", errors });
  const note = {
    id: id("note"),
    entityType: cleanString(body.entityType),
    entityId: cleanString(body.entityId),
    title: cleanString(body.title),
    content: cleanString(body.content),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null
  };
  db.notes.unshift(note);
  addActivity(db, "note_created", note.entityType, note.entityId, "Note added.");
  await saveDb(db);
  sendJson(res, 201, { success: true, note });
});

route("PATCH", "/api/notes/:id", async ({ db, params, body, res }) => {
  const note = db.notes.find((item) => item.id === params.id);
  if (!note) return sendError(res, 404, "Note not found.");
  note.title = cleanString(body.title ?? note.title);
  note.content = cleanString(body.content ?? note.content);
  note.updatedAt = nowIso();
  addActivity(db, "note_updated", note.entityType, note.entityId, "Note updated.");
  await saveDb(db);
  sendJson(res, 200, { success: true, note });
});

route("PATCH", "/api/notes/:id/archive", async ({ db, params, res }) => {
  const note = db.notes.find((item) => item.id === params.id);
  if (!note) return sendError(res, 404, "Note not found.");
  note.archivedAt = nowIso();
  addActivity(db, "note_archived", note.entityType, note.entityId, "Note moved to recycle bin.");
  await saveDb(db);
  sendJson(res, 200, { success: true });
});

route("DELETE", "/api/notes/:id", async ({ db, params, res }) => {
  const note = db.notes.find((item) => item.id === params.id);
  if (!note) return sendError(res, 404, "Note not found.");
  note.archivedAt = nowIso();
  addActivity(db, "note_archived", note.entityType, note.entityId, "Note moved to recycle bin.");
  await saveDb(db);
  sendJson(res, 200, { success: true });
});

route("GET", "/api/attachments", async ({ db, query, res }) => {
  let attachments = db.attachments.filter(isActive);
  if (query.entityType) attachments = attachments.filter((item) => item.entityType === query.entityType);
  if (query.entityId) attachments = attachments.filter((item) => item.entityId === query.entityId);
  sendJson(res, 200, { success: true, attachments });
});

route("POST", "/api/attachments", async ({ db, body, res }) => {
  const errors = requireFields(body, ["entityType", "entityId", "fileName", "mimeType", "data"]);
  if (!ENTITY_TYPES.has(cleanString(body.entityType))) errors.entityType = "Invalid entity type.";
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "Attachment file and entity are required.", errors });
  const mimeType = cleanString(body.mimeType);
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
  if (!allowed.includes(mimeType)) return sendError(res, 400, "Unsupported file type.");
  const base64 = String(body.data).includes(",") ? String(body.data).split(",").pop() : String(body.data);
  const buffer = Buffer.from(base64, "base64");
  const maxSize = mimeType === "application/pdf" ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
  if (buffer.byteLength > maxSize) return sendError(res, 413, "Attachment is too large.");
  const attachmentId = id("file");
  const safeName = cleanString(body.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const extension = path.extname(safeName) || "";
  const storedName = `${attachmentId}${extension}`;
  const storagePath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(storagePath, buffer);
  const fileUpload = {
    id: attachmentId,
    originalName: safeName,
    fileName: storedName,
    mimeType,
    size: buffer.byteLength,
    storagePath,
    entityType: cleanString(body.entityType),
    entityId: cleanString(body.entityId),
    deletedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const attachment = {
    id: attachmentId,
    entityType: cleanString(body.entityType),
    entityId: cleanString(body.entityId),
    fileUploadId: attachmentId,
    label: cleanString(body.label),
    description: cleanString(body.description),
    fileName: safeName,
    mimeType,
    size: buffer.byteLength,
    storageName: storedName,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedAt: null
  };
  db.fileUploads.unshift(fileUpload);
  db.attachments.unshift(attachment);
  addActivity(db, "attachment_uploaded", attachment.entityType, attachment.entityId, `Attachment ${attachment.fileName} uploaded.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, attachment });
});

route("GET", "/api/attachments/:id/download", async ({ db, params, res }) => {
  const attachment = db.attachments.find((item) => item.id === params.id && isActive(item));
  if (!attachment) return sendError(res, 404, "Attachment not found.");
  const filePath = path.join(UPLOAD_DIR, attachment.storageName);
  sendFile(res, filePath, attachment.mimeType, { "Content-Disposition": `attachment; filename="${attachment.fileName}"` });
});

route("GET", "/api/attachments/:entityType/:entityId", async ({ db, params, res }) => {
  const attachments = db.attachments.filter((item) => isActive(item) && item.entityType === params.entityType && item.entityId === params.entityId);
  sendJson(res, 200, { success: true, attachments });
});

route("GET", "/api/uploads/:fileId", async ({ db, params, res }) => {
  const file = db.fileUploads.find((item) => item.id === params.fileId && !item.deletedAt);
  if (!file) return sendError(res, 404, "File not found.");
  const filePath = path.join(UPLOAD_DIR, file.fileName);
  sendFile(res, filePath, file.mimeType, { "Cache-Control": "private, max-age=300" });
});

route("POST", "/api/uploads", async ({ db, body, res }) => {
  const errors = requireFields(body, ["fileName", "mimeType", "data"]);
  if (Object.keys(errors).length) return sendJson(res, 400, { success: false, message: "File is required.", errors });
  const mimeType = cleanString(body.mimeType);
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
  if (!allowed.includes(mimeType)) return sendError(res, 400, "Unsupported file type.");
  const base64 = String(body.data).includes(",") ? String(body.data).split(",").pop() : String(body.data);
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > 10 * 1024 * 1024) return sendError(res, 413, "File is too large.");
  const fileId = id("file");
  const safeName = cleanString(body.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${fileId}${path.extname(safeName) || ""}`;
  const storagePath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(storagePath, buffer);
  const upload = {
    id: fileId,
    originalName: safeName,
    fileName: storedName,
    mimeType,
    size: buffer.byteLength,
    storagePath,
    entityType: cleanString(body.entityType),
    entityId: cleanString(body.entityId),
    deletedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.fileUploads.unshift(upload);
  addActivity(db, "file_uploaded", upload.entityType || "upload", upload.entityId || fileId, `File ${upload.originalName} uploaded.`);
  await saveDb(db);
  sendJson(res, 201, { success: true, file: upload });
});

route("DELETE", "/api/attachments/:id", async ({ db, params, res }) => {
  const attachment = db.attachments.find((item) => item.id === params.id);
  if (!attachment) return sendError(res, 404, "Attachment not found.");
  attachment.archivedAt = nowIso();
  const file = db.fileUploads.find((item) => item.id === (attachment.fileUploadId || attachment.id));
  if (file) file.deletedAt = nowIso();
  addActivity(db, "attachment_archived", attachment.entityType, attachment.entityId, `Attachment ${attachment.fileName} moved to recycle bin.`);
  await saveDb(db);
  sendJson(res, 200, { success: true });
});

route("GET", "/api/activity-logs", async ({ db, res }) => {
  sendJson(res, 200, { success: true, activityLogs: db.activityLogs.slice(0, 300) });
});

function isRecycleRecord(record) {
  return record && (record.archivedAt || record.deletedAt || cleanString(record.status).toUpperCase() === "ARCHIVED");
}

function pushDependency(dependencies, type, count) {
  const numericCount = cleanNumber(count);
  if (numericCount > 0) dependencies.push({ type, count: numericCount });
}

function countRecords(records, predicate) {
  return Array.isArray(records) ? records.filter(predicate).length : 0;
}

function countNestedRows(records, rowsForRecord, predicate) {
  if (!Array.isArray(records)) return 0;
  return records.reduce((count, record) => count + (Array.isArray(rowsForRecord(record)) ? rowsForRecord(record).filter(predicate).length : 0), 0);
}

function permanentDeleteBlockers(db, collection, record) {
  const idValue = record && record.id;
  const dependencies = [];
  if (!idValue) return [{ type: "Record Identity", count: 1 }];

  if (collection === "customers") {
    const invoiceCount = countRecords(db.invoices, (item) => item.customerId === idValue);
    const paymentCount = countRecords(db.payments, (item) => item.customerId === idValue);
    const orderCount = countRecords(db.orders, (item) => item.customerId === idValue);
    const deliveryCount = countRecords(db.deliveries, (item) => item.customerId === idValue);
    pushDependency(dependencies, "Invoices", invoiceCount);
    pushDependency(dependencies, "Payments", paymentCount);
    pushDependency(dependencies, "Orders", orderCount);
    pushDependency(dependencies, "Deliveries", deliveryCount);
    pushDependency(dependencies, "Customer Balances", cleanNumber(record.openingBalance) || cleanNumber(record.currentBalance) || cleanNumber(customerBalance(db, idValue)) ? 1 : 0);
    pushDependency(dependencies, "Reports Source Data", invoiceCount + paymentCount + orderCount + deliveryCount);
  }

  if (collection === "products") {
    const invoiceItemCount = countNestedRows(db.invoices, (item) => item.items, (row) => row.productId === idValue);
    const purchaseItemCount = countNestedRows(db.purchases, (item) => item.items, (row) => row.productId === idValue);
    const purchaseCount = countRecords(db.purchases, (item) => (item.items || []).some((row) => row.productId === idValue));
    const orderItemCount = countNestedRows(db.orders, (item) => item.items, (row) => row.productId === idValue);
    const inventoryMovementCount = countRecords(db.inventoryMovements, (item) => item.productId === idValue);
    const productionBatchCount = countRecords(db.productionBatches, (item) => item.finishedProductId === idValue || (item.materials || []).some((row) => row.productId === idValue || row.rawMaterialId === idValue));
    const productionUsageCount = countNestedRows(db.productionBatches, (item) => item.materials, (row) => row.productId === idValue || row.rawMaterialId === idValue);
    const bomCount = countRecords(db.billOfMaterials, (item) => item.finishedProductId === idValue || item.rawMaterialId === idValue);
    pushDependency(dependencies, "Invoice Items", invoiceItemCount);
    pushDependency(dependencies, "Purchase Items", purchaseItemCount);
    pushDependency(dependencies, "Purchases", purchaseCount);
    pushDependency(dependencies, "Order Items", orderItemCount);
    pushDependency(dependencies, "Inventory Movements", inventoryMovementCount);
    pushDependency(dependencies, "Production Batches", productionBatchCount);
    pushDependency(dependencies, "Production Material Usage", productionUsageCount);
    pushDependency(dependencies, "Materials Required", bomCount);
    pushDependency(dependencies, "Reports Source Data", invoiceItemCount + purchaseItemCount + inventoryMovementCount + productionBatchCount);
  }

  if (collection === "productCategories") {
    pushDependency(dependencies, "Products", countRecords(db.products, (item) => item.categoryId === idValue));
  }

  if (collection === "inventory") {
    const movementCount = countRecords(db.inventoryMovements, (item) => item.inventoryItemId === idValue || item.productId === record.productId);
    pushDependency(dependencies, "Inventory Movements", movementCount);
    pushDependency(dependencies, "Reports Source Data", movementCount);
  }

  if (collection === "suppliers") {
    const purchaseCount = countRecords(db.purchases, (item) => item.supplierId === idValue);
    const purchaseItemCount = countNestedRows(db.purchases.filter((item) => item.supplierId === idValue), (item) => item.items, () => true);
    pushDependency(dependencies, "Purchases", purchaseCount);
    pushDependency(dependencies, "Purchase Items", purchaseItemCount);
    pushDependency(dependencies, "Reports Source Data", purchaseCount);
  }

  if (collection === "purchases") {
    const movementCount = countRecords(db.inventoryMovements, (item) => item.referenceId === idValue || (item.referenceType === "PURCHASE" && item.referenceId === idValue));
    pushDependency(dependencies, "Purchase Items", (record.items || []).length);
    pushDependency(dependencies, "Received Stock", cleanString(record.status).toUpperCase() === "RECEIVED" ? 1 : 0);
    pushDependency(dependencies, "Inventory Movements", movementCount);
    pushDependency(dependencies, "Reports Source Data", 1);
  }

  if (collection === "invoices") {
    const paymentCount = countRecords(db.payments, (item) => item.invoiceId === idValue);
    const deliveryCount = countRecords(db.deliveries, (item) => item.invoiceId === idValue);
    const movementCount = countRecords(db.inventoryMovements, (item) => item.referenceType === "INVOICE" && item.referenceId === idValue);
    pushDependency(dependencies, "Invoice Items", (record.items || []).length);
    pushDependency(dependencies, "Payments", paymentCount);
    pushDependency(dependencies, "Deliveries", deliveryCount);
    pushDependency(dependencies, "Inventory Movements", movementCount);
    pushDependency(dependencies, "Customer Balances", cleanNumber(record.totalAmount) || cleanNumber(record.balanceAmount) ? 1 : 0);
    pushDependency(dependencies, "Reports Source Data", 1);
  }

  if (collection === "payments") {
    pushDependency(dependencies, "Linked Invoice", record.invoiceId ? 1 : 0);
    pushDependency(dependencies, "Linked Order", record.orderId ? 1 : 0);
    pushDependency(dependencies, "Customer Balances", 1);
    pushDependency(dependencies, "Reports Source Data", 1);
  }

  if (collection === "orders") {
    const invoiceCount = countRecords(db.invoices, (item) => item.orderId === idValue);
    const paymentCount = countRecords(db.payments, (item) => item.orderId === idValue);
    const deliveryCount = countRecords(db.deliveries, (item) => item.orderId === idValue);
    const movementCount = countRecords(db.inventoryMovements, (item) => item.referenceType === "ORDER" && item.referenceId === idValue);
    pushDependency(dependencies, "Order Items", (record.items || []).length);
    pushDependency(dependencies, "Invoices", invoiceCount);
    pushDependency(dependencies, "Payments", paymentCount);
    pushDependency(dependencies, "Deliveries", deliveryCount);
    pushDependency(dependencies, "Inventory Movements", movementCount);
    pushDependency(dependencies, "Reports Source Data", 1);
  }

  if (collection === "productionBatches") {
    const movementCount = countRecords(db.inventoryMovements, (item) => item.referenceType === "PRODUCTION" && item.referenceId === idValue);
    pushDependency(dependencies, "Production Material Usage", (record.materials || []).length);
    pushDependency(dependencies, "Inventory Movements", movementCount);
    pushDependency(dependencies, "Reports Source Data", 1);
  }

  if (collection === "expenses") {
    pushDependency(dependencies, "Reports Source Data", 1);
  }

  if (collection === "masterData") {
    if (record.type === "storageLocations") pushDependency(dependencies, "Inventory Records", countRecords(db.inventory, (item) => item.storageLocationId === idValue || item.storageLocation === record.value));
    if (record.type === "unitsOfMeasure") pushDependency(dependencies, "Products", countRecords(db.products, (item) => item.unitOfMeasure === record.value));
    if (record.type === "itemTypes") pushDependency(dependencies, "Products", countRecords(db.products, (item) => normalizeItemType(item.itemType) === normalizeItemType(record.value)));
  }

  return dependencies;
}

function markUploadedFileDeleted(db, fileId) {
  if (!Array.isArray(db.fileUploads)) return;
  const file = db.fileUploads.find((item) => item.id === cleanString(fileId));
  if (file) {
    file.deletedAt = nowIso();
    file.updatedAt = nowIso();
  }
}

route("GET", "/api/recycle-bin", async ({ db, query, res }) => {
  const rows = [];
  const collections = ["customers", "productCategories", "products", "inventory", "suppliers", "purchases", "invoices", "payments", "orders", "deliveries", "expenses", "notes", "attachments", "masterData"];
  for (const collection of collections) {
    if (query.type && query.type !== collection) continue;
    db[collection].forEach((record) => {
      if (record.archivedAt || record.deletedAt || cleanString(record.status).toUpperCase() === "ARCHIVED") rows.push({ type: collection, record });
    });
  }
  sendJson(res, 200, { success: true, items: rows });
});

route("POST", "/api/recycle-bin/:type/:id/restore", async ({ db, params, res }) => {
  const collection = ENTITY_COLLECTIONS[params.type] || params.type;
  if (!db[collection] || !Array.isArray(db[collection])) return sendError(res, 400, "Invalid recycle bin type.");
  const record = db[collection].find((item) => item.id === params.id);
  if (!record) return sendError(res, 404, "Record not found.");
  record.archivedAt = null;
  record.deletedAt = null;
  if (cleanString(record.status).toUpperCase() === "ARCHIVED") record.status = "ACTIVE";
  record.updatedAt = nowIso();
  addActivity(db, "record_restored", collection, record.id, `${collection} record restored.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, record });
});

route("PATCH", "/api/recycle-bin/:type/:id/restore", async ({ db, params, res }) => {
  const collection = ENTITY_COLLECTIONS[params.type] || params.type;
  if (!db[collection] || !Array.isArray(db[collection])) return sendError(res, 400, "Invalid recycle bin type.");
  const record = db[collection].find((item) => item.id === params.id);
  if (!record) return sendError(res, 404, "Record not found.");
  record.archivedAt = null;
  record.deletedAt = null;
  if (cleanString(record.status).toUpperCase() === "ARCHIVED") record.status = "ACTIVE";
  record.updatedAt = nowIso();
  addActivity(db, "record_restored", collection, record.id, `${collection} record restored.`);
  await saveDb(db);
  sendJson(res, 200, { success: true, record });
});

route("DELETE", "/api/recycle-bin/:type/:id", async ({ db, params, res }) => {
  const collection = ENTITY_COLLECTIONS[params.type] || params.type;
  const safeCollections = new Set(["notes", "attachments"]);
  if (!safeCollections.has(collection)) return sendError(res, 400, "Permanent delete is only enabled for non-financial records.");
  const index = db[collection].findIndex((item) => item.id === params.id);
  if (index === -1) return sendError(res, 404, "Record not found.");
  const [record] = db[collection].splice(index, 1);
  addActivity(db, "record_permanently_deleted", collection, record.id, `${collection} record permanently deleted.`);
  await saveDb(db);
  sendJson(res, 200, { success: true });
});

route("DELETE", "/api/recycle-bin/:type/:id/permanent", async ({ db, params, res }) => {
  const collection = ENTITY_COLLECTIONS[params.type] || params.type;
  if (!db[collection] || !Array.isArray(db[collection])) return sendError(res, 400, "Invalid recycle bin type.");
  const index = db[collection].findIndex((item) => item.id === params.id);
  if (index === -1) return sendError(res, 404, "Record not found.");
  const record = db[collection][index];
  if (!isRecycleRecord(record)) return sendError(res, 400, "Only records already in the recycle bin can be permanently deleted.");
  const dependencies = permanentDeleteBlockers(db, collection, record);
  if (dependencies.length) {
    addActivity(
      db,
      "record_permanent_delete_blocked",
      collection,
      record.id,
      `${collection} record permanent delete blocked because it is linked to business history.`,
      { dependencies }
    );
    await saveDb(db);
    return sendJson(res, 409, {
      success: false,
      message: "Permanent delete blocked because this record is linked to business history.",
      dependencies
    });
  }
  db[collection].splice(index, 1);
  if (collection === "attachments") markUploadedFileDeleted(db, record.fileUploadId || record.id);
  if (collection === "expenses" && record.receiptFileId) markUploadedFileDeleted(db, record.receiptFileId);
  addActivity(db, "record_permanently_deleted", collection, record.id, `${collection} record permanently deleted.`);
  await saveDb(db);
  sendJson(res, 200, { success: true });
});

const DATA_CLEANUP_CONFIRM_TEXT = "CLEAR BUSINESS DATA";
const DELETE_SELECTED_CONFIRM_TEXT = "DELETE SELECTED RECORDS";
const CLEAN_ORPHANS_CONFIRM_TEXT = "CLEAN ORPHANS";

const DATA_MANAGEMENT_GROUPS = [
  { key: "notifications", label: "Notifications", collection: "notifications" },
  { key: "activityLogs", label: "Activity Logs", collection: "activityLogs" },
  { key: "notes", label: "Notes", collection: "notes" },
  { key: "attachments", label: "Attachments", collection: "attachments" },
  { key: "payments", label: "Payments", collection: "payments" },
  { key: "deliveries", label: "Deliveries", collection: "deliveries" },
  { key: "invoiceItems", label: "Invoice Items", derived: true },
  { key: "invoices", label: "Invoices", collection: "invoices" },
  { key: "orderItems", label: "Order Items", derived: true },
  { key: "orders", label: "Orders", collection: "orders" },
  { key: "productionMaterialUsages", label: "Production Material Usage", collection: "productionMaterialUsages" },
  { key: "productionBatches", label: "Production Batches", collection: "productionBatches" },
  { key: "purchaseItems", label: "Purchase Items", derived: true },
  { key: "purchases", label: "Purchases", collection: "purchases" },
  { key: "inventoryMovements", label: "Inventory Movements", collection: "inventoryMovements" },
  { key: "inventory", label: "Inventory Items", collection: "inventory" },
  { key: "billOfMaterials", label: "Materials Required", collection: "billOfMaterials" },
  { key: "products", label: "Products", collection: "products" },
  { key: "customers", label: "Customers", collection: "customers" },
  { key: "suppliers", label: "Suppliers", collection: "suppliers" },
  { key: "expenses", label: "Expenses", collection: "expenses" },
  { key: "backups", label: "Backup Records", collection: "backups" },
  { key: "restoreLogs", label: "Restore Logs", collection: "restoreLogs" },
  { key: "reminderLogs", label: "Reminder Logs", collection: "reminderLogs" }
];

const DATA_CLEAR_ORDER = DATA_MANAGEMENT_GROUPS.map((item) => item.key);
const DATA_MANAGEMENT_GROUP_MAP = Object.fromEntries(DATA_MANAGEMENT_GROUPS.map((item) => [item.key, item]));

function dataCleanupEnabled() {
  return NODE_ENV !== "production" || process.env.ENABLE_DATA_CLEANUP === "true";
}

function dataCleanupState() {
  return {
    enabled: dataCleanupEnabled(),
    environment: NODE_ENV,
    requiresEnvOverride: NODE_ENV === "production" && process.env.ENABLE_DATA_CLEANUP !== "true",
    message: dataCleanupEnabled()
      ? "Data cleanup tools are enabled for controlled setup/testing cleanup."
      : "Data cleanup tools are disabled in production."
  };
}

function requireDataCleanupEnabled(res) {
  if (dataCleanupEnabled()) return true;
  sendJson(res, 403, { success: false, ...dataCleanupState() });
  return false;
}

function dataGroupRows(db, key) {
  if (key === "invoiceItems") return deriveInvoiceItems(db.invoices || []);
  if (key === "purchaseItems") return derivePurchaseItems(db.purchases || []);
  if (key === "orderItems") return deriveOrderItems(db.orders || []);
  const group = DATA_MANAGEMENT_GROUP_MAP[key];
  return group && group.collection && Array.isArray(db[group.collection]) ? db[group.collection] : [];
}

function recordLabelForDataManagement(key, record = {}) {
  if (key === "invoiceItems") {
    const invoiceNumber = (record.invoiceId || "").split("_item_")[0] || record.invoiceId || "";
    return `${record.description || record.productName || record.productId || "Invoice item"} (${invoiceNumber})`;
  }
  if (key === "purchaseItems") return `${record.productId || "Purchase item"} (${record.purchaseId || ""})`;
  if (key === "orderItems") return `${record.productName || record.productId || "Order item"} (${record.orderId || ""})`;
  return (
    record.name ||
    record.title ||
    record.invoiceNumber ||
    record.receiptNumber ||
    record.paymentNumber ||
    record.purchaseNumber ||
    record.batchNumber ||
    record.orderNumber ||
    record.deliveryNumber ||
    record.fileName ||
    record.originalName ||
    record.message ||
    record.action ||
    record.id ||
    "Record"
  );
}

function dataRecordPreview(db, key, record = {}) {
  return {
    id: record.id,
    label: recordLabelForDataManagement(key, record),
    status: record.status || (record.archivedAt || record.deletedAt ? "ARCHIVED" : "ACTIVE"),
    details: [
      record.sku,
      record.phone,
      record.email,
      record.customerId ? `Customer ${record.customerId}` : "",
      record.productId ? `Product ${record.productId}` : "",
      record.createdAt ? `Created ${String(record.createdAt).slice(0, 10)}` : ""
    ].filter(Boolean).slice(0, 2).join(" | ")
  };
}

function dataManagementSummary(db, options = {}) {
  const includeRecords = options.includeRecords !== false;
  const groups = DATA_MANAGEMENT_GROUPS.map((group) => {
    const rows = dataGroupRows(db, group.key);
    return {
      key: group.key,
      label: group.label,
      count: rows.length,
      records: includeRecords ? rows.slice(0, 150).map((record) => dataRecordPreview(db, group.key, record)) : []
    };
  });
  return {
    ...dataCleanupState(),
    confirmationText: DATA_CLEANUP_CONFIRM_TEXT,
    deleteSelectedConfirmationText: DELETE_SELECTED_CONFIRM_TEXT,
    orphanConfirmationText: CLEAN_ORPHANS_CONFIRM_TEXT,
    groups,
    counts: Object.fromEntries(groups.map((group) => [group.key, group.count])),
    preservedByDefault: ["Owner account", "Login sessions", "Business settings", "Master data", "Uploaded logo", "Backup history"]
  };
}

function normalizeSelection(selection = {}) {
  const normalized = {};
  for (const group of DATA_MANAGEMENT_GROUPS) {
    const ids = Array.isArray(selection[group.key]) ? selection[group.key] : [];
    normalized[group.key] = new Set(ids.map(cleanString).filter(Boolean));
  }
  return normalized;
}

function selectionToPayload(selection = {}) {
  return Object.fromEntries(Object.entries(selection).map(([key, ids]) => [key, Array.from(ids || [])]));
}

function addSelected(selection, key, idValue) {
  if (!idValue || !DATA_MANAGEMENT_GROUP_MAP[key]) return;
  if (!selection[key]) selection[key] = new Set();
  selection[key].add(cleanString(idValue));
}

function addNestedItemSelections(selection, key, rows, parentIdField, parentId) {
  rows.forEach((row) => {
    if (row[parentIdField] === parentId) addSelected(selection, key, row.id);
  });
}

function expandSelectionWithLinkedDependencies(db, selection) {
  const expanded = normalizeSelection(selectionToPayload(selection));
  const invoiceItems = deriveInvoiceItems(db.invoices || []);
  const purchaseItems = derivePurchaseItems(db.purchases || []);
  const orderItems = deriveOrderItems(db.orders || []);

  for (const productId of Array.from(expanded.products || [])) {
    db.inventory.filter((item) => item.productId === productId).forEach((item) => addSelected(expanded, "inventory", item.id));
    (db.inventoryMovements || []).filter((item) => item.productId === productId).forEach((item) => addSelected(expanded, "inventoryMovements", item.id));
    db.billOfMaterials.filter((item) => item.finishedProductId === productId || item.rawMaterialId === productId).forEach((item) => addSelected(expanded, "billOfMaterials", item.id));
    db.invoices.filter((item) => (item.items || []).some((row) => row.productId === productId)).forEach((item) => addSelected(expanded, "invoices", item.id));
    db.purchases.filter((item) => (item.items || []).some((row) => row.productId === productId)).forEach((item) => addSelected(expanded, "purchases", item.id));
    db.orders.filter((item) => (item.items || []).some((row) => row.productId === productId)).forEach((item) => addSelected(expanded, "orders", item.id));
    db.productionBatches.filter((item) => item.finishedProductId === productId).forEach((item) => addSelected(expanded, "productionBatches", item.id));
    db.productionMaterialUsages.filter((item) => item.rawMaterialId === productId || item.productId === productId).forEach((item) => addSelected(expanded, "productionMaterialUsages", item.id));
  }

  for (const customerId of Array.from(expanded.customers || [])) {
    db.invoices.filter((item) => item.customerId === customerId).forEach((item) => addSelected(expanded, "invoices", item.id));
    db.orders.filter((item) => item.customerId === customerId).forEach((item) => addSelected(expanded, "orders", item.id));
    db.payments.filter((item) => item.customerId === customerId).forEach((item) => addSelected(expanded, "payments", item.id));
    db.deliveries.filter((item) => item.customerId === customerId).forEach((item) => addSelected(expanded, "deliveries", item.id));
    db.notes.filter((item) => item.entityType === "customer" && item.entityId === customerId).forEach((item) => addSelected(expanded, "notes", item.id));
    db.attachments.filter((item) => item.entityType === "customer" && item.entityId === customerId).forEach((item) => addSelected(expanded, "attachments", item.id));
  }

  for (const supplierId of Array.from(expanded.suppliers || [])) {
    db.purchases.filter((item) => item.supplierId === supplierId).forEach((item) => addSelected(expanded, "purchases", item.id));
  }

  for (const invoiceId of Array.from(expanded.invoices || [])) {
    addNestedItemSelections(expanded, "invoiceItems", invoiceItems, "invoiceId", invoiceId);
    db.payments.filter((item) => item.invoiceId === invoiceId).forEach((item) => addSelected(expanded, "payments", item.id));
    db.deliveries.filter((item) => item.invoiceId === invoiceId).forEach((item) => addSelected(expanded, "deliveries", item.id));
    (db.inventoryMovements || []).filter((item) => item.referenceType === "INVOICE" && item.referenceId === invoiceId).forEach((item) => addSelected(expanded, "inventoryMovements", item.id));
  }

  for (const orderId of Array.from(expanded.orders || [])) {
    addNestedItemSelections(expanded, "orderItems", orderItems, "orderId", orderId);
    db.invoices.filter((item) => item.orderId === orderId).forEach((item) => addSelected(expanded, "invoices", item.id));
    db.payments.filter((item) => item.orderId === orderId).forEach((item) => addSelected(expanded, "payments", item.id));
    db.deliveries.filter((item) => item.orderId === orderId).forEach((item) => addSelected(expanded, "deliveries", item.id));
  }

  for (const purchaseId of Array.from(expanded.purchases || [])) {
    addNestedItemSelections(expanded, "purchaseItems", purchaseItems, "purchaseId", purchaseId);
    (db.inventoryMovements || []).filter((item) => item.referenceType === "PURCHASE" && item.referenceId === purchaseId).forEach((item) => addSelected(expanded, "inventoryMovements", item.id));
  }

  for (const batchId of Array.from(expanded.productionBatches || [])) {
    db.productionMaterialUsages.filter((item) => item.productionBatchId === batchId).forEach((item) => addSelected(expanded, "productionMaterialUsages", item.id));
    (db.inventoryMovements || []).filter((item) => item.referenceType === "PRODUCTION" && item.referenceId === batchId).forEach((item) => addSelected(expanded, "inventoryMovements", item.id));
  }

  return expanded;
}

function selectedCleanupPreview(db, rawSelection = {}, options = {}) {
  const base = normalizeSelection(rawSelection);
  const selection = options.includeLinkedDependencies ? expandSelectionWithLinkedDependencies(db, base) : base;
  const selected = [];
  const dependencies = [];

  for (const group of DATA_MANAGEMENT_GROUPS) {
    const ids = selection[group.key] || new Set();
    if (!ids.size) continue;
    const rows = dataGroupRows(db, group.key).filter((record) => ids.has(record.id));
    if (rows.length) selected.push({ key: group.key, label: group.label, count: rows.length, records: rows.slice(0, 50).map((record) => dataRecordPreview(db, group.key, record)) });
    for (const record of rows) {
      if (group.collection) {
        const blockers = permanentDeleteBlockers(db, group.collection, record);
        if (blockers.length) dependencies.push({ group: group.label, recordId: record.id, label: recordLabelForDataManagement(group.key, record), dependencies: blockers });
      }
    }
  }

  return {
    selected,
    selection: selectionToPayload(selection),
    dependencies,
    totalSelected: selected.reduce((sum, group) => sum + group.count, 0),
    includeLinkedDependencies: options.includeLinkedDependencies === true
  };
}

function parseDerivedItemId(itemId) {
  const match = cleanString(itemId).match(/^(.+)_item_(\d+)$/);
  if (!match) return null;
  return { parentId: match[1], index: Number(match[2]) - 1 };
}

function recalculatePurchaseTotals(purchase) {
  purchase.subtotal = (purchase.items || []).reduce((sum, item) => sum + cleanNumber(item.lineTotal || cleanNumber(item.quantity) * cleanNumber(item.unitCost)), 0);
  purchase.totalAmount = Math.max(0, cleanNumber(purchase.subtotal) - cleanNumber(purchase.discount) + cleanNumber(purchase.tax));
  purchase.paidAmount = Math.max(0, cleanNumber(purchase.paidAmount));
  purchase.balanceAmount = Math.max(0, cleanNumber(purchase.totalAmount) - cleanNumber(purchase.paidAmount));
  purchase.updatedAt = nowIso();
}

function deleteNestedItems(db, key, ids) {
  let deleted = 0;
  for (const itemId of ids) {
    const parsed = parseDerivedItemId(itemId);
    if (!parsed) continue;
    if (key === "invoiceItems") {
      const invoice = db.invoices.find((item) => item.id === parsed.parentId);
      if (invoice && Array.isArray(invoice.items) && invoice.items[parsed.index]) {
        invoice.items.splice(parsed.index, 1);
        recalculateInvoiceTotals(invoice);
        refreshInvoicePaymentStatus(db, invoice);
        deleted += 1;
      }
    }
    if (key === "purchaseItems") {
      const purchase = db.purchases.find((item) => item.id === parsed.parentId);
      if (purchase && Array.isArray(purchase.items) && purchase.items[parsed.index]) {
        purchase.items.splice(parsed.index, 1);
        recalculatePurchaseTotals(purchase);
        deleted += 1;
      }
    }
    if (key === "orderItems") {
      const order = db.orders.find((item) => item.id === parsed.parentId);
      if (order && Array.isArray(order.items) && order.items[parsed.index]) {
        order.items.splice(parsed.index, 1);
        order.updatedAt = nowIso();
        deleted += 1;
      }
    }
  }
  return deleted;
}

function deleteRecordsBySelection(db, selection) {
  const deleted = [];
  for (const key of DATA_CLEAR_ORDER) {
    const ids = selection[key] || new Set();
    if (!ids.size) continue;
    if (["invoiceItems", "purchaseItems", "orderItems"].includes(key)) {
      const count = deleteNestedItems(db, key, ids);
      if (count) deleted.push({ key, label: DATA_MANAGEMENT_GROUP_MAP[key].label, count });
      continue;
    }
    const group = DATA_MANAGEMENT_GROUP_MAP[key];
    if (!group || !group.collection || !Array.isArray(db[group.collection])) continue;
    const before = db[group.collection].length;
    if (group.collection === "attachments") {
      db[group.collection].filter((record) => ids.has(record.id)).forEach((record) => markUploadedFileDeleted(db, record.fileUploadId || record.id));
    }
    if (group.collection === "expenses") {
      db[group.collection].filter((record) => ids.has(record.id) && record.receiptFileId).forEach((record) => markUploadedFileDeleted(db, record.receiptFileId));
    }
    db[group.collection] = db[group.collection].filter((record) => !ids.has(record.id));
    const count = before - db[group.collection].length;
    if (count) deleted.push({ key, label: group.label, count });
  }
  return deleted;
}

function createSafetyBackupRecord(db, reason) {
  const safetyRecord = writeBackupFile(sanitizeBackup(db), "safety");
  db.backups.unshift(safetyRecord);
  addActivity(db, "cleanup_safety_backup_created", "backup", safetyRecord.id, `Safety backup created before ${reason}.`, { reason });
  return safetyRecord;
}

function clearBusinessData(db, options = {}) {
  const defaults = {
    keepBusinessSettings: true,
    keepMasterData: true,
    keepUploadedLogo: true,
    keepBackupHistory: true,
    keepActivityLogs: false,
    keepRestoreLogs: false,
    keepReminderLogs: false
  };
  const flags = { ...defaults, ...options };
  const preservedSettings = { ...(db.businessSettings || defaultDb().businessSettings) };
  const preservedMasterData = [...(db.masterData || [])];
  const preservedBackups = [...(db.backups || [])];
  const preservedActivity = [...(db.activityLogs || [])];
  const preservedRestoreLogs = [...(db.restoreLogs || [])];
  const preservedReminderLogs = [...(db.reminderLogs || [])];
  const logoIds = [
    preservedSettings.logoFileId,
    preservedSettings.logoAttachmentId,
    preservedSettings.signatureFileId,
    preservedSettings.signatureAttachmentId
  ].map(cleanString).filter(Boolean);
  const preservedLogoUploads = flags.keepUploadedLogo
    ? (db.fileUploads || []).filter((file) => logoIds.includes(file.id))
    : [];

  for (const group of DATA_MANAGEMENT_GROUPS) {
    if (group.collection && Array.isArray(db[group.collection])) db[group.collection] = [];
  }
  db.orderItems = [];
  db.invoiceItems = [];
  db.purchaseItems = [];
  db.fileUploads = preservedLogoUploads;
  db.businessSettings = flags.keepBusinessSettings ? preservedSettings : defaultDb().businessSettings;
  if (!flags.keepUploadedLogo) {
    db.businessSettings.logoFileId = "";
    db.businessSettings.logoAttachmentId = "";
    db.businessSettings.logoUrl = "";
    db.businessSettings.signatureFileId = "";
    db.businessSettings.signatureAttachmentId = "";
  }
  db.masterData = flags.keepMasterData ? preservedMasterData : [];
  db.backups = flags.keepBackupHistory ? preservedBackups : [];
  db.activityLogs = flags.keepActivityLogs ? preservedActivity : [];
  db.restoreLogs = flags.keepRestoreLogs ? preservedRestoreLogs : [];
  db.reminderLogs = flags.keepReminderLogs ? preservedReminderLogs : [];
}

function entityExistsForDataManagement(db, entityType, entityId) {
  const type = cleanString(entityType).toLowerCase();
  const targetId = cleanString(entityId);
  if (!type || !targetId) return false;
  const checks = {
    customer: () => db.customers.some((item) => item.id === targetId && isActive(item)),
    product: () => db.products.some((item) => item.id === targetId && isActive(item)),
    supplier: () => db.suppliers.some((item) => item.id === targetId && isActive(item)),
    purchase: () => db.purchases.some((item) => item.id === targetId && isActive(item)),
    invoice: () => db.invoices.some((item) => item.id === targetId && isActive(item)),
    order: () => db.orders.some((item) => item.id === targetId && isActive(item)),
    delivery: () => db.deliveries.some((item) => item.id === targetId && isActive(item)),
    payment: () => db.payments.some((item) => item.id === targetId && isActive(item)),
    expense: () => db.expenses.some((item) => item.id === targetId && isActive(item)),
    production: () => db.productionBatches.some((item) => item.id === targetId && isActive(item)),
    productionbatch: () => db.productionBatches.some((item) => item.id === targetId && isActive(item)),
    inventory: () => db.inventory.some((item) => item.id === targetId && isActive(item)),
    businesssettings: () => true
  };
  return checks[type] ? checks[type]() : false;
}

function detectOrphanDetails(db) {
  const orphanGroups = [];
  const addGroup = (key, label, records, suggestedAction) => {
    if (records.length) orphanGroups.push({ key, label, count: records.length, suggestedAction, ids: records.map((item) => item.id), records: records.slice(0, 50).map((record) => dataRecordPreview(db, key, record)) });
  };
  addGroup(
    "inventory",
    "Inventory items with missing or archived product",
    db.inventory.filter((item) => {
      const product = findProduct(db, item.productId);
      return !product || !isActive(product);
    }),
    "Archive or delete after confirming this stock is test data."
  );
  addGroup(
    "inventoryMovements",
    "Inventory movements with missing product",
    (db.inventoryMovements || []).filter((item) => !findProduct(db, item.productId)),
    "Delete only when the related product history is test data."
  );
  addGroup(
    "invoiceItems",
    "Invoice item rows with missing invoice",
    (db.invoiceItems || []).filter((item) => !db.invoices.some((invoice) => invoice.id === item.invoiceId)),
    "Delete orphaned derived item rows."
  );
  addGroup(
    "purchaseItems",
    "Purchase item rows with missing purchase",
    (db.purchaseItems || []).filter((item) => !db.purchases.some((purchase) => purchase.id === item.purchaseId)),
    "Delete orphaned derived item rows."
  );
  addGroup(
    "productionMaterialUsages",
    "Production usage rows with missing batch",
    db.productionMaterialUsages.filter((item) => !db.productionBatches.some((batch) => batch.id === item.productionBatchId)),
    "Archive or delete orphaned usage rows."
  );
  addGroup(
    "attachments",
    "Attachments with missing parent record",
    db.attachments.filter((item) => !entityExistsForDataManagement(db, item.entityType, item.entityId)),
    "Archive or delete after checking the uploaded file."
  );
  addGroup(
    "notes",
    "Notes with missing parent record",
    db.notes.filter((item) => !entityExistsForDataManagement(db, item.entityType, item.entityId)),
    "Archive or delete orphaned notes."
  );
  return orphanGroups;
}

function archiveRecordsBySelection(db, selection) {
  const archived = [];
  for (const [key, ids] of Object.entries(selection)) {
    if (!ids || !ids.size) continue;
    const group = DATA_MANAGEMENT_GROUP_MAP[key];
    if (!group || !group.collection || !Array.isArray(db[group.collection])) continue;
    let count = 0;
    for (const record of db[group.collection]) {
      if (!ids.has(record.id)) continue;
      record.status = "ARCHIVED";
      record.archivedAt = record.archivedAt || nowIso();
      record.updatedAt = nowIso();
      count += 1;
    }
    if (count) archived.push({ key, label: group.label, count });
  }
  return archived;
}

route("GET", "/api/data-management/summary", async ({ db, res }) => {
  sendJson(res, 200, { success: true, summary: dataManagementSummary(db) });
});

route("POST", "/api/data-management/preview-cleanup", async ({ db, body, res }) => {
  if (!requireDataCleanupEnabled(res)) return;
  const preview = selectedCleanupPreview(db, body.selectedRecords || body.selection || {}, { includeLinkedDependencies: boolValue(body.includeLinkedDependencies, false) });
  sendJson(res, 200, { success: true, preview, summary: dataManagementSummary(db, { includeRecords: false }) });
});

route("POST", "/api/data-management/delete-selected", async ({ db, body, res }) => {
  if (!requireDataCleanupEnabled(res)) return;
  if (cleanString(body.confirm) !== DELETE_SELECTED_CONFIRM_TEXT) return sendError(res, 400, `Delete selected records requires confirmation text ${DELETE_SELECTED_CONFIRM_TEXT}.`);
  const preview = selectedCleanupPreview(db, body.selectedRecords || body.selection || {}, { includeLinkedDependencies: boolValue(body.includeLinkedDependencies, true) });
  if (!preview.totalSelected) return sendError(res, 400, "Select at least one record to delete.");
  const safetyBackup = boolValue(body.createBackup, true) ? createSafetyBackupRecord(db, "selected record cleanup") : null;
  const deleted = deleteRecordsBySelection(db, normalizeSelection(preview.selection));
  addActivity(db, "data_cleanup_selected_records", "dataManagement", "delete-selected", "Selected test records deleted.", { deleted, safetyBackupId: safetyBackup && safetyBackup.id, includeLinkedDependencies: preview.includeLinkedDependencies });
  await saveDb(db);
  sendJson(res, 200, { success: true, message: safetyBackup ? "A safety backup was created before cleanup." : "Selected records deleted.", deleted, safetyBackup });
});

route("POST", "/api/data-management/clear-business-data", async ({ db, body, res }) => {
  if (!requireDataCleanupEnabled(res)) return;
  if (cleanString(body.confirm) !== DATA_CLEANUP_CONFIRM_TEXT) return sendError(res, 400, `Clear business data requires confirmation text ${DATA_CLEANUP_CONFIRM_TEXT}.`);
  const safetyBackup = boolValue(body.createBackup, true) ? createSafetyBackupRecord(db, "business data cleanup") : null;
  const keepOptions = {
    keepBusinessSettings: boolValue(body.keepBusinessSettings, true),
    keepMasterData: boolValue(body.keepMasterData, true),
    keepUploadedLogo: boolValue(body.keepUploadedLogo, true),
    keepBackupHistory: boolValue(body.keepBackupHistory, true),
    keepActivityLogs: boolValue(body.keepActivityLogs, false),
    keepRestoreLogs: boolValue(body.keepRestoreLogs, false),
    keepReminderLogs: boolValue(body.keepReminderLogs, false)
  };
  clearBusinessData(db, keepOptions);
  if (safetyBackup && !db.backups.some((backup) => backup.id === safetyBackup.id)) db.backups.unshift(safetyBackup);
  addActivity(db, "data_cleanup_business_cleared", "dataManagement", "clear-business-data", "Business data cleared for setup/testing cleanup.", { safetyBackupId: safetyBackup && safetyBackup.id, keepOptions });
  await saveDb(db);
  sendJson(res, 200, { success: true, message: "A safety backup was created before cleanup.", safetyBackup, summary: dataManagementSummary(db, { includeRecords: false }) });
});

route("GET", "/api/data-management/orphans", async ({ db, res }) => {
  if (!requireDataCleanupEnabled(res)) return;
  sendJson(res, 200, { success: true, orphans: detectOrphanDetails(db), summary: dataManagementSummary(db, { includeRecords: false }) });
});

route("POST", "/api/data-management/cleanup-orphans", async ({ db, body, res }) => {
  if (!requireDataCleanupEnabled(res)) return;
  if (cleanString(body.confirm) !== CLEAN_ORPHANS_CONFIRM_TEXT) return sendError(res, 400, `Orphan cleanup requires confirmation text ${CLEAN_ORPHANS_CONFIRM_TEXT}.`);
  const action = cleanString(body.action || "archive").toLowerCase() === "delete" ? "delete" : "archive";
  const orphanGroups = detectOrphanDetails(db);
  const selection = normalizeSelection(Object.fromEntries(orphanGroups.map((group) => [group.key, group.ids])));
  const safetyBackup = boolValue(body.createBackup, true) ? createSafetyBackupRecord(db, "orphan cleanup") : null;
  const changed = action === "delete" ? deleteRecordsBySelection(db, selection) : archiveRecordsBySelection(db, selection);
  addActivity(db, action === "delete" ? "data_cleanup_orphans_deleted" : "data_cleanup_orphans_archived", "dataManagement", "cleanup-orphans", `Orphaned records ${action === "delete" ? "deleted" : "archived"}.`, { changed, safetyBackupId: safetyBackup && safetyBackup.id });
  await saveDb(db);
  sendJson(res, 200, { success: true, message: safetyBackup ? "A safety backup was created before cleanup." : "Orphan cleanup complete.", action, changed, safetyBackup, orphans: detectOrphanDetails(db) });
});

route("POST", "/api/backup/create", async ({ db, body, res }) => {
  const requestedType = cleanString(body.backupType || body.type || "json").toLowerCase();
  if (requestedType === "zip") return sendError(res, 400, "ZIP backups are not enabled in this dependency-free local build. Create a JSON backup for business records.");
  const backup = sanitizeBackup(db);
  const record = writeBackupFile(backup, "backup");
  db.backups.unshift(record);
  addNotification(db, "backup_completed", "Backup completed", `${record.fileName} is ready to download.`, "backup", record.id);
  addActivity(db, "backup_created", "backup", record.id, "JSON backup created.");
  await saveDb(db);
  sendJson(res, 201, { success: true, backup: record });
});

route("GET", "/api/backup", async ({ db, res }) => {
  sendJson(res, 200, { success: true, backups: db.backups.filter((item) => !item.deletedAt) });
});

route("GET", "/api/backup/history", async ({ db, res }) => {
  sendJson(res, 200, { success: true, backups: db.backups.filter((item) => !item.deletedAt) });
});

route("GET", "/api/backup/:id/download", async ({ db, params, res }) => {
  const backup = db.backups.find((item) => item.id === params.id);
  if (!backup) return sendError(res, 404, "Backup not found.");
  sendFile(res, path.join(BACKUP_DIR, backup.fileName), "application/json; charset=utf-8", { "Content-Disposition": `attachment; filename="${backup.fileName}"` });
});

route("GET", "/api/backup/download/:id", async ({ db, params, res }) => {
  const backup = db.backups.find((item) => item.id === params.id && !item.deletedAt);
  if (!backup) return sendError(res, 404, "Backup not found.");
  sendFile(res, path.join(BACKUP_DIR, backup.fileName), "application/json; charset=utf-8", { "Content-Disposition": `attachment; filename="${backup.fileName}"` });
});

route("DELETE", "/api/backup/:id", async ({ db, params, res }) => {
  const backup = db.backups.find((item) => item.id === params.id);
  if (!backup) return sendError(res, 404, "Backup not found.");
  backup.deletedAt = nowIso();
  addActivity(db, "backup_deleted", "backup", backup.id, "Backup record moved to recycle state.");
  await saveDb(db);
  sendJson(res, 200, { success: true });
});

route("POST", "/api/backup/validate", async ({ body, res }) => {
  const result = validateBackupDocument(body.backup);
  sendJson(res, result.valid ? 200 : 400, { success: result.valid, ...result });
});

route("POST", "/api/backup/restore", async ({ db, body, res }) => {
  if (!body.confirm || body.confirm !== "RESTORE") return sendError(res, 400, "Restore requires confirmation text RESTORE.");
  const backup = body.backup;
  const validation = validateBackupDocument(backup);
  if (!validation.valid) return sendJson(res, 400, { success: false, message: "Invalid DawnGas backup file.", errors: validation.errors, preview: validation.preview });
  const safetyRecord = writeBackupFile(sanitizeBackup(db), "safety");
  const preservedUsers = db.users;
  const preservedSessions = db.sessions;
  const restored = normalizeDb(backup.data);
  restored.users = preservedUsers;
  restored.sessions = preservedSessions;
  restored.passwordResetTokens = [];
  restored.backups = [safetyRecord, ...(restored.backups || [])];
  restored.restoreLogs.unshift({
    id: id("restore"),
    backupFormat: backup.manifest.format,
    backupGeneratedAt: backup.manifest.generatedAt,
    safetyBackupId: safetyRecord.id,
    collectionCounts: validation.preview.collectionCounts,
    warnings: validation.preview.warnings,
    createdAt: nowIso()
  });
  addActivity(restored, "backup_restored", "backup", "restore", "Backup data restored.", { safetyBackupId: safetyRecord.id });
  await saveDb(restored);
  sendJson(res, 200, { success: true, message: "Backup restored. Refresh the app to reload data.", safetyBackup: safetyRecord, preview: validation.preview });
});

route("GET", "/api/exports/:type/csv", async ({ db, params, res }) => {
  const type = params.type;
  let title = "";
  let rows = [];
  let headers = [];
  let totals = [];
  if (type === "customers") {
    title = "Customer Export";
    rows = db.customers.filter(isActive).map((item) => enrichCustomer(db, item));
    headers = [
      { label: "Name", value: "name" },
      { label: "Phone", value: "phone" },
      { label: "Email", value: "email" },
      { label: "Address", value: "address" },
      { label: "Balance", value: (row) => csvNumber(row.balance) },
      { label: "Total Orders", value: "totalOrders" }
    ];
    totals = [["Total Customers", rows.length], ["Total Balance", csvNumber(rows.reduce((sum, row) => sum + cleanNumber(row.balance), 0))]];
  } else if (type === "payments") {
    title = "Payment Export";
    rows = activePayments(db);
    headers = [
      { label: "Receipt Number", value: "receiptNumber" },
      { label: "Customer", value: (row) => (findCustomer(db, row.customerId) || {}).name || "" },
      { label: "Invoice Number", value: (row) => (db.invoices.find((invoice) => invoice.id === row.invoiceId) || {}).invoiceNumber || "" },
      { label: "Payment Date", value: (row) => csvDate(row.paymentDate) },
      { label: "Method", value: (row) => titleCaseEnum(row.paymentMethod || row.method) },
      { label: "Amount", value: (row) => csvNumber(row.amount) },
      { label: "Status", value: "status" }
    ];
    totals = [["Total Payments", rows.length], ["Amount Received", csvNumber(rows.reduce((sum, row) => sum + cleanNumber(row.amount), 0))]];
  } else if (type === "expenses") {
    title = "Expense Export";
    rows = activeExpenses(db);
    headers = [
      { label: "Title", value: "title" },
      { label: "Category", value: (row) => humanizeKey(row.category) },
      { label: "Expense Date", value: (row) => csvDate(row.expenseDate) },
      { label: "Payment Method", value: (row) => titleCaseEnum(row.paymentMethod || row.method) },
      { label: "Amount", value: (row) => csvNumber(row.amount) },
      { label: "Receipt Attachment", value: "receiptFileName" },
      { label: "Notes", value: "notes" }
    ];
    totals = [["Total Expenses", rows.length], ["Expense Total", csvNumber(rows.reduce((sum, row) => sum + cleanNumber(row.amount), 0))]];
  } else if (type === "inventory") {
    title = "Inventory Export";
    rows = db.inventory.filter(isActive).map((item) => enrichInventory(db, item));
    headers = [
      { label: "Item Name", value: (row) => (row.product || {}).name || "" },
      { label: "Item Type", value: (row) => displayItemType(row.itemType) },
      { label: "Category", value: "categoryName" },
      { label: "SKU", value: (row) => (row.product || {}).sku || "" },
      { label: "Unit", value: (row) => (row.product || {}).unitOfMeasure || "" },
      { label: "Current Stock", value: "currentStock" },
      { label: "Reserved Stock", value: "reservedStock" },
      { label: "Available Stock", value: "availableStock" },
      { label: "Low Stock Threshold", value: "lowStockThreshold" },
      { label: "Reorder Quantity", value: "reorderQuantity" },
      { label: "Storage Location", value: (row) => row.storageLocationName || row.storageLocationSnapshotName || row.storageLocation },
      { label: "Stock Status", value: "status" }
    ];
    totals = [["Inventory Items", rows.length], ["Inventory Value", csvNumber(inventoryValue(db))]];
  } else if (type === "products") {
    title = "Product Export";
    rows = db.products.filter(isActive).map((item) => enrichProduct(db, item));
    headers = [
      { label: "Item Name", value: "name" },
      { label: "SKU", value: "sku" },
      { label: "Item Type", value: (row) => displayItemType(row.itemType) },
      { label: "Category", value: "categoryName" },
      { label: "Unit", value: "unitOfMeasure" },
      { label: "Cost Price", value: (row) => csvNumber(row.costPrice) },
      { label: "Selling Price", value: (row) => csvNumber(row.sellingPrice || row.standardServiceCharge) },
      { label: "Current Stock", value: (row) => row.stock ? row.stock.currentStock : "" },
      { label: "Low Stock Threshold", value: (row) => row.stock ? row.stock.lowStockThreshold : "" },
      { label: "Stock Status", value: (row) => row.trackInventory ? row.stockStatus : "NOT_TRACKED" },
      { label: "Storage Location", value: (row) => row.stock ? storageLocationLabel(db, row.stock) : "" },
      { label: "Track Inventory", value: (row) => (row.trackInventory ? "Yes" : "No") },
      { label: "Status", value: "status" }
    ];
    totals = [["Total Products", rows.length]];
  } else if (type === "suppliers") {
    title = "Supplier Export";
    rows = db.suppliers.filter(isActive).map((item) => enrichSupplier(db, item));
    headers = [
      { label: "Supplier Name", value: "name" },
      { label: "Contact Person", value: "contactPerson" },
      { label: "Phone", value: "phone" },
      { label: "Email", value: "email" },
      { label: "Address", value: "address" },
      { label: "Total Purchases", value: "totalPurchases" },
      { label: "Purchase Total", value: (row) => csvNumber(row.purchaseTotal) },
      { label: "Outstanding Balance", value: (row) => csvNumber(row.outstandingBalance) },
      { label: "Status", value: "status" }
    ];
    totals = [["Total Suppliers", rows.length], ["Outstanding Balance", csvNumber(rows.reduce((sum, row) => sum + cleanNumber(row.outstandingBalance), 0))]];
  } else if (type === "purchases") {
    title = "Purchase Export";
    rows = db.purchases.filter(isActive).map((item) => enrichPurchase(db, item));
    headers = [
      { label: "Purchase Number", value: "purchaseNumber" },
      { label: "Supplier", value: (row) => row.supplier?.name || "" },
      { label: "Purchase Date", value: (row) => csvDate(row.purchaseDate) },
      { label: "Items", value: (row) => (row.items || []).map((item) => `${item.itemName || item.product?.name || ""} x ${item.quantity}`).join("; ") },
      { label: "Total", value: (row) => csvNumber(row.totalAmount) },
      { label: "Paid", value: (row) => csvNumber(row.paidAmount) },
      { label: "Balance", value: (row) => csvNumber(row.balanceAmount) },
      { label: "Invoice Status", value: "status" },
      { label: "Payment Status", value: "paymentStatus" }
    ];
    totals = [["Total Purchases", rows.length], ["Purchase Total", csvNumber(rows.reduce((sum, row) => sum + cleanNumber(row.totalAmount), 0))]];
  } else if (type === "invoices") {
    title = "Invoice Export";
    rows = activeInvoices(db).map((item) => enrichInvoice(db, item));
    headers = [
      { label: "Invoice Number", value: "invoiceNumber" },
      { label: "Customer", value: (row) => row.customer?.name || "" },
      { label: "Invoice Date", value: (row) => csvDate(row.invoiceDate) },
      { label: "Due Date", value: (row) => csvDate(row.dueDate) },
      { label: "Total", value: (row) => csvNumber(row.totalAmount) },
      { label: "Paid", value: (row) => csvNumber(row.paidAmount) },
      { label: "Balance", value: (row) => csvNumber(row.balanceAmount) },
      { label: "Status", value: "status" }
    ];
    totals = [["Total Invoices", rows.length], ["Invoice Total", csvNumber(rows.reduce((sum, row) => sum + cleanNumber(row.totalAmount), 0))], ["Outstanding Balance", csvNumber(rows.reduce((sum, row) => sum + cleanNumber(row.balanceAmount), 0))]];
  } else {
    return sendError(res, 404, "Export type not found.");
  }
  const csv = businessCsv(db, title, rows, headers, { totals });
  sendText(res, 200, csv, "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename="dawngas-${type}-${todayDate()}.csv"` });
});

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendError(res, 403, "Forbidden.");
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  };
  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleRequest(req, res) {
  const db = await loadDb();
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, responseHeaders({ "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }));
    return res.end();
  }
  if (!parsedUrl.pathname.startsWith("/api/")) return serveStatic(req, res, parsedUrl.pathname);
  const matched = matchRoute(req.method, parsedUrl.pathname);
  if (!matched) return sendError(res, 404, "API route not found.");
  let body = {};
  try {
    if (["POST", "PATCH", "DELETE"].includes(req.method)) body = await readBody(req);
  } catch (error) {
    return sendError(res, error.statusCode || 400, error.message);
  }
  const current = getSession(req, db);
  if (matched.auth && !current) return sendError(res, 401, "Authentication required.");
  try {
    await matched.handler({
      req,
      res,
      db,
      body,
      query: queryObject(parsedUrl),
      params: matched.params,
      current
    });
  } catch (error) {
    console.error(error);
    sendError(res, error.statusCode || 500, error.statusCode ? error.message : "Something went wrong.", error.statusCode ? undefined : error.message);
  }
}

async function startServer() {
  ensureDirectories();
  mongoDb = await connectDB();
  await ensureMongoIndexes();
  await seedDefaultCategories();
  await seedDefaultMasterData();
  await migrateLegacyInventoryMovements();
  const existingSettings = await mongoDb.collection(SINGLETON_COLLECTIONS.businessSettings).findOne({ id: "business" });
  if (!existingSettings) {
    await mongoDb.collection(SINGLETON_COLLECTIONS.businessSettings).insertOne({ ...defaultDb().businessSettings, id: "business" });
  }
  const existingPreferences = await mongoDb.collection(SINGLETON_COLLECTIONS.dashboardPreferences).findOne({ id: "dashboard" });
  if (!existingPreferences) {
    await mongoDb.collection(SINGLETON_COLLECTIONS.dashboardPreferences).insertOne({ ...defaultDb().dashboardPreferences, id: "dashboard" });
  }
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`DawnGas is running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error(`Failed to start DawnGas: ${error.message}`);
  process.exit(1);
});
