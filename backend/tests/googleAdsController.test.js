"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const createGoogleAdsController = require("../src/controllers/googleAdsController");

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

const service = {
  getStatus: () => ({ configured: true, mutationsEnabled: true }),
  listAccessibleCustomers: async () => [{ customerId: "1234567890" }],
  listCampaigns: async () => [],
  listCampaignIpBlocks: async () => [],
  pauseCampaign: async (_customerId, id) => ({ campaignId: id, status: "PAUSED" }),
  excludeCampaignIps: async (_customerId, id, ips) => ({ campaignId: id, added: ips.length }),
  syncCampaignDailyTrainingData: async () => ({ rows: 10 }),
  getCampaignModelTrainingStatus: async () => ({ status: "not_trained", reason: "Belum dilatih" }),
};
const env = { GOOGLE_ADS_ACTION_KEY: "test-secret", GOOGLE_ADS_MUTATIONS_ENABLED: "true" };
const req = (body = {}, header = "test-secret") => ({ body, params: { campaignId: "123" }, query: {}, get: (name) => name === "x-google-ads-action-key" ? header : "" });

test("pause campaign requires action key and exact campaign confirmation", async () => {
  const controller = createGoogleAdsController({ googleAdsService: service, env });
  const denied = responseRecorder();
  await controller.pauseCampaign(req({ confirm: "PAUSE 123" }, "wrong"), denied);
  assert.equal(denied.statusCode, 403);
  const unconfirmed = responseRecorder();
  await controller.pauseCampaign(req({ confirm: "pause 123" }), unconfirmed);
  assert.equal(unconfirmed.statusCode, 400);
  const accepted = responseRecorder();
  await controller.pauseCampaign(req({ confirm: "PAUSE 123" }), accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.payload.data.status, "PAUSED");
});

test("IP exclusion and training sync require explicit confirmation", async () => {
  const controller = createGoogleAdsController({ googleAdsService: service, env });
  const denied = responseRecorder();
  await controller.excludeIps(req({ ips: ["192.0.2.1"], confirm: "no" }), denied);
  assert.equal(denied.statusCode, 400);
  const accepted = responseRecorder();
  await controller.excludeIps(req({ ips: ["192.0.2.1"], confirm: "EXCLUDE 123" }), accepted);
  assert.equal(accepted.statusCode, 200);
  const sync = responseRecorder();
  await controller.syncTrainingData(req({ confirm: "SYNC GOOGLE ADS DATA" }), sync);
  assert.equal(sync.statusCode, 201);
});

test("mutations stay disabled unless explicitly enabled", async () => {
  const controller = createGoogleAdsController({ googleAdsService: service, env: { GOOGLE_ADS_ACTION_KEY: "test-secret", GOOGLE_ADS_MUTATIONS_ENABLED: "false" } });
  const response = responseRecorder();
  await controller.pauseCampaign(req({ confirm: "PAUSE 123" }), response);
  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.error.code, "GOOGLE_ADS_MUTATIONS_DISABLED");
});


test("pembacaan akun, kampanye, daftar IP, dan status training dilindungi kunci admin", async () => {
  const controller = createGoogleAdsController({ googleAdsService: service, env });
  const customersDenied = responseRecorder();
  await controller.listCustomers(req({}, "wrong"), customersDenied);
  assert.equal(customersDenied.statusCode, 403);

  const customersAccepted = responseRecorder();
  await controller.listCustomers(req(), customersAccepted);
  assert.equal(customersAccepted.statusCode, 200);

  const campaignsDenied = responseRecorder();
  await controller.listCampaigns(req({}, "wrong"), campaignsDenied);
  assert.equal(campaignsDenied.statusCode, 403);

  const campaignsAccepted = responseRecorder();
  await controller.listCampaigns(req(), campaignsAccepted);
  assert.equal(campaignsAccepted.statusCode, 200);

  const trainingStatus = responseRecorder();
  await controller.getTrainingStatus(req(), trainingStatus);
  assert.equal(trainingStatus.statusCode, 200);
  assert.equal(trainingStatus.payload.data.status, "not_trained");
});
