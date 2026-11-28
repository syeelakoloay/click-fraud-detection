#!/usr/bin/env node
/**
 * One-time, explicit import of the existing 350-row ClickGuard demo CSV into MongoDB
 * through the Express API. It never connects directly to MongoDB and never deletes data.
 * Run from the frontend project root: node scripts/importDemoEventsToApi.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'public', 'data', 'clickguard-demo-350.csv');
const BASE = (process.env.API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const API = BASE.endsWith('/api') ? BASE : `${BASE}/api`;
const ALLOWED_FIELDS = [
  'click_id', 'timestamp', 'user_id', 'ip_address', 'device_type', 'browser',
  'operating_system', 'referrer_url', 'page_url', 'click_duration', 'scroll_depth',
  'mouse_movement', 'keystrokes_detected', 'ad_position', 'click_frequency',
  'time_since_last_click', 'device_ip_reputation', 'VPN_usage', 'proxy_usage',
  'bot_likelihood_score', 'is_fraudulent'
];
const NUMERIC_FIELDS = new Set([
  'click_duration', 'scroll_depth', 'mouse_movement', 'keystrokes_detected',
  'click_frequency', 'time_since_last_click', 'VPN_usage', 'proxy_usage',
  'bot_likelihood_score', 'is_fraudulent'
]);
const REQUIRED_FIELDS = ['click_id', 'timestamp', 'user_id', 'ip_address', 'device_type', 'is_fraudulent'];

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(v => String(v).trim() !== ''));
  if (nonEmpty.length < 2) throw new Error('CSV kosong atau hanya berisi header.');
  const headers = nonEmpty[0].map(h => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  return nonEmpty.slice(1).map((values, idx) => {
    const item = {};
    headers.forEach((h, i) => { item[h] = (values[i] ?? '').trim(); });
    item.__row = idx + 2;
    return item;
  });
}

function findValue(row, field) {
  const aliases = {
    device_type: ['device_type', 'device', 'devicetype'],
    operating_system: ['operating_system', 'os', 'operatingsystem'],
    ip_address: ['ip_address', 'ip', 'ipaddress'],
    timestamp: ['timestamp', 'datetime', 'event_timestamp', 'click_time'],
    click_id: ['click_id', 'clickid'],
    user_id: ['user_id', 'userid'],
    VPN_usage: ['vpn_usage', 'vpnusage'],
    proxy_usage: ['proxy_usage', 'proxyusage'],
    is_fraudulent: ['is_fraudulent', 'isfraudulent', 'fraud']
  }[field] || [field];
  for (const key of aliases) if (row[key] !== undefined && row[key] !== '') return row[key];
  return undefined;
}

function makeEvent(row, index) {
  const event = {};
  for (const field of ALLOWED_FIELDS) {
    let value = findValue(row, field);
    if (value === undefined || value === null || value === '') continue;
    if (field === 'timestamp') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new Error(`Baris ${row.__row}: timestamp tidak valid: ${value}`);
      value = date.toISOString();
    } else if (NUMERIC_FIELDS.has(field)) {
      value = Number(value);
      if (!Number.isFinite(value)) throw new Error(`Baris ${row.__row}: ${field} bukan angka valid.`);
      if (field === 'is_fraudulent' || field === 'VPN_usage' || field === 'proxy_usage') value = value ? 1 : 0;
    }
    event[field] = value;
  }
  if (!event.click_id) event.click_id = `CG-IMPORT-${String(index + 1).padStart(4, '0')}`;
  const missing = REQUIRED_FIELDS.filter(field => event[field] === undefined || event[field] === '');
  if (missing.length) throw new Error(`Baris ${row.__row}: field wajib tidak ditemukan: ${missing.join(', ')}. Tidak ada data yang dikirim.`);
  return event;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} -> HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function totalFrom(payload) {
  const n = Number(payload?.total ?? payload?.data?.total);
  if (Number.isFinite(n)) return n;
  if (Array.isArray(payload?.data)) return payload.data.length;
  if (Array.isArray(payload)) return payload.length;
  return 0;
}

async function main() {
  await requestJson(`${BASE}/health`);
  const existing = await requestJson(`${API}/events?page=1&limit=1`);
  const existingTotal = totalFrom(existing);
  if (existingTotal > 0) {
    throw new Error(`Database sudah memiliki ${existingTotal} event. Import dibatalkan untuk menghindari duplikasi. Tidak ada data yang dihapus.`);
  }

  const csv = await fs.readFile(CSV_PATH, 'utf8');
  const sourceRows = parseCsv(csv);
  const events = sourceRows.map(makeEvent);
  console.log(`Sumber: ${path.relative(ROOT, CSV_PATH)}`);
  console.log(`Event valid yang akan dikirim: ${events.length}`);
  console.log(`API target: ${API}/events/ingest`);
  console.log('Mengirim dataset preview ke backend. Data yang masuk akan menjadi data demo di MongoDB.');

  const result = await requestJson(`${API}/events/ingest`, {
    method: 'POST',
    body: JSON.stringify(events)
  });
  console.log('\nRespons ingestion:');
  console.log(JSON.stringify(result, null, 2));
  const success = Number(result?.successCount ?? result?.data?.successCount ?? result?.insertedCount ?? result?.data?.insertedCount);
  const failure = Number(result?.failureCount ?? result?.data?.failureCount ?? 0);
  if (Number.isFinite(success) && success === 0 && events.length > 0) {
    throw new Error('API tidak melaporkan event yang berhasil dimasukkan. Periksa detail respons di atas.');
  }
  if (Number.isFinite(failure) && failure > 0) {
    console.warn(`PERINGATAN: ${failure} event gagal. Baca detail respons di atas sebelum mengulang import.`);
  }

  const verify = await requestJson(`${API}/events?page=1&limit=500`);
  console.log(`\nVerifikasi GET /api/events: total=${totalFrom(verify)}`);
  console.log('Refresh dashboard dengan Ctrl+F5. Jika total tetap 0, kirim respons ingestion di atas; jangan ulangi import dulu.');
}

main().catch(error => {
  console.error(`\nIMPORT GAGAL: ${error.message}`);
  process.exitCode = 1;
});
