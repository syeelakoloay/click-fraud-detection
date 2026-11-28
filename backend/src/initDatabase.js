require("dotenv").config();

const mongoose = require("mongoose");
const connectDatabase = require("./config/database");
const { Event, BlockedIP, ModelRun } = require("./models");

async function initializeDatabase() {
  try {
    await connectDatabase();

    // init() ensures indexes are built for the model.
    // It also allows Mongoose to create the collection when needed.
    await Event.init();
    await BlockedIP.init();
    await ModelRun.init();

    console.log("Collection dan index berhasil diinisialisasi oleh Mongoose.");
  } catch (error) {
    console.error("Gagal menginisialisasi database:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

initializeDatabase();
