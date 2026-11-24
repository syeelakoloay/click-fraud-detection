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
      enum: ["historical_dataset_label", "ml_prediction", "behavioral_rule", "manual"],
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
    detection_reason: {
      type: String,
      trim: true,
      maxlength: 256,
    },
    google_ads_campaign_id: {
      type: String,
      trim: true,
    },
    google_ads_exclusion_status: {
      type: String,
      enum: ["not_configured", "pending", "excluded", "skipped", "failed"],
      default: "not_configured",
    },
    google_ads_exclusion_at: {
      type: Date,
    },
    google_ads_exclusion_error: {
      type: String,
      maxlength: 512,
    },
  },
  {
    collection: "blocked_ips",
    versionKey: false,
  }
);

module.exports = mongoose.model("BlockedIP", blockedIPSchema);
