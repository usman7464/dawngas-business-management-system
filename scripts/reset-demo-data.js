require("dotenv").config({ quiet: true });
const { MongoClient } = require("mongodb");

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dawngas";
const dbName = process.env.MONGODB_DB_NAME || "dawngas";

const collections = [
  "productcategories",
  "masterdata",
  "products",
  "billofmaterials",
  "inventoryitems",
  "inventorymovements",
  "suppliers",
  "purchases",
  "purchaseitems",
  "productionbatches",
  "productionmaterialusages",
  "customers",
  "orders",
  "orderitems",
  "invoices",
  "invoiceitems",
  "deliveries",
  "payments",
  "expenses",
  "notes",
  "attachments",
  "fileuploads",
  "notifications",
  "activitylogs",
  "backuprecords",
  "restorelogs",
  "reminderlogs"
];

async function main() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);
  const summary = {};

  for (const collectionName of collections) {
    const result = await db.collection(collectionName).deleteMany({ isDemo: true });
    summary[collectionName] = result.deletedCount;
  }

  await client.close();
  console.log("Demo data reset complete. Only records marked isDemo:true were removed.");
  console.table(summary);
}

main().catch((error) => {
  console.error(`Demo reset failed: ${error.message}`);
  process.exit(1);
});
