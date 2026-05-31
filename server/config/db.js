const { MongoClient } = require("mongodb");

let client;
let database;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || "dawngas";

  if (!uri) {
    throw new Error("MONGODB_URI is required. Add it to your .env file.");
  }

  client = new MongoClient(uri);
  await client.connect();
  database = client.db(dbName);
  console.log(`MongoDB connected. Database: ${dbName}`);
  return database;
}

function getDB() {
  if (!database) {
    throw new Error("MongoDB has not been connected yet.");
  }
  return database;
}

async function closeDB() {
  if (client) {
    await client.close();
  }
}

module.exports = {
  connectDB,
  getDB,
  closeDB
};
