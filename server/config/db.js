const { MongoClient } = require("mongodb");

const mongoCache = global.__dawngasMongoCache || {
  client: null,
  database: null,
  promise: null,
  uri: null,
  dbName: null
};

global.__dawngasMongoCache = mongoCache;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || "dawngas";

  if (!uri) {
    throw new Error("MONGODB_URI is required. Add it to your .env file.");
  }

  if (mongoCache.database && mongoCache.uri === uri && mongoCache.dbName === dbName) {
    return mongoCache.database;
  }

  if (!mongoCache.promise || mongoCache.uri !== uri || mongoCache.dbName !== dbName) {
    mongoCache.uri = uri;
    mongoCache.dbName = dbName;
    mongoCache.client = new MongoClient(uri, {
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 10),
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
      connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10000)
    });
    mongoCache.promise = mongoCache.client.connect();
  }

  await mongoCache.promise;
  mongoCache.database = mongoCache.client.db(dbName);
  console.log(`MongoDB connected. Database: ${dbName}`);
  return mongoCache.database;
}

function getDB() {
  if (!mongoCache.database) {
    throw new Error("MongoDB has not been connected yet.");
  }
  return mongoCache.database;
}

async function closeDB() {
  if (mongoCache.client) {
    await mongoCache.client.close();
  }
  mongoCache.client = null;
  mongoCache.database = null;
  mongoCache.promise = null;
  mongoCache.uri = null;
  mongoCache.dbName = null;
}

module.exports = {
  connectDB,
  getDB,
  closeDB
};
