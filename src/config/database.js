const mongoose = require("mongoose");

async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI belum didefinisikan.");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB berhasil terhubung.");
}

module.exports = connectDatabase;
