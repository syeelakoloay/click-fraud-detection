"use strict";

function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? "error" : "info",
      method: req.method,
      path: req.originalUrl.split("?")[0],
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    };

    console.log(JSON.stringify(logEntry));
  });

  next();
}

module.exports = { requestLogger };
