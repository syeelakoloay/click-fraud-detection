const mongoose = require("mongoose");

const blockedIPSchema = new mongoose.Schema(
  {
    ip_address: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    source: {
      type: String,
      enum: ["historical_dataset_label", "ml_prediction", "manual"],
      default: "manual",
    },
    source_event_count: {
      type: Number,
      min: 1,
    },
    blocked_at: {
      type: Date,
      default: Date.now,
    },
    last_seen_at: {
      type: Date,
    },
  },
  {
    collection: "blocked_ips",
    versionKey: false,
  }
);

module.exports = mongoose.model("BlockedIP", blockedIPSchema);
