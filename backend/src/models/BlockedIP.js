const mongoose = require("mongoose");

const blockedIPSchema = new mongoose.Schema(
  {
    ip_address: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  {
    collection: "blocked_ips",
    versionKey: false,
  }
);

module.exports = mongoose.model("BlockedIP", blockedIPSchema);
