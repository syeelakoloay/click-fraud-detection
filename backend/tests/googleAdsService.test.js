"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  createGoogleAdsService,
  normalizeCustomerId,
  validateDateRange,
  normalizeIpOrCidr,
} = require("../src/services/googleAdsService");

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

const env = {
  GOOGLE_ADS_CLIENT_ID: "client-id",
  GOOGLE_ADS_CLIENT_SECRET: "client-secret",
  GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
  GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
  GOOGLE_ADS_API_VERSION: "v26",
  GOOGLE_ADS_MUTATIONS_ENABLED: "false",
};

test("validasi Google Ads Customer ID, rentang tanggal, dan IP/CIDR", () => {
  assert.equal(normalizeCustomerId("123-456-7890"), "1234567890");
  assert.throws(() => normalizeCustomerId("1234"), /10 digit/);
  assert.equal(validateDateRange("2026-01-01", "2026-03-31").days, 90);
  assert.throws(() => validateDateRange("2026-04-01", "2026-03-31"), /lebih besar/);
  assert.equal(normalizeIpOrCidr("192.0.2.1/32"), "192.0.2.1/32");
  assert.equal(normalizeIpOrCidr("2001:db8::1"), "2001:db8::1");
  assert.throws(() => normalizeIpOrCidr("999.999.1.1"), /tidak valid/);
});

test("status tidak membocorkan rahasia OAuth", () => {
  const service = createGoogleAdsService({ env, fetchImpl: async () => jsonResponse({}) });
  const status = service.getStatus();
  assert.equal(status.configured, true);
  assert.equal(status.apiVersion, "v26");
  assert.equal(status.defaultCustomerId, "1234567890");
  assert.equal("refreshToken" in status, false);
  assert.equal(status.mutationsEnabled, false);
});

test("OAuth token, daftar kampanye, jeda, pengecualian IP, dan sinkronisasi label aggregate", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clickguard-google-ads-"));
  const datasetPath = path.join(tempDir, "google_ads_campaign_daily.csv");
  const calls = [];
  let campaignStatus = "ENABLED";
  let queryCount = 0;
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "access-token", expires_in: 3600 });
    if (String(url).includes("customers:listAccessibleCustomers")) return jsonResponse({ resourceNames: ["customers/1234567890"] });
    if (String(url).includes("googleAds:search")) {
      const query = JSON.parse(options.body).query;
      queryCount += 1;
      if (query.includes("campaign_criterion")) return jsonResponse({ results: [] });
      if (query.includes("segments.date BETWEEN")) return jsonResponse({ results: [
        { segments: { date: "2026-01-01" }, campaign: { id: "11", name: "Search A", advertisingChannelType: "SEARCH" }, metrics: { impressions: "1000", clicks: "40", costMicros: "2500000", invalidClicks: "2", invalidClickRate: 0.05 } },
        { segments: { date: "2026-01-01" }, campaign: { id: "12", name: "Display B", advertisingChannelType: "DISPLAY" }, metrics: { impressions: "500", clicks: "20", costMicros: "1000000", invalidClicks: "0", invalidClickRate: 0 } },
      ] });
      return jsonResponse({ results: [{ campaign: { id: "11", name: "Search A", status: campaignStatus, advertisingChannelType: "SEARCH" }, metrics: { impressions: "1000", clicks: "40", invalidClicks: "2", invalidClickRate: 0.05, costMicros: "2500000" } }] });
    }
    if (String(url).includes("campaigns:mutate")) { campaignStatus = "PAUSED"; return jsonResponse({ results: [{ resourceName: "customers/1234567890/campaigns/11" }] }); }
    if (String(url).includes("campaignCriteria:mutate")) return jsonResponse({ results: [{ resourceName: "customers/1234567890/campaignCriteria/11~3" }] });
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    const service = createGoogleAdsService({ env, fetchImpl: fakeFetch, datasetPath });
    const customers = await service.listAccessibleCustomers();
    assert.equal(customers[0].customerId, "1234567890");
    const campaigns = await service.listCampaigns();
    assert.equal(campaigns[0].invalidClicks, 2);
    const pause = await service.pauseCampaign("1234567890", "11");
    assert.equal(pause.status, "PAUSED");
    const excluded = await service.excludeCampaignIps("1234567890", "11", ["192.0.2.10", "2001:db8::1"]);
    assert.equal(excluded.added, 2);
    const synced = await service.syncCampaignDailyTrainingData("1234567890", "2026-01-01", "2026-01-01");
    assert.equal(synced.rows, 2);
    assert.equal(synced.positiveCampaignDays, 1);
    const csv = await fs.readFile(datasetPath, "utf8");
    assert.match(csv, /has_invalid_clicks/);
    assert.match(csv, /"1"/);
    assert.match(calls[0].url, /oauth2\.googleapis\.com/);
    assert.ok(queryCount >= 4);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("OAuth yang belum diatur tidak mengakses Google Ads", async () => {
  const service = createGoogleAdsService({ env: {}, fetchImpl: async () => { throw new Error("must not call"); } });
  assert.equal(service.getStatus().configured, false);
  await assert.rejects(service.listAccessibleCustomers(), /OAuth belum dikonfigurasi/);
});


test("Manager Account mencantumkan akun klien aktif yang bukan Manager", async () => {
  const calls = [];
  const managerEnv = { ...env, GOOGLE_ADS_LOGIN_CUSTOMER_ID: "999-999-9999" };
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "manager-token", expires_in: 3600 });
    if (String(url).includes("customers:listAccessibleCustomers")) return jsonResponse({ resourceNames: ["customers/9999999999"] });
    if (String(url).includes("googleAds:search")) return jsonResponse({ results: [
      { customerClient: { id: "1234567890", descriptiveName: "Client A", manager: false, status: "ENABLED", level: 1 } },
      { customerClient: { id: "1111111111", descriptiveName: "Nested Manager", manager: true, status: "ENABLED", level: 1 } },
    ] });
    throw new Error(`Unexpected URL ${url}`);
  };
  const service = createGoogleAdsService({ env: managerEnv, fetchImpl: fakeFetch });
  const accounts = await service.listAccessibleCustomers();
  assert.equal(accounts.length, 2);
  assert.equal(accounts.find((item) => item.customerId === "1234567890").name, "Client A");
  assert.equal(accounts.some((item) => item.customerId === "1111111111"), false);
  const searchCall = calls.find((call) => call.url.includes("googleAds:search"));
  assert.match(searchCall.url, /googleads\.googleapis\.com\/v26/);
  assert.equal(searchCall.options.headers["login-customer-id"], "9999999999");
});

test("status model campaign-day dapat dibaca tanpa membocorkan file/path absolut", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clickguard-training-status-"));
  const statusPath = path.join(tempDir, "status.json");
  try {
    await fs.writeFile(statusPath, JSON.stringify({ status: "trained", reason: "Smoke test", metrics: { accuracy: 0.5 } }));
    const service = createGoogleAdsService({ env, trainingStatusPath: statusPath });
    const status = await service.getCampaignModelTrainingStatus();
    assert.equal(status.status, "trained");
    assert.equal(status.metrics.accuracy, 0.5);
    assert.equal("path" in status, false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
