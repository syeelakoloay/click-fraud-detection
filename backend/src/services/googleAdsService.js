"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");

const DEFAULT_API_VERSION = "v26";
const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const TRAINING_DATASET_PATH = path.resolve(__dirname, "../../ml/datasets/google_ads_campaign_daily.csv");

function normalizeCustomerId(value) {
  const normalized = String(value || "").replace(/-/g, "").trim();
  if (!/^\d{10}$/.test(normalized)) {
    throw new TypeError("customerId harus berupa 10 digit Google Ads Customer ID (tanpa tanda hubung).");
  }
  return normalized;
}

function normalizeCampaignId(value) {
  const normalized = String(value || "").trim();
  if (!/^\d{1,20}$/.test(normalized)) {
    throw new TypeError("campaignId harus berupa angka.");
  }
  return normalized;
}

function validateDateRange(startDate, endDate) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(String(startDate || "")) || !datePattern.test(String(endDate || ""))) {
    throw new TypeError("startDate dan endDate harus memakai format YYYY-MM-DD.");
  }
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.toISOString().slice(0, 10) !== startDate || end.toISOString().slice(0, 10) !== endDate) {
    throw new TypeError("Rentang tanggal tidak valid.");
  }
  if (start > end) throw new RangeError("startDate tidak boleh lebih besar daripada endDate.");
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days > 365) throw new RangeError("Sinkronisasi dibatasi maksimal 365 hari per permintaan.");
  return { startDate, endDate, days };
}

function normalizeIpOrCidr(value) {
  const input = String(value || "").trim();
  const parts = input.split("/");
  if (parts.length > 2) throw new TypeError(`IP/CIDR tidak valid: ${input}`);
  const addressType = net.isIP(parts[0]);
  if (!addressType) throw new TypeError(`Alamat IP tidak valid: ${input}`);
  if (parts.length === 2) {
    if (!/^\d+$/.test(parts[1])) throw new TypeError(`Prefix CIDR tidak valid: ${input}`);
    const prefix = Number(parts[1]);
    const max = addressType === 4 ? 32 : 128;
    if (prefix < 0 || prefix > max) throw new TypeError(`Prefix CIDR harus berada pada rentang 0-${max}: ${input}`);
  }
  return input;
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value); value = "";
    } else value += char;
  }
  values.push(value);
  return values;
}

