"use strict";

require("dotenv").config();

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const {
  eventService,
  blockedIPService,
  modelRunService,
  monitoringService,
} = require("../src/services");

function makeTestEvent({ clickId, ipAddress, timestamp }) {
  return {
    click_id: clickId,
    timestamp,
    user_id: `activity8-test-${clickId}`,
    ip_address: ipAddress,
    device_type: "Desktop",
    browser: "Chrome",
    operating_system: "Windows",
    referrer_url: "https://example.com/referrer",
    page_url: "https://example.com/ads/test",
    click_duration: 1.5,
    scroll_depth: 50,
    mouse_movement: 3,
    keystrokes_detected: 1,
    ad_position: "Top",
    click_frequency: 1,
    time_since_last_click: 1,
    device_ip_reputation: "Suspicious",
    VPN_usage: 0,
    proxy_usage: 0,
    bot_likelihood_score: 0.9,
    is_fraudulent: 1,
  };
}

function formatHourUTC(date) {
  return `${date.toISOString().slice(0, 13)}:00:00.000Z`;
}

async function chooseUnusedTestIP() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    // TEST-NET-2 range is reserved for documentation, not a real client address.
    const candidate = `198.51.100.${1 + Math.floor(Math.random() * 254)}`;
    if (!(await blockedIPService.isIPBlocked(candidate))) return candidate;
  }
  throw new Error("Tidak dapat menemukan IP uji yang belum ada di blocked_ips.");
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI belum tersedia. Salin .env.example menjadi .env lalu isi koneksi MongoDB sebelum menjalankan pengujian."
    );
  }

  const token = randomUUID();
  const clickId = `activity8_test_${token}`;
  const modelType = `activity8-integration-test-${token}`;

  let timestamp = null;
  let startDate = null;
  let endDate = null;
  let ipAddress = null;
  let connected = false;
  let eventCreated = false;
  let blockedIPAdded = false;
  let modelRunId = null;

  try {
    await connectDatabase();
    connected = true;
    ipAddress = await chooseUnusedTestIP();
    timestamp = new Date();
    startDate = new Date(timestamp.getTime() - 2000);
    endDate = new Date(timestamp.getTime() + 2000);

    console.log("\n[Aktivitas 8] Mulai pengujian service database...");

    const before = await monitoringService.getOverview({ startDate, endDate });
    const createdEvent = await eventService.createEvent(
      makeTestEvent({ clickId, ipAddress, timestamp })
    );
    eventCreated = true;
    assert.equal(createdEvent.click_id, clickId);
    console.log("PASS 1/8 - Menyimpan event berhasil.");

    const foundEvent = await eventService.getEventByClickId(clickId);
    assert.ok(foundEvent);
    assert.equal(foundEvent.click_id, clickId);
    console.log("PASS 2/8 - Mengambil event berdasarkan click_id berhasil.");

    const listedEvents = await eventService.listEvents({
      click_id: clickId,
      page: 1,
      limit: 10,
    });
    assert.equal(listedEvents.total, 1);
    assert.equal(listedEvents.data.length, 1);
    console.log("PASS 3/8 - Daftar event dan pagination berhasil.");

    const after = await monitoringService.getOverview({ startDate, endDate });
    assert.equal(after.totalEvents, before.totalEvents + 1);
    assert.equal(after.fraudCount, before.fraudCount + 1);
    assert.equal(after.validCount, before.validCount);
    assert.ok(after.fraudRate >= 0 && after.fraudRate <= 100);

    const traffic = await monitoringService.getTrafficByTime({
      startDate,
      endDate,
      interval: "hour",
    });
    const currentHour = traffic.data.find((item) => item.period === formatHourUTC(timestamp));
    assert.ok(currentHour, "Bucket traffic untuk jam event uji harus tersedia.");
    assert.ok(currentHour.totalEvents >= 1);
    assert.ok(currentHour.fraudCount >= 1);
    console.log("PASS 4/8 - Monitoring total/fraud/valid/fraud rate dan traffic berhasil.");

    const addedIP = await blockedIPService.addBlockedIP(ipAddress);
    blockedIPAdded = true;
    assert.equal(addedIP.ip_address, ipAddress);
    assert.equal(await blockedIPService.isIPBlocked(ipAddress), true);
    const foundBlockedIP = await blockedIPService.getBlockedIP(ipAddress);
    assert.equal(foundBlockedIP.ip_address, ipAddress);
    const blockedList = await blockedIPService.listBlockedIPs({ page: 1, limit: 100 });
    assert.ok(Array.isArray(blockedList.data));
    assert.ok(blockedList.total >= 1);
    const removedIP = await blockedIPService.removeBlockedIP(ipAddress);
    assert.equal(removedIP.deleted, true);
    blockedIPAdded = false;
    assert.equal(await blockedIPService.isIPBlocked(ipAddress), false);
    console.log("PASS 5/8 - Tambah, periksa, ambil, dan hapus blocked IP berhasil.");

    const createdModelRun = await modelRunService.createModelRun({
      model_type: modelType,
      accuracy: 0.96,
      precision: 0.94,
      recall: 0.92,
      f1_score: 0.93,
      roc_auc: 0.97,
    });
    modelRunId = String(createdModelRun._id);
    const foundModelRun = await modelRunService.getModelRunById(modelRunId);
    assert.ok(foundModelRun);
    assert.equal(foundModelRun.model_type, modelType);
    const modelRunList = await modelRunService.listModelRuns({ page: 1, limit: 100 });
    assert.ok(modelRunList.data.some((item) => String(item._id) === modelRunId));
    console.log("PASS 6/8 - Menyimpan dan mengambil model run berhasil.");

    const modelStatus = await modelRunService.getModelStatus();
    assert.equal(modelStatus.status, "RESULT_RECORDED");
    assert.equal(modelStatus.hasRecordedRun, true);
    console.log("PASS 7/8 - Status penyimpanan hasil model run berhasil.");

    const snapshot = await monitoringService.getMonitoringSnapshot({
      startDate,
      endDate,
      interval: "hour",
      blockedIPLimit: 100,
    });
    assert.equal(snapshot.overview.totalEvents, after.totalEvents);
    assert.ok(Array.isArray(snapshot.blockedIPs.data));
    assert.equal(snapshot.modelStatus.status, "RESULT_RECORDED");
    console.log("PASS 8/8 - Ringkasan monitoring gabungan berhasil.");
  } finally {
    // Remove only this run's uniquely named test documents; keep existing project data intact.
    const cleanupErrors = [];
    if (connected) {
      try {
        if (eventCreated) await mongoose.model("Event").deleteOne({ click_id: clickId }).exec();
      } catch (error) {
        cleanupErrors.push(`event: ${error.message}`);
      }
      try {
        if (blockedIPAdded) await blockedIPService.removeBlockedIP(ipAddress);
      } catch (error) {
        cleanupErrors.push(`blocked IP: ${error.message}`);
      }
      try {
        if (modelRunId) await mongoose.model("ModelRun").deleteOne({ _id: modelRunId }).exec();
      } catch (error) {
        cleanupErrors.push(`model run: ${error.message}`);
      }
      await mongoose.connection.close();
    }
    if (cleanupErrors.length) {
      throw new Error(`Pengujian selesai tetapi pembersihan data uji gagal: ${cleanupErrors.join("; ")}`);
    }
    if (connected) console.log("Data uji sementara dibersihkan; data proyek lainnya tidak dihapus.");
  }
  console.log("\nSEMUA PENGUJIAN SERVICE AKTIVITAS 8 LULUS (8/8).");
}

main().catch((error) => {
  console.error("PENGUJIAN SERVICE AKTIVITAS 8 GAGAL:");
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
