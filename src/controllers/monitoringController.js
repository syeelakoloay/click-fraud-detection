"use strict";

const METRIC_FIELDS = Object.freeze([
  "model_type",
  "accuracy",
  "precision",
  "recall",
  "f1_score",
  "roc_auc",
]);

function createMonitoringController({ monitoringService, modelRunService }) {
  if (!monitoringService || !modelRunService) {
    throw new TypeError("monitoringService dan modelRunService wajib disediakan.");
  }

  async function getSummary(req, res, next) {
    try {
      const data = await monitoringService.getMonitoringSnapshot({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        interval: req.query.interval,
        blockedIPLimit: req.query.blockedIPLimit,
      });

      return res.status(200).json({ data });
    } catch (error) {
      return next(error);
    }
  }

  async function getMetrics(_req, res, next) {
    try {
      const modelStatus = await modelRunService.getModelStatus();
      const latestModelRun = modelStatus.latestModelRun;

      // Return only metrics actually stored in the existing ModelRun schema.
      // Missing records or fields stay missing; no metric is calculated or inferred here.
      const data = latestModelRun
        ? Object.fromEntries(
            METRIC_FIELDS
              .filter((field) => Object.prototype.hasOwnProperty.call(latestModelRun, field)
                && latestModelRun[field] !== undefined)
              .map((field) => [field, latestModelRun[field]])
          )
        : null;

      return res.status(200).json({
        data,
        status: modelStatus.status,
        note: modelStatus.note,
      });
    } catch (error) {
      return next(error);
    }
  }

  async function getTraffic(req, res, next) {
    try {
      const data = await monitoringService.getTrafficByTime({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        interval: req.query.interval,
      });

      return res.status(200).json({ data });
    } catch (error) {
      return next(error);
    }
  }

  return { getSummary, getMetrics, getTraffic };
}

module.exports = createMonitoringController;
