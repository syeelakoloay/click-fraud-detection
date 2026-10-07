require("dotenv").config();

const mongoose = require("mongoose");
const connectDatabase = require("./config/database");
const { Event, BlockedIP, ModelRun } = require("./models");

async function verifyDatabase() {
  const models = [Event, BlockedIP, ModelRun];

  try {
    await connectDatabase();

    const collections = await mongoose.connection.db
      .listCollections({}, { nameOnly: true })
      .toArray();

    const collectionNames = new Set(collections.map((item) => item.name));

    console.log("\n=== VERIFIKASI COLLECTION ===");
    for (const model of models) {
      const exists = collectionNames.has(model.collection.name);
      console.log(`${model.collection.name}: ${exists ? "ADA" : "TIDAK ADA"}`);
    }

    console.log("\n=== VERIFIKASI INDEX ===");
    for (const model of models) {
      const indexes = await model.collection.indexes();
      console.log(`\n${model.collection.name}`);
      for (const index of indexes) {
        console.log(JSON.stringify(index));
      }
    }
  } catch (error) {
    console.error("Gagal melakukan verifikasi database:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

verifyDatabase();
