const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    click_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    user_id: {
      type: String,
      required: false,
      default: "anonymous",
      trim: true,
    },
    ip_address: {
      type: String,
      required: true,
      trim: true,
    },
    device_type: {
      type: String,
      required: true,
      enum: ["Desktop", "Tablet", "Mobile"],
    },
    browser: {
      type: String,
      required: true,
      enum: ["Chrome", "Safari", "Edge", "Firefox", "Opera"],
    },
    operating_system: {
      type: String,
      required: true,
      enum: ["Windows", "macOS", "Linux", "Android", "iOS"],
    },
    referrer_url: {
      type: String,
      required: false,
      default: "unknown",
      trim: true,
    },
    page_url: {
      type: String,
      required: false,
      default: "unknown",
      trim: true,
    },
    click_duration: {
      type: Number,
      required: true,
      min: 0,
    },
    scroll_depth: {
      type: Number,
      required: true,
      min: 0,
      max: 99,
    },
    mouse_movement: {
      type: Number,
      required: true,
      min: 0,
    },
    keystrokes_detected: {
      type: Number,
      required: true,
      min: 0,
    },
    ad_position: {
      type: String,
      required: true,
      enum: ["Top", "Side", "Bottom"],
    },
    click_frequency: {
      type: Number,
      required: true,
      min: 1,
    },
    time_since_last_click: {
      type: Number,
      required: true,
      min: 1,
    },
    device_ip_reputation: {
      type: String,
      required: true,
      enum: ["Good", "Suspicious", "Bad"],
    },
    VPN_usage: {
      type: Number,
      required: true,
      enum: [0, 1],
    },
    proxy_usage: {
      type: Number,
      required: true,
      enum: [0, 1],
    },
    // Skor dataset sumber bersifat opsional untuk event live; model utama tidak memakainya.
    bot_likelihood_score: {
      type: Number,
      required: false,
      min: 0,
      max: 1,
    },
    // Label aktual tetap digunakan untuk dataset historis dan evaluasi.
    // Event real-time tidak selalu memiliki ground-truth saat diterima.
    is_fraudulent: {
      type: Number,
      required: false,
      enum: [0, 1],
    },
    predicted_is_fraudulent: {
      type: Number,
      required: false,
      enum: [0, 1],
    },
    prediction_probability: {
      type: Number,
      required: false,
      min: 0,
      max: 1,
    },
    prediction_source: {
      type: String,
      required: false,
      enum: ["model", "ip_list"],
    },
    prediction_status: {
      type: String,
      required: false,
      enum: ["completed", "blocked", "unavailable"],
    },
    budget: {
      type: Number,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "budget harus berupa bilangan bulat Rupiah.",
      },
    },
  },
  {
    collection: "events",
    versionKey: false,
  }
);

// click_id: unique identifier for each event.
// The unique option creates a unique MongoDB index.

// ip_address: used for event lookup in the IP mitigation context.
eventSchema.index({ ip_address: 1 });

// timestamp: supports time-based traffic monitoring queries.
// This is a technical design decision derived from the dashboard requirement.
eventSchema.index({ timestamp: -1 });

module.exports = mongoose.model("Event", eventSchema);
