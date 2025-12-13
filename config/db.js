import { MongoClient, ServerApiVersion } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;

console.log('MongoDB URI:', uri ? 'Loaded ✓' : 'NOT LOADED ✗');
console.log('URI starts with:', uri?.substring(0, 20));

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;
let usersCollection;
let issuesCollection;
let paymentsCollection;
let staffCollection;
let isConnected = false;

async function connectDB() {
  if (isConnected && db) {
    return;
  }

  try {
    if (!client.topology || !client.topology.isConnected()) {
      await client.connect();
    }
    console.log("✅ Connected to MongoDB!");
    
    db = client.db("civixDB");
    usersCollection = db.collection("users");
    issuesCollection = db.collection("issues");
    paymentsCollection = db.collection("payments");
    staffCollection = db.collection("staff");
    
    try {
      await issuesCollection.createIndex({ status: 1 });
      await issuesCollection.createIndex({ priority: 1 });
      await issuesCollection.createIndex({ userEmail: 1 });
      await usersCollection.createIndex({ email: 1 }, { unique: true });
      console.log("✅ Database indexes created!");
    } catch (indexError) {
      console.log("Index creation skipped (may already exist)");
    }
    
    isConnected = true;
    
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    isConnected = false;
    throw error;
  }
}

export { connectDB, db, usersCollection, issuesCollection, paymentsCollection, staffCollection, client };