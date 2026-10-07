const mongoose = require("mongoose");

/*
 * Baseline schema.
 * The project reference requires MongoDB to store model-run results and
 * names the evaluation metrics, but it does not define a complete model-run schema.
 * Therefore only the minimum fields needed to represent those documented metrics
 * are included here. This is a technical design baseline, not a claim that the
 * reference document already specifies this exact schema.
 */
const modelRunSchema = new mongoose.Schema(
  {
    model_type: {
      type: String,
      required: true,
      trim: true,
    },
    accuracy: {
      type: Number,
      min: 0,
      max: 1,
    },
    precision: {
      type: Number,
      min: 0,
      max: 1,
    },
    recall: {
      type: Number,
      min: 0,
      max: 1,
    },
    f1_score: {
      type: Number,
      min: 0,
      max: 1,
    },
    roc_auc: {
      type: Number,
      min: 0,
      max: 1,
    },
  },
  {
    collection: "model_runs",
    versionKey: false,
  }
);

module.exports = mongoose.model("ModelRun", modelRunSchema);