function createGoogleAdsService(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const datasetPath = options.datasetPath || TRAINING_DATASET_PATH;
  const trainingStatusPath = options.trainingStatusPath || path.resolve(__dirname, "../../ml/results/google_ads_campaign_training_status.json");
  let cachedAccessToken = null;
  let accessTokenExpiresAt = 0;

  function config() {
    return {
      clientId: String(env.GOOGLE_ADS_CLIENT_ID || "").trim(),
      clientSecret: String(env.GOOGLE_ADS_CLIENT_SECRET || "").trim(),
      refreshToken: String(env.GOOGLE_ADS_REFRESH_TOKEN || "").trim(),
      defaultCustomerId: String(env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "").trim(),
      loginCustomerId: String(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/-/g, "").trim(),
      apiVersion: String(env.GOOGLE_ADS_API_VERSION || DEFAULT_API_VERSION).trim(),
      mutationsEnabled: String(env.GOOGLE_ADS_MUTATIONS_ENABLED || "false").toLowerCase() === "true",
      actionKeyConfigured: Boolean(String(env.GOOGLE_ADS_ACTION_KEY || "").trim()),
    };
  }

  function isConfigured() {
    const settings = config();
    return Boolean(settings.clientId && settings.clientSecret && settings.refreshToken);
  }

  function getStatus() {
    const settings = config();
    return {
      configured: isConfigured(),
      mutationsEnabled: settings.mutationsEnabled,
      actionKeyConfigured: settings.actionKeyConfigured,
      apiVersion: settings.apiVersion,
      defaultCustomerId: /^\d{10}$/.test(settings.defaultCustomerId) ? settings.defaultCustomerId : null,
      scope: GOOGLE_ADS_SCOPE,
      labelSource: "Google Ads metrics.invalid_clicks (agregat kampanye-hari)",
      datasetPath: "ml/datasets/google_ads_campaign_daily.csv",
      message: isConfigured()
        ? "OAuth tersedia. Akses API dan izin akun tetap harus divalidasi saat permintaan pertama."
        : "OAuth belum dikonfigurasi. Isi GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, dan GOOGLE_ADS_REFRESH_TOKEN di backend/.env.",
    };
  }

  async function getAccessToken() {
    if (!isConfigured()) {
      const error = new Error("Google Ads OAuth belum dikonfigurasi pada backend/.env.");
      error.status = 503;
      error.code = "GOOGLE_ADS_NOT_CONFIGURED";
      throw error;
    }
    if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 60000) return cachedAccessToken;
    if (typeof fetchImpl !== "function") throw new Error("Fetch API tidak tersedia pada Node.js.");

    const settings = config();
    const body = new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      refresh_token: settings.refreshToken,
      grant_type: "refresh_token",
    });
    const response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      const error = new Error(payload.error_description || payload.error || `OAuth token endpoint HTTP ${response.status}`);
      error.status = response.status === 400 || response.status === 401 ? 401 : 502;
      error.code = "GOOGLE_ADS_OAUTH_FAILED";
      throw error;
    }
    cachedAccessToken = payload.access_token;
    accessTokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
    return cachedAccessToken;
  }

  async function apiRequest(resourcePath, options = {}) {
    const settings = config();
    const token = await getAccessToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    };
    if (settings.loginCustomerId) headers["login-customer-id"] = normalizeCustomerId(settings.loginCustomerId);
    const response = await fetchImpl(`https://googleads.googleapis.com/${settings.apiVersion}/${resourcePath}`, {
      method: options.method || "GET",
      headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = payload?.error?.message || payload?.error?.status || `Google Ads API HTTP ${response.status}`;
      const error = new Error(details);
      error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
      error.code = "GOOGLE_ADS_API_ERROR";
      error.googleStatus = payload?.error?.status || null;
      throw error;
    }
    return payload;
  }

  async function search(customerId, query) {
    const id = normalizeCustomerId(customerId);
    const allRows = [];
    let pageToken;
    do {
      const payload = await apiRequest(`customers/${id}/googleAds:search`, {
        method: "POST",
        body: { query, ...(pageToken ? { pageToken } : {}) },
      });
      allRows.push(...(Array.isArray(payload.results) ? payload.results : []));
      pageToken = payload.nextPageToken || null;
      if (allRows.length > 100000) throw new RangeError("Hasil Google Ads melebihi batas aman 100.000 baris.");
    } while (pageToken);
    return allRows;
  }

  async function listAccessibleCustomers() {
    const payload = await apiRequest("customers:listAccessibleCustomers");
    const customers = new Map((payload.resourceNames || []).map((resourceName) => {
      const customerId = resourceName.split("/").pop();
      return [customerId, { customerId, resourceName, name: customerId, source: "direct_access" }];
    }));

    // When a Manager Account is configured, expose enabled non-manager child accounts too.
    const managerId = config().loginCustomerId;
    if (managerId) {
      const children = await search(managerId, `
        SELECT customer_client.id, customer_client.descriptive_name,
          customer_client.manager, customer_client.status, customer_client.level
        FROM customer_client
        WHERE customer_client.status = 'ENABLED'
          AND customer_client.level <= 1
      `);
      children.forEach((row) => {
        const client = row.customerClient || {};
        const customerId = String(client.id || "");
        if (customerId && !client.manager) {
          customers.set(customerId, {
            customerId,
            resourceName: `customers/${customerId}`,
            name: client.descriptiveName || customerId,
            source: "manager_child",
          });
        }
      });
    }
    return [...customers.values()].sort((a, b) => a.customerId.localeCompare(b.customerId));
  }

  async function listCampaigns(customerId) {
    const id = normalizeCustomerId(customerId || config().defaultCustomerId);
    const rows = await search(id, `
      SELECT customer.currency_code, campaign.id, campaign.name, campaign.status,
        campaign.advertising_channel_type, metrics.impressions,
        metrics.clicks, metrics.invalid_clicks, metrics.invalid_click_rate,
        metrics.cost_micros
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
        AND campaign.status != 'REMOVED'
      ORDER BY campaign.id
    `);
    return rows.map((row) => ({
      id: String(row.campaign?.id || ""),
      name: row.campaign?.name || "(tanpa nama)",
      status: row.campaign?.status || "UNKNOWN",
      channelType: row.campaign?.advertisingChannelType || "UNKNOWN",
      currencyCode: row.customer?.currencyCode || "IDR",
      impressions: Number(row.metrics?.impressions || 0),
      clicks: Number(row.metrics?.clicks || 0),
      invalidClicks: Number(row.metrics?.invalidClicks || 0),
      invalidClickRate: Number(row.metrics?.invalidClickRate || 0),
      costMicros: Number(row.metrics?.costMicros || 0),
    }));
  }

  async function getCampaign(customerId, campaignId) {
    const id = normalizeCustomerId(customerId || config().defaultCustomerId);
    const campaign = normalizeCampaignId(campaignId);
    const rows = await search(id, `
      SELECT campaign.id, campaign.name, campaign.status,
        campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.id = ${campaign}
        AND campaign.status != 'REMOVED'
    `);
    if (!rows.length) {
      const error = new Error("Campaign tidak ditemukan atau sudah dihapus pada Customer ID tersebut.");
      error.status = 404;
      error.code = "GOOGLE_ADS_CAMPAIGN_NOT_FOUND";
      throw error;
    }
    return rows[0];
  }

  async function pauseCampaign(customerId, campaignId) {
    const id = normalizeCustomerId(customerId || config().defaultCustomerId);
    const campaign = normalizeCampaignId(campaignId);
    const found = await getCampaign(id, campaign);
    if (found.campaign.status === "PAUSED") return { campaignId: campaign, status: "PAUSED", alreadyPaused: true };
    const resourceName = `customers/${id}/campaigns/${campaign}`;
    const result = await apiRequest(`customers/${id}/campaigns:mutate`, {
      method: "POST",
      body: {
        operations: [{ updateMask: "status", update: { resourceName, status: "PAUSED" } }],
        partialFailure: false,
        validateOnly: false,
      },
    });
    return { campaignId: campaign, status: "PAUSED", result };
  }

  async function listCampaignIpBlocks(customerId, campaignId) {
    const id = normalizeCustomerId(customerId || config().defaultCustomerId);
    const campaign = normalizeCampaignId(campaignId);
    const rows = await search(id, `
      SELECT campaign_criterion.resource_name,
        campaign_criterion.criterion_id,
        campaign_criterion.ip_block.ip_address,
        campaign_criterion.status
      FROM campaign_criterion
      WHERE campaign.id = ${campaign}
        AND campaign_criterion.type = 'IP_BLOCK'
        AND campaign_criterion.status != 'REMOVED'
    `);
    return rows.map((row) => ({
      resourceName: row.campaignCriterion?.resourceName,
      ipAddress: row.campaignCriterion?.ipBlock?.ipAddress,
      status: row.campaignCriterion?.status,
    })).filter((row) => row.ipAddress);
  }

  async function excludeCampaignIps(customerId, campaignId, ips) {
    const id = normalizeCustomerId(customerId || config().defaultCustomerId);
    const campaign = normalizeCampaignId(campaignId);
    if (!Array.isArray(ips) || ips.length === 0 || ips.length > 500) {
      throw new TypeError("ips harus berupa array berisi 1 sampai 500 alamat IP atau CIDR.");
    }
    const normalizedIps = [...new Set(ips.map(normalizeIpOrCidr))];
    const existing = await listCampaignIpBlocks(id, campaign);
    const existingSet = new Set(existing.map((item) => item.ipAddress));
    const newIps = normalizedIps.filter((ip) => !existingSet.has(ip));
    if (existing.length + newIps.length > 500) {
      const error = new Error(`Batas Google Ads adalah 500 IP/CIDR per campaign. Saat ini ${existing.length} sudah terpasang.`);
      error.status = 409;
      error.code = "GOOGLE_ADS_IP_BLOCK_LIMIT";
      throw error;
    }
    if (!newIps.length) return { campaignId: campaign, added: 0, skippedExisting: normalizedIps.length, total: existing.length };
    const result = await apiRequest(`customers/${id}/campaignCriteria:mutate`, {
      method: "POST",
      body: {
        operations: newIps.map((ip) => ({
          create: {
            campaign: `customers/${id}/campaigns/${campaign}`,
            negative: true,
            ipBlock: { ipAddress: ip },
          },
        })),
        partialFailure: false,
        validateOnly: false,
      },
    });
    return { campaignId: campaign, added: newIps.length, skippedExisting: normalizedIps.length - newIps.length, total: existing.length + newIps.length, result };
  }

  async function getCampaignModelTrainingStatus() {
    try {
      const raw = await fs.readFile(trainingStatusPath, "utf8");
      const status = JSON.parse(raw);
      return status && typeof status === "object"
        ? status
        : { status: "invalid_status", reason: "File status model tidak berisi object JSON." };
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          status: "not_trained",
          reason: "Belum ada status pelatihan. Sinkronkan data Google Ads, lalu jalankan python ml/train_google_ads_campaign_model.py.",
        };
      }
      throw error;
    }
  }

  async function syncCampaignDailyTrainingData(customerId, startDate, endDate) {
    const id = normalizeCustomerId(customerId || config().defaultCustomerId);
    const range = validateDateRange(startDate, endDate);
    const rows = await search(id, `
      SELECT segments.date, campaign.id, campaign.name,
        campaign.advertising_channel_type, metrics.impressions,
        metrics.clicks, metrics.invalid_clicks,
        metrics.invalid_click_rate, metrics.cost_micros
      FROM campaign
      WHERE segments.date BETWEEN '${range.startDate}' AND '${range.endDate}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date, campaign.id
    `);

    const header = ["date", "campaign_id", "campaign_name", "campaign_channel_type", "impressions", "clicks", "cost_micros", "invalid_clicks", "invalid_click_rate", "has_invalid_clicks"];
    const dataRows = rows.map((row) => {
      const invalidClicks = Number(row.metrics?.invalidClicks || 0);
      return [
        row.segments?.date || "",
        String(row.campaign?.id || ""),
        row.campaign?.name || "",
        row.campaign?.advertisingChannelType || "UNKNOWN",
        Number(row.metrics?.impressions || 0),
        Number(row.metrics?.clicks || 0),
        Number(row.metrics?.costMicros || 0),
        invalidClicks,
        Number(row.metrics?.invalidClickRate || 0),
        invalidClicks > 0 ? 1 : 0,
      ];
    });
    await fs.mkdir(path.dirname(datasetPath), { recursive: true });
    const combined = new Map();
    try {
      const existingText = await fs.readFile(datasetPath, "utf8");
      const existingLines = existingText.split(/\r?\n/).filter(Boolean);
      if (existingLines.length > 1) {
        const existingHeader = parseCsvLine(existingLines[0]);
        if (existingHeader.join("|") !== header.join("|")) {
          throw new Error("Skema file dataset Google Ads lama tidak cocok; cadangkan dan periksa file sebelum sinkronisasi.");
        }
        existingLines.slice(1).forEach((line) => {
          const values = parseCsvLine(line);
          if (values.length === header.length) combined.set(`${values[0]}|${values[1]}`, values);
        });
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    dataRows.forEach((row) => combined.set(`${row[0]}|${row[1]}`, row.map(String)));
    const mergedRows = [...combined.values()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    const csv = [header, ...mergedRows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
    await fs.writeFile(datasetPath, csv, "utf8");
    const uniqueDates = new Set(mergedRows.map((row) => row[0]).filter(Boolean));
    const uniqueCampaigns = new Set(mergedRows.map((row) => row[1]).filter(Boolean));
    const positiveRows = mergedRows.filter((row) => Number(row[9]) === 1).length;
    return {
      rows: mergedRows.length,
      fetchedRows: dataRows.length,
      campaigns: uniqueCampaigns.size,
      dates: uniqueDates.size,
      positiveCampaignDays: positiveRows,
      negativeCampaignDays: mergedRows.length - positiveRows,
      startDate: range.startDate,
      endDate: range.endDate,
      dataLevel: "campaign-day",
      labelSource: "Google Ads metrics.invalid_clicks > 0",
      output: "ml/datasets/google_ads_campaign_daily.csv",
    };
  }

  return {
    getStatus,
    listAccessibleCustomers,
    listCampaigns,
    pauseCampaign,
    listCampaignIpBlocks,
    excludeCampaignIps,
    syncCampaignDailyTrainingData,
    getCampaignModelTrainingStatus,
    normalizeCustomerId,
    validateDateRange,
    normalizeIpOrCidr,
    getAccessToken,
  };
}

const defaultService = createGoogleAdsService();
module.exports = {
  ...defaultService,
  createGoogleAdsService,
  normalizeCustomerId,
  normalizeCampaignId,
  validateDateRange,
  normalizeIpOrCidr,
  GOOGLE_ADS_SCOPE,
  DEFAULT_API_VERSION,
};
