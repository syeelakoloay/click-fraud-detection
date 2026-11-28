"use strict";

const crypto = require("node:crypto");

function safeCompare(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createGoogleAdsController({ googleAdsService, env = process.env } = {}) {
  if (!googleAdsService) throw new TypeError("googleAdsService wajib diisi.");

  function requireActionKey(req) {
    const expected = String(env.GOOGLE_ADS_ACTION_KEY || "").trim();
    if (!expected) {
      const error = new Error("GOOGLE_ADS_ACTION_KEY belum dikonfigurasi pada backend/.env.");
      error.status = 503;
      error.code = "GOOGLE_ADS_ACTION_KEY_MISSING";
      throw error;
    }
    const supplied = req.get("x-google-ads-action-key") || "";
    if (!safeCompare(supplied, expected)) {
      const error = new Error("Kunci otorisasi tindakan Google Ads tidak valid.");
      error.status = 403;
      error.code = "GOOGLE_ADS_ACTION_KEY_INVALID";
      throw error;
    }
  }

  function requireMutationsEnabled() {
    if (String(env.GOOGLE_ADS_MUTATIONS_ENABLED || "false").toLowerCase() !== "true") {
      const error = new Error("Mutasi Google Ads dinonaktifkan. Ubah GOOGLE_ADS_MUTATIONS_ENABLED=true setelah konfigurasi dan pengujian read-only selesai.");
      error.status = 403;
      error.code = "GOOGLE_ADS_MUTATIONS_DISABLED";
      throw error;
    }
  }

  function sendError(res, error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    return res.status(status).json({
      error: {
        code: error.code || "GOOGLE_ADS_REQUEST_FAILED",
        message: error.message || "Permintaan Google Ads gagal.",
      },
    });
  }

  return {
    getStatus(_req, res) {
      return res.json({ data: googleAdsService.getStatus() });
    },

    async listCustomers(req, res) {
      try {
        requireActionKey(req);
        return res.json({ data: await googleAdsService.listAccessibleCustomers() });
      } catch (error) { return sendError(res, error); }
    },

    async listCampaigns(req, res) {
      try {
        requireActionKey(req);
        return res.json({ data: await googleAdsService.listCampaigns(req.query.customerId) });
      } catch (error) { return sendError(res, error); }
    },

    async listIpBlocks(req, res) {
      try {
        requireActionKey(req);
        return res.json({ data: await googleAdsService.listCampaignIpBlocks(req.query.customerId, req.params.campaignId) });
      } catch (error) { return sendError(res, error); }
    },

    async pauseCampaign(req, res) {
      try {
        requireActionKey(req);
        requireMutationsEnabled();
        const campaignId = String(req.params.campaignId || "");
        if (req.body?.confirm !== `PAUSE ${campaignId}`) {
          const error = new Error(`Konfirmasi harus persis: PAUSE ${campaignId}`);
          error.status = 400;
          error.code = "GOOGLE_ADS_CONFIRMATION_REQUIRED";
          throw error;
        }
        const result = await googleAdsService.pauseCampaign(req.body?.customerId, campaignId);
        return res.json({ data: result });
      } catch (error) { return sendError(res, error); }
    },

    async excludeIps(req, res) {
      try {
        requireActionKey(req);
        requireMutationsEnabled();
        const campaignId = String(req.params.campaignId || "");
        if (req.body?.confirm !== `EXCLUDE ${campaignId}`) {
          const error = new Error(`Konfirmasi harus persis: EXCLUDE ${campaignId}`);
          error.status = 400;
          error.code = "GOOGLE_ADS_CONFIRMATION_REQUIRED";
          throw error;
        }
        const result = await googleAdsService.excludeCampaignIps(req.body?.customerId, campaignId, req.body?.ips);
        return res.json({ data: result });
      } catch (error) { return sendError(res, error); }
    },

    async getTrainingStatus(req, res) {
      try {
        requireActionKey(req);
        return res.json({ data: await googleAdsService.getCampaignModelTrainingStatus() });
      } catch (error) { return sendError(res, error); }
    },

    async syncTrainingData(req, res) {
      try {
        requireActionKey(req);
        if (req.body?.confirm !== "SYNC GOOGLE ADS DATA") {
          const error = new Error("Konfirmasi harus persis: SYNC GOOGLE ADS DATA");
          error.status = 400;
          error.code = "GOOGLE_ADS_CONFIRMATION_REQUIRED";
          throw error;
        }
        const result = await googleAdsService.syncCampaignDailyTrainingData(
          req.body?.customerId,
          req.body?.startDate,
          req.body?.endDate,
        );
        return res.status(201).json({ data: result });
      } catch (error) { return sendError(res, error); }
    },
  };
}

module.exports = createGoogleAdsController;
