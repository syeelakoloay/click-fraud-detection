"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateBurstRisk,
  isPredictionReadyEvent,
  isRoutablePublicIPv4,
  isActiveBlockRecord,
  validateRealtimeEvent,
} = require("../src/services/realtimeDetectionRules");

function event(overrides = {}) {
  return {
    click_id: "click-current",
    ip_address: "8.8.8.8",
    timestamp: "2026-11-23T10:00:05.000Z",
    user_id: "user-1",
    user_agent: "ExampleBrowser/1.0",
    click_duration: 1,
    scroll_depth: 50,
    mouse_movement: 10,
    keystrokes_detected: 1,
    click_frequency: 1,
    time_since_last_click: 1,
    VPN_usage: 0,
    proxy_usage: 0,
    device_type: "Desktop",
    browser: "Chrome",
    operating_system: "Windows",
    ad_position: "Top",
    device_ip_reputation: "Good",
    ...overrides,
  };
}

test("event yang memiliki semua fitur model memenuhi kontrak realtime", () => {
  assert.equal(isPredictionReadyEvent(event()), true);
  assert.equal(isPredictionReadyEvent({ ...event(), browser: undefined }), false);
});

test("burst teridentifikasi membutuhkan 10 klik dari user dan User-Agent sama dalam 5 detik", () => {
  const current = event();
  const history = Array.from({ length: 9 }, (_, index) => ({
    ...current,
    click_id: `previous-${index}`,
    timestamp: new Date(Date.parse(current.timestamp) - (9 - index) * 400).toISOString(),
  }));
  const result = evaluateBurstRisk(current, history, {});
  assert.equal(result.triggered, true);
  assert.equal(result.clickCount, 10);
  assert.equal(result.reason, "identified_user_same_user_agent_click_burst");
});

test("burst teridentifikasi tidak diblokir jika User-Agent berbeda", () => {
  const current = event();
  const history = Array.from({ length: 9 }, (_, index) => ({
    ...current,
    click_id: `previous-${index}`,
    user_agent: `OtherBrowser/${index}`,
    timestamp: new Date(Date.parse(current.timestamp) - (9 - index) * 400).toISOString(),
  }));
  assert.equal(evaluateBurstRisk(current, history, {}).triggered, false);
});

test("burst anonim memerlukan 20 klik dan indikator jaringan berisiko", () => {
  const current = event({ user_id: "anonymous", VPN_usage: 1 });
  const history = Array.from({ length: 19 }, (_, index) => ({
    ...current,
    click_id: `previous-${index}`,
    timestamp: new Date(Date.parse(current.timestamp) - (19 - index) * 200).toISOString(),
  }));
  const result = evaluateBurstRisk(current, history, {});
  assert.equal(result.triggered, true);
  assert.equal(result.clickCount, 20);
});


test("burst memakai waktu penerimaan server, bukan timestamp yang dikirim client", () => {
  const received = Date.parse("2026-11-23T10:00:05.000Z");
  const current = event({
    timestamp: "2020-01-01T00:00:00.000Z",
    received_at: new Date(received).toISOString(),
  });
  const history = Array.from({ length: 9 }, (_, index) => ({
    ...current,
    click_id: `received-${index}`,
    timestamp: "2035-01-01T00:00:00.000Z",
    received_at: new Date(received - (9 - index) * 400).toISOString(),
  }));
  const result = evaluateBurstRisk(current, history, {});
  assert.equal(result.triggered, true);
  assert.equal(result.clickCount, 10);
});

test("label fraud historis bukan block aktif; block manual dan rule tetap aktif", () => {
  assert.equal(isActiveBlockRecord(null), false);
  assert.equal(isActiveBlockRecord({ source: "historical_dataset_label" }), false);
  assert.equal(isActiveBlockRecord({ source: "behavioral_rule" }), true);
  assert.equal(isActiveBlockRecord({ source: "manual" }), true);
});

test("IP private/reserved tidak dianggap alamat publik untuk Google Ads exclusion", () => {
  assert.equal(isRoutablePublicIPv4("8.8.8.8"), true);
  assert.equal(isRoutablePublicIPv4("192.168.1.1"), false);
  assert.equal(isRoutablePublicIPv4("127.0.0.1"), false);
  assert.equal(isRoutablePublicIPv4("2001:db8::1"), false);
});


test("validasi event realtime menerima payload lengkap dan menolak IP/timestamp invalid", () => {
  const event = {
    click_id: "test-1", ip_address: "8.8.8.8", timestamp: "2026-11-23T00:00:00.000Z",
    click_duration: 1, scroll_depth: 20, mouse_movement: 5, keystrokes_detected: 0,
    click_frequency: 1, time_since_last_click: 10, VPN_usage: 0, proxy_usage: 0,
    device_type: "Desktop", browser: "Chrome", operating_system: "Windows",
    ad_position: "Top", device_ip_reputation: "Good", user_agent: "Mozilla/5.0",
    campaign_id: "3426120099",
  };
  assert.equal(validateRealtimeEvent(event), true);
  assert.throws(() => validateRealtimeEvent({ ...event, ip_address: "999.1.1.1" }), /alamat IP yang valid/);
  assert.throws(() => validateRealtimeEvent({ ...event, timestamp: "not-a-date" }), /tanggal yang valid/);
  assert.throws(() => validateRealtimeEvent({ ...event, campaign_id: "advertising" }), /campaign_id harus berupa angka/);
});
