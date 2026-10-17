"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const connectDatabase = require("./config/database");
const { createApp } = require("./app");

async function startServer() {
  await connectDatabase();
  const app = createApp();
  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT harus berupa bilangan bulat antara 1 dan 65535.");
  }

  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, () => resolve(instance));
    instance.once("error", reject);
  });

  console.log(`Express API berjalan di http://localhost:${port}`);
  console.log("Health check: /health; event API: /api/events");

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nMenerima ${signal}; menutup server...`);
    server.close(async (closeError) => {
      try {
        await mongoose.connection.close();
        if (closeError) {
          console.error("Server ditutup dengan kesalahan:", closeError.message);
          process.exitCode = 1;
        } else {
          console.log("Server dan koneksi MongoDB ditutup dengan aman.");
        }
      } catch (error) {
        console.error("Gagal menutup koneksi MongoDB:", error.message);
        process.exitCode = 1;
      }
    });
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  return server;
}

if (require.main === module) {
  startServer().catch(async (error) => {
    console.error("Gagal menjalankan Express API:", error.message);
    try {
      await mongoose.connection.close();
    } catch (_) {
      // Keep the original startup error as the primary diagnostic.
    }
    process.exitCode = 1;
  });
}

module.exports = { startServer };
