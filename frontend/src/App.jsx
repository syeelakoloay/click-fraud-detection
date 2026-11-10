import { useEffect, useMemo, useState } from 'react';
import { fetchAllBlockedIPs } from './api.js';
import {
  Activity, Bell, Check, ChevronDown, CircleHelp, Filter,
  LayoutDashboard, MousePointer2, Settings, ShieldAlert,
  ShieldCheck, X, Menu, CalendarDays, FileDown, Info,
  ChevronLeft, ChevronRight
} from 'lucide-react';

const PAGE_SIZE = 10;

// Tidak ada dataset demo lokal. Data event dan statistik hanya berasal dari Express API.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const navigation = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'events', label: 'Click events', Icon: MousePointer2 },
  { id: 'fraud', label: 'Fraud monitoring', Icon: ShieldAlert },
  { id: 'blocked', label: 'Blocked IPs', Icon: ShieldCheck }
];

const descriptions = {
  overview:
    'Overview menyajikan ringkasan aktivitas klik iklan dan indikator potensi fraud. Pengguna dapat melihat total event, traffic valid, event fraud, dan fraud rate. Grafik Traffic overview membantu memahami perubahan volume klik berdasarkan waktu. Halaman ini menjadi titik awal untuk menelusuri aktivitas yang perlu diperiksa.',
  events:
    'Click events menampilkan catatan aktivitas klik secara terperinci. Tabel memuat ID klik, alamat IP, perangkat, waktu, klasifikasi, dan risk score. Filter dan pagination membantu pengguna menelusuri seluruh event. Klik salah satu baris untuk melihat detail aktivitas dan indikator pendukung.',
  fraud:
    'Fraud monitoring memusatkan perhatian pada event yang diberi label fraud. Pengguna dapat meninjau IP, waktu aktivitas, perangkat, dan risk score. Detail event membantu memeriksa indikator seperti frekuensi klik, VPN, atau proxy. Klasifikasi perlu ditinjau sebelum dijadikan dasar tindakan.',
  blocked:
    'Blocked IPs menampilkan alamat IP yang benar-benar tersimpan pada collection blocked_ips melalui Express API. Bagian Risk signals ditampilkan terpisah untuk event dengan indikator VPN atau proxy. Event yang memiliki indikator tersebut tidak otomatis berarti alamat IP sudah diblokir.',
  settings:
    'Pengaturan menyediakan informasi konfigurasi dan integrasi ClickGuard. Pengguna dapat memeriksa status koneksi backend. Informasi ini membantu memahami sumber data dan kesiapan integrasi. Konfigurasi lanjutan dapat ditambahkan setelah backend tersedia.'
};

const numberFormat = value => new Intl.NumberFormat('id-ID').format(value);
const percent = value => `${value.toFixed(2).replace('.', ',')}%`;

// Leave VITE_API_URL empty during local development so requests stay same-origin
// and Vite proxies /api to Express. This avoids browser CORS failures on localhost.
function getApiBaseUrl() {
  return String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
}

function getApiEndpoint(path) {
  const base = getApiBaseUrl();
  const normalizedPath = String(path).replace(/^\/+/, '').replace(/^api\//, '');

  // Default development route: Vite proxy handles /api/* -> Express :5000.
  if (!base) return `/api/${normalizedPath}`;

  // Explicit production/deployment URL may be supplied as either host root or host/api.
  return base.endsWith('/api')
    ? `${base}/${normalizedPath}`
    : `${base}/api/${normalizedPath}`;
}

function getApiHealthEndpoint() {
  const base = getApiBaseUrl();
  if (!base) return '/health';
  return base.endsWith('/api')
    ? `${base.slice(0, -4)}/health`
    : `${base}/health`;
}

function explainApiError(error, endpointLabel) {
  const message = String(error?.message || error || 'Unknown error');
  if (/failed to fetch|networkerror|fetch failed|load failed/i.test(message)) {
    return `Tidak dapat menjangkau ${endpointLabel}. Mode development memakai proxy Vite /api ke backend. Pastikan Express aktif di http://localhost:5000, GET /health merespons, lalu restart npm run dev setelah mengubah vite.config.js. Detail browser: ${message}`;
  }
  if (/HTTP 502|HTTP 503|HTTP 504/i.test(message)) {
    return `${endpointLabel} tidak tersedia (${message}). Periksa terminal Vite dan pastikan backend Express hidup di http://localhost:5000.`;
  }
  return `${endpointLabel}: ${message}`;
}

function extractEventRows(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.data, payload?.data?.events, payload?.events,
    payload?.result?.data, payload?.result?.events, payload?.items,
    payload?.results
  ];
  const rows = candidates.find(Array.isArray);
  if (rows) return rows;

  // Backend may return { data: {}, total: 0, page, limit, totalPages: 0 }
  // when MongoDB has no event rows. This is a valid empty API result; do not
  // substitute demo records because that would misrepresent API data.
  if (payload && typeof payload === 'object' &&
      ('total' in payload || 'totalPages' in payload) &&
      payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return [];
  }
  return null;
}

// Fetch every event page returned by Express. The endpoint may cap `limit`,
// so read totalPages/total/limit from the response rather than assuming one page
// contains the entire 5,000-row dataset.
async function fetchAllApiEvents(signal) {
  const endpoint = getApiEndpoint('events');
  const requestedLimit = 50;
  const requestPage = async page => {
    const response = await fetch(`${endpoint}?page=${page}&limit=${requestedLimit}`, {
      headers: { Accept: 'application/json' }, signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} pada GET /api/events?page=${page}`);
    const payload = await response.json();
    const rows = extractEventRows(payload);
    if (rows === null) throw new Error('Format respons GET /api/events tidak berisi array event yang dikenali.');
    return { payload, rows };
  };

  const first = await requestPage(1);
  const metadata = first.payload?.pagination ?? first.payload?.meta ?? first.payload ?? {};
  const firstRows = first.rows;
  const total = Number(metadata.total ?? metadata.totalCount ?? first.payload?.total ?? firstRows.length);
  const actualLimit = Math.max(1, Number(metadata.limit ?? first.payload?.limit ?? requestedLimit) || requestedLimit);
  const providedPages = Number(metadata.totalPages ?? first.payload?.totalPages);
  const totalPages = Math.max(1, Number.isFinite(providedPages) && providedPages > 0
    ? providedPages
    : Math.ceil(Math.max(total, firstRows.length) / actualLimit));

  const allRows = [...firstRows];
  // Small batches avoid flooding the Express API when 5,000 rows span many pages.
  for (let start = 2; start <= totalPages; start += 8) {
    const pages = Array.from({ length: Math.min(8, totalPages - start + 1) }, (_, i) => start + i);
    const results = await Promise.all(pages.map(requestPage));
    results.forEach(result => allRows.push(...result.rows));
    if (signal?.aborted) throw new DOMException('Request dibatalkan', 'AbortError');
  }

  // Prefer all rows actually fetched; never fabricate rows if backend totals disagree.
  return allRows;
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes' || text === 'ya';
}

function getEventTimestamp(event) {
  const candidates = [
    event?.timestamp, event?.datetime, event?.date, event?.event_timestamp,
    event?.eventTimestamp, event?.event_time, event?.eventTime,
    event?.click_time, event?.clickTime, event?.created_at, event?.createdAt,
    event?.date_time, event?.dateTime, event?.click_date, event?.clickDate,
    event?.time
  ];
  return candidates.find(value => value !== undefined && value !== null && value !== '' && value !== '-') ?? null;
}

function normalizeEvent(event, index) {
  const rawFraud = event.is_fraudulent ?? event.isFraudulent ?? event.fraud_label;
  const fraudulent = asBoolean(rawFraud) || String(event.classification ?? '').trim().toLowerCase() === 'fraud';
  const rawRisk = event.risk_score ?? event.riskScore;
  const rawBotScore = event.bot_likelihood_score ?? event.botLikelihoodScore;
  const riskScore = rawRisk !== undefined && rawRisk !== null && rawRisk !== ''
    ? Number(rawRisk)
    : rawBotScore !== undefined && rawBotScore !== null && rawBotScore !== ''
      ? (Number(rawBotScore) <= 1 ? Number(rawBotScore) * 100 : Number(rawBotScore))
      : 0;

  return {
    ...event,
    click_id: event.click_id ?? event.clickId ?? `CLICK-${index + 1}`,
    ip_address: event.ip_address ?? event.ipAddress ?? event.ip ?? '-',
    device: event.device ?? event.device_type ?? event.deviceType ?? 'Unknown',
    timestamp: getEventTimestamp(event) ?? '-',
    classification: fraudulent ? 'Fraud' : 'Valid',
    is_fraudulent: fraudulent,
    risk_score: Number.isFinite(riskScore) ? Math.max(0, Math.min(100, riskScore)) : 0,
    browser: event.browser ?? '-',
    operating_system: event.operating_system ?? event.operatingSystem ?? event.os ?? '-',
    click_duration: event.click_duration ?? event.clickDuration ?? '-',
    scroll_depth: event.scroll_depth ?? event.scrollDepth ?? '-',
    click_frequency: event.click_frequency ?? event.clickFrequency ?? '-',
    VPN_usage: asBoolean(event.VPN_usage ?? event.vpn_usage ?? event.vpnUsage),
    proxy_usage: asBoolean(event.proxy_usage ?? event.Proxy_usage ?? event.proxyUsage)
  };
}

function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = '\uFEFF' + rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Sidebar({ active, onNavigate, open, onClose, eventCount }) {
  return (
    <>
      {open && <button className="mobile-scrim" aria-label="Tutup menu" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Activity size={22} /></div>
          <div><b>ClickGuard</b><small>FRAUD INTELLIGENCE</small></div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-item ${active === id ? 'active' : ''}`}
              onClick={() => { onNavigate(id); onClose(); }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {active === id && <i />}
            </button>
          ))}
        </nav>
        <button
          className={`nav-item settings-item ${active === 'settings' ? 'active' : ''}`}
          onClick={() => { onNavigate('settings'); onClose(); }}
        >
          <Settings size={18} /><span>Pengaturan</span>
        </button>
        <div className="workspace-card">
          <div className="ws-head"><span className="status-dot" />Status dataset</div>
          <p>Dataset lokal dimuat untuk analisis event klik.</p>
          <small>EVENT TERBACA · {numberFormat(eventCount)}</small>
        </div>
        <div className="sidebar-foot">
          SISTEM DETEKSI FRAUD KLIK IKLAN DIGITAL<br />
          Proyek Penelitian · Kelompok 2
        </div>
      </aside>
    </>
  );
}

function Header({ onMenu, onNotifications, notificationOpen, unread }) {
  return (
    <header className="topbar">
      <div className="top-left">
        <button className="icon-button mobile-menu" onClick={onMenu} aria-label="Buka navigasi">
          <Menu size={19} />
        </button>
        <span className="crumb">Workspace <b>/</b> <strong>ClickGuard</strong></span>
      </div>
      <div className="top-actions">
        <button
          className={`icon-button notification ${notificationOpen ? 'pressed' : ''}`}
          onClick={onNotifications}
          aria-label="Notifikasi"
          aria-expanded={notificationOpen}
        >
          <Bell size={18} />
          {unread && <i />}
        </button>
        <div className="profile">
          <div className="avatar">A4</div>
          <div><b>Frontend workspace</b><small>Kelompok 2</small></div>
        </div>
      </div>
    </header>
  );
}

function Tooltip({ children }) {
  const [show, setShow] = useState(false);
  return (
    <span className="tooltip-wrap" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button
        className="help-trigger"
        aria-label="Keterangan grafik"
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onClick={() => setShow(value => !value)}
      >
        <CircleHelp size={15} />
      </button>
      {show && <span role="tooltip" className="tooltip-pop">{children}</span>}
    </span>
  );
}

function Metric({ title, value, sub, Icon, tone, delay }) {
  return (
    <article className="metric-card lift" style={{ '--delay': `${delay}ms` }}>
      <div className="metric-top">
        <span>{title}</span>
        <span className={`metric-icon ${tone}`}><Icon size={19} /></span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom"><span>{sub}</span><span className="metric-glow" /></div>
    </article>
  );
}

/*
 * Parse timestamps into browser-local Date values so bucket labels match the
 * user's local clock. Date-only strings are parsed as local calendar dates.
 */
function parseTrafficDate(row) {
  const candidates = [
    row?.timestamp, row?.datetime, row?.date,
    row?.event_timestamp, row?.eventTimestamp, row?.event_time, row?.eventTime,
    row?.click_time, row?.clickTime, row?.created_at, row?.createdAt,
    row?.date_time, row?.dateTime, row?.click_date, row?.clickDate,
    row?.bucket, row?.period, row?.time, row?._id
  ];
  const candidate = candidates.find(value =>
    value !== undefined && value !== null && value !== '' && value !== '-'
  );

  if (candidate instanceof Date) {
    return Number.isNaN(candidate.getTime()) ? null : new Date(candidate);
  }

  if (candidate && typeof candidate === 'object') {
    const year = Number(candidate.year ?? candidate.y);
    const month = Number(candidate.month ?? candidate.m);
    const day = Number(candidate.day ?? candidate.d);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) && month >= 1 && month <= 12) {
      const hour = Number(candidate.hour ?? candidate.h ?? 0);
      const minute = Number(candidate.minute ?? candidate.min ?? 0);
      return new Date(year, month - 1, day, Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0);
    }
    const nested = candidate.date ?? candidate.$date ?? candidate.timestamp ?? candidate.$oid;
    if (nested !== undefined && nested !== null) return parseTrafficDate({ timestamp: nested });
    return null;
  }

  if (candidate === undefined || candidate === null || candidate === '' || candidate === '-') return null;

  if (typeof candidate === 'number') {
    const date = new Date(Math.abs(candidate) < 1e12 ? candidate * 1000 : candidate);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(candidate).trim();
  if (!text) return null;

  // MongoDB ObjectId stores its creation timestamp in the first 8 hex digits.
  if (/^[a-f0-9]{24}$/i.test(text)) {
    const seconds = Number.parseInt(text.slice(0, 8), 16);
    const date = new Date(seconds * 1000);
    if (!Number.isNaN(date.getTime())) return date;
  }

  // Indonesian DD/MM/YYYY or DD-MM-YYYY timestamps, with optional time.
  const dayFirstMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dayFirstMatch) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = dayFirstMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    if (
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day) &&
      !Number.isNaN(date.getTime())
    ) return date;
  }

  // YYYY-MM-DD and SQL-style local datetime without an explicit timezone.
  const localMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/);
  if (localMatch) {
    const [, year, month, day, hour = '0', minute = '0', second = '0', fraction = '0'] = localMatch;
    const millis = Number(`0.${fraction}`) * 1000;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Math.floor(millis));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Sort event records newest-first for the Overview dashboard table.
 * Events without a parseable timestamp stay after dated records; original order
 * is preserved when both records have no date or share the same timestamp.
 */
function sortEventsNewestFirst(events) {
  return events
    .map((event, originalIndex) => ({
      event,
      originalIndex,
      date: parseTrafficDate({ timestamp: getEventTimestamp(event) })
    }))
    .sort((a, b) => {
      if (a.date && b.date) {
        const difference = b.date.getTime() - a.date.getTime();
        return difference || a.originalIndex - b.originalIndex;
      }
      if (a.date) return -1;
      if (b.date) return 1;
      return a.originalIndex - b.originalIndex;
    })
    .map(item => item.event);
}

function readNumericField(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') {
      const value = Number(row[key]);
      if (Number.isFinite(value)) return Math.max(0, value);
    }
  }
  return undefined;
}

function normalizeTrafficRows(rows) {
  return rows.map((row, index) => {
    const rawFraudField = row?.fraud;
    const fraudFieldIsLabel = typeof rawFraudField === 'boolean' || (
      typeof rawFraudField === 'string' && rawFraudField.trim() !== '' && !Number.isFinite(Number(rawFraudField))
    );
    const fraudValue = readNumericField(row, [
      'fraudCount', 'fraud_count', ...(!fraudFieldIsLabel ? ['fraud'] : []),
      'fraudEvents', 'fraud_events', 'fraudulentCount', 'fraudClicks', 'fraud_clicks'
    ]);
    const totalValue = readNumericField(row, [
      'totalEvents', 'total_events', 'total', 'eventCount', 'event_count',
      'eventTotal', 'count', 'clickCount', 'click_count', 'clicks', 'totalClicks'
    ]);
    const validValue = readNumericField(row, [
      'validCount', 'valid_count', 'valid', 'validEvents', 'valid_events', 'validClicks', 'valid_clicks'
    ]);

    const date = parseTrafficDate(row);
    const hasAggregateFields = fraudValue !== undefined || totalValue !== undefined || validValue !== undefined;

    // Some endpoints return one row per click instead of pre-aggregated counts.
    // Recognize those rows too, so valid/fraud events are not discarded.
    if (!hasAggregateFields) {
      const rawClassification = String(row?.classification ?? row?.status ?? row?.label ?? '').trim().toLowerCase();
      const fraudFlag = row?.is_fraudulent ?? row?.isFraudulent ?? row?.fraudulent ??
        (typeof row?.fraud === 'boolean' || (typeof row?.fraud === 'string' && !Number.isFinite(Number(row.fraud))) ? row.fraud : undefined);
      const hasClassification = ['fraud', 'valid', 'legitimate', 'non-fraud', 'nonfraud'].includes(rawClassification) || fraudFlag !== undefined;
      if (!date || !hasClassification) return null;
      const isFraud = asBoolean(fraudFlag) || ['fraud'].includes(rawClassification);
      return { date, total: 1, fraud: isFraud ? 1 : 0, valid: isFraud ? 0 : 1, order: index };
    }

    const fraud = fraudValue ?? 0;
    const valid = validValue ?? Math.max(0, (totalValue ?? fraud) - fraud);
    const total = totalValue ?? (fraud + valid);

    return { date, total, fraud, valid, order: index };
  }).filter(row => row && Number.isFinite(row.total) && Number.isFinite(row.fraud) && Number.isFinite(row.valid))
    .sort((a, b) => {
      if (a.date && b.date) return a.date.getTime() - b.date.getTime();
      if (a.date) return -1;
      if (b.date) return 1;
      return a.order - b.order;
    });
}

function periodConfig(period) {
  if (period === 'hour') return { count: 24, interval: 'hour', label: 'Per jam' };
  if (period === 'day') return { count: null, interval: 'day', label: 'Per hari' };
  if (period === 'week') return { count: null, interval: 'day', label: 'Per minggu' };
  if (period === 'month') return { count: null, interval: 'day', label: 'Per bulan' };
  return { count: null, interval: 'day', label: 'Per tahun' };
}

function startOfHour(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date) {
  const result = startOfDay(date);
  // Calendar week starts on Monday (Indonesia/local calendar convention).
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

function dayOrdinal(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function hourLabel(date) {
  return `${String(date.getHours()).padStart(2, '0')}:00`;
}

function dayLabel(date) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(date);
}

function validDatedRows(rows) {
  return rows.filter(row => row?.date instanceof Date && !Number.isNaN(row.date.getTime()));
}

function dateExtent(rows, now = new Date()) {
  const datedRows = validDatedRows(rows);
  if (!datedRows.length) return { first: startOfDay(now), last: startOfDay(now), datedRows: [] };
  let first = datedRows[0].date;
  let last = datedRows[0].date;
  for (const row of datedRows) {
    if (row.date < first) first = row.date;
    if (row.date > last) last = row.date;
  }
  return { first, last, datedRows };
}

/**
 * Build timeline buckets from the actual data extent instead of a fixed
 * Jan-2024..Dec-2026 range. The hourly view shows the last 24 hours ending at
 * the current hour when events are current, or at the latest event hour when
 * the supplied dataset is historical. This keeps an old but real dataset visible.
 */
function createTimeline(period, rows = [], now = new Date()) {
  const timeline = [];
  const pushBucket = (date, label, endDate = null) => timeline.push({
    key: `${period}-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${period === 'hour' ? date.getHours() : ''}`,
    date: new Date(date),
    endDate: endDate ? new Date(endDate) : null,
    label,
    total: 0,
    valid: 0,
    fraud: 0
  });
  const { first: dataFirst, last: dataLast } = dateExtent(rows, now);
  // Keep the requested historical window unchanged for hourly, daily, and weekly views.
  // Dataset timestamps span 19 Feb 2024 through 18 Feb 2025.
  const fixedStart = new Date(2024, 1, 19);
  const fixedEnd = new Date(2025, 1, 18);
  const first = ['hour', 'day', 'week'].includes(period) ? fixedStart : dataFirst;
  const last = ['hour', 'day', 'week'].includes(period) ? fixedEnd : dataLast;

  if (period === 'hour') {
    const cursor = startOfHour(first);
    const end = startOfHour(last);
    while (cursor <= end) {
      pushBucket(cursor, hourLabel(cursor));
      cursor.setHours(cursor.getHours() + 1);
    }
    return timeline;
  }

  if (period === 'day') {
    const cursor = startOfDay(first);
    const end = startOfDay(last);
    while (cursor <= end) {
      pushBucket(cursor, dayLabel(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (period === 'week') {
    const cursor = startOfWeek(first);
    const end = startOfWeek(last);
    while (cursor <= end) {
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      pushBucket(cursor, dayLabel(cursor), weekEnd);
      cursor.setDate(cursor.getDate() + 7);
    }
  } else if (period === 'month') {
    const cursor = startOfMonth(first);
    const end = startOfMonth(last);
    while (cursor <= end) {
      pushBucket(cursor, monthLabel(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const cursor = startOfYear(first);
    const end = startOfYear(last);
    while (cursor <= end) {
      pushBucket(cursor, String(cursor.getFullYear()));
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
  }

  return timeline;
}

function getBucketIndex(eventDate, timeline, period) {
  if (!(eventDate instanceof Date) || Number.isNaN(eventDate.getTime()) || !timeline.length) return -1;

  if (period === 'hour') {
    const eventHour = startOfHour(eventDate).getTime();
    return timeline.findIndex(bucket => bucket.date.getTime() === eventHour);
  }

  const firstDate = timeline[0].date;
  if (period === 'day') {
    const index = dayOrdinal(startOfDay(eventDate)) - dayOrdinal(firstDate);
    return index >= 0 && index < timeline.length ? index : -1;
  }

  if (period === 'week') {
    const eventWeek = startOfWeek(eventDate);
    const daysFromStart = dayOrdinal(eventWeek) - dayOrdinal(firstDate);
    const index = Math.floor(daysFromStart / 7);
    return index >= 0 && index < timeline.length ? index : -1;
  }

  if (period === 'month') {
    const index = (eventDate.getFullYear() - firstDate.getFullYear()) * 12 + eventDate.getMonth() - firstDate.getMonth();
    return index >= 0 && index < timeline.length ? index : -1;
  }

  const index = eventDate.getFullYear() - firstDate.getFullYear();
  return index >= 0 && index < timeline.length ? index : -1;
}

function aggregateRowsIntoTimeline(rows, period, now = new Date()) {
  const timeline = createTimeline(period, rows, now);
  for (const row of rows) {
    if (!row.date || Number.isNaN(row.date.getTime())) continue;
    const index = getBucketIndex(row.date, timeline, period);
    if (index < 0) continue;
    timeline[index].valid += row.valid;
    timeline[index].fraud += row.fraud;
    timeline[index].total += row.total;
  }
  return timeline;
}

function bucketsFromApi(rows, period, now = new Date()) {
  const normalizedRows = normalizeTrafficRows(rows).filter(
    row => row.date instanceof Date && !Number.isNaN(row.date.getTime())
  );

  // API bisa berisi data historis. Gunakan tanggal terbaru dari respons sebagai
  // ujung timeline agar data lama tidak hilang karena dibandingkan dengan hari ini.
  const latestDate = normalizedRows.reduce(
    (latest, row) => (!latest || row.date > latest ? row.date : latest),
    null
  );
  const anchorDate = latestDate || now;

  return {
    buckets: aggregateRowsIntoTimeline(normalizedRows, period, anchorDate),
    rows: normalizedRows,
    hasDatedRows: normalizedRows.length > 0,
    hasEvents: normalizedRows.some(row => row.total > 0),
    anchorDate
  };
}

function bucketsFromEvents(events, period, now = new Date()) {
  const rows = events.map(event => {
    const date = parseTrafficDate({ timestamp: getEventTimestamp(event) });
    if (!date) return null;
    const fraudulent = asBoolean(event.is_fraudulent ?? event.isFraudulent) ||
      String(event.classification ?? '').toLowerCase() === 'fraud';
    return {
      date,
      total: 1,
      fraud: fraudulent ? 1 : 0,
      valid: fraudulent ? 0 : 1
    };
  }).filter(Boolean);
  return {
    buckets: aggregateRowsIntoTimeline(rows, period, now),
    rows,
    hasDatedRows: rows.length > 0,
    hasEvents: rows.length > 0
  };
}

function extractTrafficRows(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.data,
    payload?.data?.data,
    payload?.data?.traffic,
    payload?.data?.events,
    payload?.data?.items,
    payload?.traffic,
    payload?.events,
    payload?.results,
    payload?.result?.data,
    payload?.result?.traffic,
    payload?.items
  ];
  return candidates.find(Array.isArray) || [];
}

function apiRange(period, now) {
  const count = periodConfig(period).count;
  let start;
  if (period === 'hour') {
    start = startOfHour(now);
    start.setHours(start.getHours() - (count - 1));
  } else if (period === 'day') {
    start = startOfDay(now);
    start.setDate(start.getDate() - (count - 1));
  } else if (period === 'week') {
    // Include all seven calendar days for every seven-day bucket, including the oldest one.
    start = startOfDay(now);
    start.setDate(start.getDate() - (count * 7 - 1));
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1);
  } else {
    start = new Date(now.getFullYear() - (count - 1), 0, 1);
  }
  return { start, end: new Date(now) };
}

function TrafficChart({ events, period }) {
  const [apiTraffic, setApiTraffic] = useState({ status: 'loading', rows: [] });
  const [hovered, setHovered] = useState(null);
  const [now, setNow] = useState(() => new Date());

  // Update display time regularly. The API is refreshed only when the current hour changes.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentHourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const endpoint = getApiEndpoint('monitoring/traffic');
    // Jangan batasi ke tanggal/jam saat ini: dataset backend dapat berisi
    // histori lama. Ambil interval yang diminta, lalu pilih bucket di frontend.
    const query = new URLSearchParams({
      interval: periodConfig(period).interval
    });

    // Keep the last successful points visible while the next interval loads.
    // This avoids a flash to an empty chart during period changes.
    setApiTraffic(previous => ({ ...previous, status: 'loading', rows: previous.rows || [] }));
    setHovered(null);
    fetch(`${endpoint}?${query.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(async payload => {
        const rows = extractTrafficRows(payload);
        if (rows.length) {
          if (alive) setApiTraffic({ status: 'success', rows, source: 'traffic' });
          return;
        }

        // Beberapa interval (terutama per jam) bisa mengembalikan agregasi kosong
        // karena rentang endpoint mengacu ke waktu sekarang, sementara event yang
        // tersimpan adalah histori. Fallback ke event API agar grafik tetap memakai
        // timestamp aktual, bukan preview simulasi.
        try {
          const eventRows = await fetchAllApiEvents(controller.signal);
          if (alive && eventRows.length) {
            setApiTraffic({ status: 'success', rows: eventRows, source: 'events-fallback', trafficRows: 0 });
          } else if (alive) {
            setApiTraffic({ status: 'empty', rows: [], source: 'traffic' });
          }
        } catch (fallbackError) {
          if (alive && fallbackError.name !== 'AbortError') {
            setApiTraffic({ status: 'empty', rows: [], source: 'traffic' });
          }
        }
      })
      .catch(error => {
        if (alive && error.name !== 'AbortError') {
          setApiTraffic({ status: 'error', rows: [], message: explainApiError(error, 'GET /api/monitoring/traffic') });
        }
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // currentHourKey intentionally changes only when the selected hour changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, currentHourKey]);

  const apiResult = useMemo(
    () => bucketsFromApi(apiTraffic.rows, period, now),
    [apiTraffic.rows, period, now]
  );
  const localResult = useMemo(
    () => bucketsFromEvents(events, period, now),
    [events, period, now]
  );

  const apiCurrentHasData = apiResult.buckets.some(bucket => bucket.total > 0);
  const localCurrentHasData = localResult.buckets.some(bucket => bucket.total > 0);
  let buckets;
  let useApiData = false;
  let useLocalDatedData = false;
  // `events` is the complete set fetched page-by-page from GET /api/events.
  // Prefer these timestamped click records to a limited/rounded traffic
  // aggregation, so every period is calculated from the same actual dataset.
  if (localResult.hasDatedRows) {
    buckets = localResult.buckets;
    useLocalDatedData = true;
  } else if (apiTraffic.status === 'success' && apiCurrentHasData) {
    buckets = apiResult.buckets;
    useApiData = true;
  } else if (apiResult.hasDatedRows && apiCurrentHasData) {
    buckets = apiResult.buckets;
    useApiData = true;
  } else {
    buckets = createTimeline(period, [], now);
  }

  // The chart only renders counts calculated from real API traffic/event rows.
  // Empty or failed API responses stay empty rather than becoming a demo scatter.
  const displayBuckets = buckets;
  const hasData = displayBuckets.some(bucket => bucket.total > 0);

  const maxValue = Math.max(
    1,
    ...displayBuckets.flatMap(bucket => [bucket.valid, bucket.fraud])
  );
  const axisMax = Math.max(1, Math.ceil(maxValue * 1.15));
  // Pusat setiap titik sejajar dengan label periode pada sumbu X.
  const xFor = index => ((index + 0.5) / Math.max(1, displayBuckets.length)) * 100;
  const yFor = value => 96 - (value / axisMax) * 92;

  const validPoints = displayBuckets.map((bucket, index) => ({
    x: xFor(index), y: yFor(bucket.valid), bucket, bucketIndex: index,
    series: 'Valid', count: bucket.valid
  }));
  const fraudPoints = displayBuckets.map((bucket, index) => ({
    x: xFor(index), y: yFor(bucket.fraud), bucket, bucketIndex: index,
    series: 'Fraud', count: bucket.fraud
  }));
  const allPoints = [...validPoints, ...fraudPoints].map(point => ({
    ...point,
    total: point.bucket.total,
    validTotal: point.bucket.valid,
    fraudTotal: point.bucket.fraud,
    label: period === 'hour'
      ? `${point.bucket.label} · ${dayLabel(point.bucket.date)}`
      : period === 'week' && point.bucket.endDate
        ? `${point.bucket.label} – ${dayLabel(point.bucket.endDate)}`
        : point.bucket.label,
    fraudRate: point.bucket.total ? point.bucket.fraud / point.bucket.total * 100 : 0,
    radius: Math.min(7, 3.3 + Math.sqrt(point.count) * 0.2),
    isSynthetic: false
  }));
  // Least-squares regression menghasilkan satu garis lurus panjang yang
  // mengikuti kecenderungan rata-rata sebaran, bukan zig-zag antar titik.
  const trendLine = points => {
    if (points.length < 2) return null;
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const numerator = points.reduce(
      (sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0
    );
    const denominator = points.reduce(
      (sum, point) => sum + (point.x - meanX) ** 2, 0
    );
    const slope = denominator ? numerator / denominator : 0;
    const intercept = meanY - slope * meanX;
    return {
      x1: 0,
      y1: Math.max(4, Math.min(96, slope * 0 + intercept)),
      x2: 100,
      y2: Math.max(4, Math.min(96, slope * 100 + intercept))
    };
  };
  const validTrend = trendLine(validPoints);
  const fraudTrend = trendLine(fraudPoints);

  let sourceText;
  if (useLocalDatedData) sourceText = 'Sumber: seluruh event Express API · timestamp aktual';
  else if (useApiData) sourceText = 'Sumber: agregasi Express API · data historis';
  else if (apiTraffic.status === 'loading') sourceText = 'Memeriksa data historis dari API';
  else if (apiTraffic.status === 'error') sourceText = 'API tidak terhubung · data bertanggal belum tersedia';
  else sourceText = 'Belum ada data bertanggal yang dapat digambarkan';

  const chartLabel = period === 'hour' ? 'Jam' : period === 'day' ? 'Hari' : period === 'week' ? 'Minggu' : period === 'month' ? 'Bulan' : 'Tahun';
  // Every interval receives a label so dates/months never appear to be skipped.
  const showEvery = 1;

  const apiStatusLabel = useLocalDatedData
    ? `Grafik dihitung dari ${localResult.rows.length.toLocaleString('id-ID')} event bertanggal aktual dari Express API`
    : apiTraffic.status === 'success'
      ? `API traffic berhasil · ${apiTraffic.rows.length.toLocaleString('id-ID')} baris respons`
      : apiTraffic.status === 'empty'
        ? 'API merespons, tetapi belum ada data traffic atau event bertanggal'
        : apiTraffic.status === 'error'
          ? `API traffic gagal · ${apiTraffic.message || 'periksa koneksi backend'}`
          : 'API traffic sedang diperiksa…';

  return (
    <>
      <div className={`api-status api-status-${apiTraffic.status}`} role="status" aria-live="polite">
        <span className="api-status-dot" />{apiStatusLabel}
      </div>
      <div className="scatter-chart" role="group" aria-label={`Grafik garis traffic valid dan fraud per ${chartLabel.toLowerCase()}`}>
        <div className="scatter-y-axis" aria-hidden="true">
          {[3, 2, 1, 0].map(level => <span key={level}>{Math.round(axisMax * level / 3)}</span>)}
        </div>
        <div
          className="scatter-scroll"
          style={{ width: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'visible', scrollbarGutter: 'stable', paddingBottom: '8px' }}
          aria-label="Area grafik yang dapat digulir ke kanan dan kiri untuk melihat periode lain"
        >
        <div
          className="scatter-main"
          style={{ minWidth: `${Math.max(720, buckets.length * (period === 'hour' ? 84 : period === 'day' ? 92 : 110))}px` }}
        >
          <div className="scatter-plot-area" onMouseLeave={() => setHovered(null)} style={{ transition: 'opacity 260ms ease-in-out' }}>
            {[0, 1, 2, 3].map(level => (
              <div key={level} className="scatter-gridline" style={{ top: `${4 + (level / 3) * 92}%` }} />
            ))}
            {hasData && displayBuckets.length >= 2 && (
              <svg
                className="scatter-series-lines"
                style={{ transition: 'opacity 700ms ease-in-out' }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                role="img"
                aria-label="Garis tren linear biru untuk Valid dan merah untuk Fraud"
              >
                {validTrend && (
                  <line
                    className="series-line-valid"
                    x1={validTrend.x1} y1={validTrend.y1}
                    x2={validTrend.x2} y2={validTrend.y2}
                  />
                )}
                {fraudTrend && (
                  <line
                    className="series-line-fraud"
                    x1={fraudTrend.x1} y1={fraudTrend.y1}
                    x2={fraudTrend.x2} y2={fraudTrend.y2}
                  />
                )}
              </svg>
            )}
            {hasData && allPoints.map(point => {
              const tooltipLabel = `${point.label} — ${point.series}: ${numberFormat(point.count)} event; total ${numberFormat(point.total)}; valid ${numberFormat(point.validTotal)}; fraud ${numberFormat(point.fraudTotal)}; fraud rate ${percent(point.fraudRate)}.`;
              return (
                <button
                  key={`${point.bucketIndex}-${point.series}`}
                  type="button"
                  className={`scatter-dot ${point.series === 'Valid' ? 'dot-valid' : 'dot-fraud'}`}
                  style={{
                    left: `${point.x}%`,
                    top: `${point.y}%`,
                    width: `${Math.max(9, point.radius * 2)}px`,
                    height: `${Math.max(9, point.radius * 2)}px`,
                    transition: 'left 760ms cubic-bezier(0.22, 1, 0.36, 1), top 760ms cubic-bezier(0.22, 1, 0.36, 1), width 420ms ease-in-out, height 420ms ease-in-out, opacity 420ms ease-in-out, box-shadow 420ms ease-in-out'
                  }}
                  aria-label={tooltipLabel}
                  title={tooltipLabel}
                  onMouseEnter={() => setHovered(point)}
                  onFocus={() => setHovered(point)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setHovered(point)}
                />
              );
            })}
            {hovered && (
              <div
                className="scatter-tooltip"
                style={{
                  left: `${Math.min(70, Math.max(2, hovered.x))}%`,
                  top: `${Math.min(78, Math.max(18, hovered.y))}%`
                }}
                role="status"
                aria-live="polite"
              >
                <strong>{hovered.label} · {hovered.series}</strong>
                <span>Event {hovered.series.toLowerCase()}: <b>{numberFormat(hovered.count)}</b></span>
                <span>Total traffic interval: <b>{numberFormat(hovered.total)}</b></span>
                <span>Valid: {numberFormat(hovered.validTotal)} · Fraud: {numberFormat(hovered.fraudTotal)}</span>
                <span>Fraud rate: {percent(hovered.fraudRate)}</span>
              </div>
            )}
          </div>
          <div className="scatter-x-axis" style={{ gridTemplateColumns: `repeat(${Math.max(1, buckets.length)}, minmax(0, 1fr))` }}>
            {buckets.map((bucket, index) => (
              <span
                key={bucket.key ?? `${bucket.label}-${index}`}
                title={period === 'hour' ? `${bucket.label} · ${dayLabel(bucket.date)}` : period === 'week' && bucket.endDate ? `${dayLabel(bucket.date)} – ${dayLabel(bucket.endDate)}` : bucket.label}
              >
                {index % showEvery === 0 || index === buckets.length - 1 ? (
                  <>
                    <span>{bucket.label}</span>
                    {period === 'hour' && (
                      <small
                        className="hour-date-label"
                        style={{ display: 'block', fontSize: '12px', fontWeight: 700, lineHeight: 1.3, color: '#52627a', marginTop: '4px', letterSpacing: '0.1px', whiteSpace: 'nowrap' }}
                      >
                        {dayLabel(bucket.date)}
                      </small>
                    )}
                  </>
                ) : ''}
              </span>
            ))}
          </div>
        </div>
        </div>
      </div>
      {!hasData && (
        <div className="chart-empty">
          Belum ada event bertanggal yang dapat digambarkan. Periksa format timestamp pada dataset atau respons endpoint traffic.
        </div>
      )}
      <div className="scatter-axis-caption">
        Sumbu X: {chartLabel.toLowerCase()} · Sumbu Y: jumlah event. Garis biru: tren Valid; garis merah: tren Fraud. Gulir area grafik ke kanan atau kiri untuk melihat periode/tanggal lain. Periode tanpa record pada sumber data ditampilkan 0.
      </div>
      <div
          className="hour-date-explanation"
          role="note"
          style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '10px', background: '#f4f7ff', border: '1px solid #dce6ff', color: '#40516b', fontSize: '13px', lineHeight: 1.55 }}
        >
          <strong style={{ display: 'block', fontSize: '13px', marginBottom: '2px' }}>Cara membaca tanggal dan jam</strong>
          Rentang Per hari, Per minggu, Per bulan, dan Per tahun mengikuti timestamp event API paling awal sampai paling akhir, bukan rentang tanggal yang ditulis tetap di kode. Pada CSV acuan yang diperiksa, data dimulai 19 Februari 2024 dan berakhir 18 Februari 2025; jika data API berubah, batas grafik mengikuti timestamp API yang diterima. Gunakan scroll horizontal untuk melihat seluruh rentang. Minggu dimulai pada hari Senin, sedangkan bulan dan tahun mengikuti kalender. Jumlah Valid/Fraud hanya berasal dari event API yang masuk ke setiap bucket. Tanggal tanpa event bernilai 0—grafik tidak membuat event palsu. Per jam menampilkan 24 bucket per jam; jika data berasal dari dataset historis, 24 jam tersebut berakhir pada jam event terbaru, sedangkan data terkini berakhir pada jam sekarang.
        </div>

      <section
        className="traffic-calculation-panel"
        aria-labelledby="traffic-calculation-title"
        style={{
          marginTop: '18px',
          padding: '18px 20px',
          border: '1px solid #dfe7f5',
          borderRadius: '14px',
          background: 'linear-gradient(135deg, #fbfcff 0%, #f7f9ff 100%)',
          color: '#52627a',
          fontSize: '13px',
          lineHeight: 1.65
        }}
      >
        <h3
          id="traffic-calculation-title"
          style={{ margin: '0 0 12px', color: '#172b4d', fontSize: '15px', fontWeight: 750 }}
        >
          Perhitungan &amp; kategori event
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <code style={{ background: '#fff', border: '1px solid #dce5f4', borderRadius: '9px', padding: '7px 10px', color: '#40516b' }}>
            Valid = jumlah label 0
          </code>
          <code style={{ background: '#fff', border: '1px solid #dce5f4', borderRadius: '9px', padding: '7px 10px', color: '#40516b' }}>
            Fraud = jumlah label 1
          </code>
          <code style={{ background: '#fff', border: '1px solid #dce5f4', borderRadius: '9px', padding: '7px 10px', color: '#40516b' }}>
            Total = Valid + Fraud
          </code>
          <code style={{ background: '#fff', border: '1px solid #dce5f4', borderRadius: '9px', padding: '7px 10px', color: '#40516b' }}>
            Fraud rate = (Fraud ÷ Total) × 100%
          </code>
        </div>
        <p style={{ margin: '6px 0' }}><strong style={{ color: '#40516b' }}>Valid:</strong> <code>is_fraudulent = 0</code>.</p>
        <p style={{ margin: '6px 0' }}><strong style={{ color: '#40516b' }}>Fraud:</strong> <code>is_fraudulent = 1</code>.</p>
        <p style={{ margin: '8px 0' }}>
          Grafik saat ini menggunakan agregasi <strong>{period === 'hour' ? 'per jam' : period === 'day' ? 'per hari' : period === 'week' ? 'per minggu' : period === 'month' ? 'per bulan' : 'per tahun'}</strong>.
          Setiap bucket menghitung jumlah event Valid dan Fraud pada rentang waktu tersebut. Saat periode diganti, bucket dan label waktunya ikut berubah; rumus kategorinya tetap sama.
        </p>
        <p style={{ margin: '8px 0' }}>
          Kategori mengikuti label dataset. Tidak dibuat subkategori atau ambang tambahan karena dataset tidak menyediakan label dan bukti untuk menentukan klasifikasi tersebut.
        </p>
        <p style={{ margin: '8px 0' }}>
          Garis tren solid (biru untuk Valid dan merah untuk Fraud) dihitung dengan regresi linear pada jumlah event per periode dan hanya digunakan untuk membaca kecenderungan naik/turun pada rentang data yang ditampilkan, bukan untuk memprediksi periode berikutnya.
          Garis horizontal 0 event hanya batas bawah sumbu, bukan ambang keputusan fraud.
        </p>
        <p style={{ margin: '12px 0 0', color: '#7a8ba5', fontSize: '12px' }}>
          Rentang grafik mengikuti data yang tersedia dari sumber. Nilai pada setiap titik adalah jumlah event, bukan persentase atau risk score per klik. Data waktu ditampilkan mengikuti label pada sumbu X.
        </p>
      </section>

      <div className="legend">
        <span><i className="legend-blue" />Valid</span>
        <span><i className="legend-red" />Fraud</span>
        <small className="chart-source">{sourceText}</small>
      </div>
    </>
  );
}

function BlockedIPTable({ ips, status, error, page, setPage }) {
  const pageCount = Math.max(1, Math.ceil(ips.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageIPs = ips.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr><th>IP ADDRESS</th></tr></thead>
          <tbody>
            {status === 'loading' && <tr><td>Memuat daftar blocked IP dari Express API...</td></tr>}
            {status === 'error' && <tr><td role="alert">Daftar blocked IP gagal dimuat. {error}</td></tr>}
            {status === 'empty' && <tr><td>Belum ada IP yang tersimpan pada collection blocked_ips.</td></tr>}
            {status === 'success' && pageIPs.map(item => (
              <tr key={item._id || item.ip_address}>
                <td className="mono"><b>{item.ip_address}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {status === 'success' && (
        <div className="table-footer pagination-footer">
          <span className="pagination-info">Halaman {safePage} dari {pageCount} · {ips.length} IP</span>
          <nav className="pagination-controls" aria-label="Navigasi halaman daftar blocked IP">
            <button className="pagination-nav" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft size={14} /><span>Sebelumnya</span>
            </button>
            {Array.from({ length: pageCount }, (_, index) => index + 1)
              .filter(number => number === 1 || number === pageCount || Math.abs(number - safePage) <= 1)
              .map(number => (
                <button
                  key={number}
                  className={`pagination-page ${number === safePage ? 'page-active' : ''}`}
                  aria-current={number === safePage ? 'page' : undefined}
                  aria-label={`Halaman ${number} daftar blocked IP`}
                  onClick={() => setPage(number)}
                >{number}</button>
              ))}
            <button className="pagination-nav" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
              <span>Berikutnya</span><ChevronRight size={14} />
            </button>
          </nav>
        </div>
      )}
    </>
  );
}

function EventTable({ events, onSelect, page, setPage }) {
  const pageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageEvents = events.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>CLICK ID</th><th>IP ADDRESS</th><th>DEVICE</th><th>TIMESTAMP</th><th>CLASSIFICATION</th><th>RISK</th>
            </tr>
          </thead>
          <tbody>
            {pageEvents.map(event => (
              <tr
                key={event.click_id}
                tabIndex="0"
                onClick={() => onSelect(event)}
                onKeyDown={keyEvent => { if (keyEvent.key === 'Enter') onSelect(event); }}
              >
                <td><b>{event.click_id}</b></td>
                <td className="mono">{event.ip_address}</td>
                <td>{event.device}</td>
                <td>{event.timestamp}</td>
                <td><span className={`class-pill ${event.is_fraudulent ? 'fraud' : 'valid'}`}><i />{event.classification}</span></td>
                <td>
                  <span className="risk-track">
                    <i style={{ width: `${Math.max(0, Math.min(100, event.risk_score))}%`, background: event.is_fraudulent ? 'var(--rose)' : 'var(--blue)' }} />
                  </span>
                  <small>{event.risk_score}</small>
                </td>
              </tr>
            ))}
            {!pageEvents.length && <tr><td colSpan="6">Tidak ada data yang cocok dengan filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-footer pagination-footer">
        <span className="pagination-info">Halaman {safePage} dari {pageCount} · {events.length} event</span>
        <nav className="pagination-controls" aria-label="Navigasi halaman tabel">
          <button className="pagination-nav" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
            <ChevronLeft size={14} /><span>Sebelumnya</span>
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1)
            .filter(number => number === 1 || number === pageCount || Math.abs(number - safePage) <= 1)
            .map(number => (
              <button
                key={number}
                className={`pagination-page ${number === safePage ? 'page-active' : ''}`}
                aria-current={number === safePage ? 'page' : undefined}
                aria-label={`Halaman ${number}`}
                onClick={() => setPage(number)}
              >{number}</button>
            ))}
          <button className="pagination-nav" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
            <span>Berikutnya</span><ChevronRight size={14} />
          </button>
        </nav>
      </div>
    </>
  );
}

function LatestEventsTable({ events, onSelect, loading }) {
  const latestEvents = events.slice(0, PAGE_SIZE);

  return (
    <div className="table-wrap latest-events-table-wrap">
      <table aria-label="Sepuluh event klik terbaru">
        <thead>
          <tr>
            <th>CLICK ID</th>
            <th>IP ADDRESS</th>
            <th>DEVICE</th>
            <th>TIMESTAMP</th>
            <th>CLASSIFICATION</th>
            <th>RISK</th>
          </tr>
        </thead>
        <tbody>
          {latestEvents.map(event => (
            <tr
              key={`${event.click_id}-${String(event.timestamp)}`}
              tabIndex="0"
              onClick={() => onSelect(event)}
              onKeyDown={keyEvent => {
                if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                  keyEvent.preventDefault();
                  onSelect(event);
                }
              }}
            >
              <td><b>{event.click_id}</b></td>
              <td className="mono">{event.ip_address}</td>
              <td>{event.device}</td>
              <td>{event.timestamp}</td>
              <td>
                <span className={`class-pill ${event.is_fraudulent ? 'fraud' : 'valid'}`}>
                  <i />{event.classification}
                </span>
              </td>
              <td>
                <span className="risk-track">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, event.risk_score))}%`,
                      background: event.is_fraudulent ? 'var(--rose)' : 'var(--blue)'
                    }}
                  />
                </span>
                <small>{event.risk_score}</small>
              </td>
            </tr>
          ))}
          {!latestEvents.length && (
            <tr>
              <td colSpan="6">
                {loading
                  ? 'Memuat event terbaru dari Express API…'
                  : 'Belum ada event terbaru dari Express API.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="latest-events-footer">
        <span>
          {latestEvents.length
            ? `Menampilkan ${latestEvents.length} event terbaru berdasarkan timestamp`
            : 'Tabel akan terisi setelah API mengembalikan event'}
        </span>
        <span className="latest-events-source">Sumber: Express API</span>
      </div>
    </div>
  );
}

function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dataSource, setDataSource] = useState('loading');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [modelMetrics, setModelMetrics] = useState(null);
  const [modelStatus, setModelStatus] = useState('checking');
  const [blockedIPs, setBlockedIPs] = useState([]);
  const [blockedIPStatus, setBlockedIPStatus] = useState('loading');
  const [blockedIPError, setBlockedIPError] = useState('');
  const [blockedIPPage, setBlockedIPPage] = useState(1);
  const [active, setActive] = useState('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [period, setPeriod] = useState('hour');
  const [classFilter, setClassFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    // Check health independently: an empty event collection does NOT mean the API is offline.
    fetch(getApiHealthEndpoint(), { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(payload => {
        if (alive) setBackendStatus(String(payload?.status || '').toLowerCase() === 'ok' ? 'connected' : 'unknown');
      })
      .catch(error => {
        if (alive && error.name !== 'AbortError') setBackendStatus('offline');
      });

    // Read the model endpoint so the UI can distinguish API connectivity from model readiness.
    fetch(getApiEndpoint('monitoring/metrics'), {
      headers: { Accept: 'application/json' }, signal: controller.signal
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      
      .then(payload => {
        if (!alive) return;

        const status = String(
          payload?.status ?? payload?.data?.status ?? ''
        ).trim();

        const metrics = payload?.data;

        if (
          status === 'RESULT_RECORDED' &&
          metrics &&
          typeof metrics === 'object' &&
          !Array.isArray(metrics)
        ) {
          setModelMetrics({
            model_type: typeof metrics.model_type === 'string'
              ? metrics.model_type
              : 'Model tidak diketahui',
            accuracy: metrics.accuracy,
            precision: metrics.precision,
            recall: metrics.recall,
            f1_score: metrics.f1_score,
            roc_auc: metrics.roc_auc
          });
        } else {
          setModelMetrics(null);
        }

                setModelStatus(
          status === 'NO_MODEL_RUN_RECORDED'
            ? 'no-run'
            : status === 'RESULT_RECORDED'
              ? 'available'
              : 'unknown'
        );
      })
      
      .catch(error => {
        if (alive && error.name !== 'AbortError') setModelStatus('unknown');
      });

    // Read the actual blocked_ips collection. VPN/proxy indicators from events
    // remain a separate Risk signals view and must never be presented as blocked IPs.
    fetchAllBlockedIPs({
      endpoint: getApiEndpoint('blocked-ips'),
      signal: controller.signal
    })
      .then(rows => {
        if (!alive) return;
        setBlockedIPs(rows);
        setBlockedIPStatus(rows.length ? 'success' : 'empty');
        setBlockedIPError('');
      })
      .catch(error => {
        if (!alive || error.name === 'AbortError') return;
        setBlockedIPs([]);
        setBlockedIPStatus('error');
        setBlockedIPError(explainApiError(error, 'GET /api/blocked-ips'));
      });

    // The 5,000-row click_fraud_dataset.csv must be imported into MongoDB and
    // served by Express. Read all API pages so metrics are calculated from the
    // actual event records instead of the old embedded 350-row preview.
    (async () => {
      setLoading(true);
      setDataSource('loading');
      try {
        const rows = await fetchAllApiEvents(controller.signal);
        if (!alive) return;
        const normalized = rows.map(normalizeEvent);
        setEvents(normalized);
        setDataSource('api');
        setLoadError(normalized.length
          ? ''
          : 'API berhasil dihubungi, tetapi belum ada event tersimpan. Pastikan 5.000 baris click_fraud_dataset.csv sudah diimpor ke MongoDB.');
      } catch (error) {
        if (!alive || error.name === 'AbortError') return;
        setEvents([]);
        setDataSource('error');
        setLoadError(explainApiError(error, 'GET /api/events'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; controller.abort(); };
  }, []);

  const filtered = useMemo(() => events.filter(event =>
    (classFilter === 'all' || (classFilter === 'fraud' ? event.is_fraudulent : !event.is_fraudulent)) &&
    (deviceFilter === 'all' || String(event.device).toLowerCase() === deviceFilter)
  ), [events, classFilter, deviceFilter]);

  const shown = active === 'fraud'
    ? filtered.filter(event => event.is_fraudulent)
    : active === 'blocked'
      ? filtered.filter(event => event.VPN_usage || event.proxy_usage)
      : filtered;

  // Progress 18: show the 10 most recent API events on Overview, ordered by timestamp.
  const latestEvents = useMemo(
    () => sortEventsNewestFirst(filtered).slice(0, PAGE_SIZE),
    [filtered]
  );

  useEffect(() => { setPage(1); setBlockedIPPage(1); }, [active, classFilter, deviceFilter]);

  const total = filtered.length;
  const fraudCount = filtered.filter(event => event.is_fraudulent).length;
  const validCount = total - fraudCount;
  const fraudRate = total ? fraudCount / total * 100 : 0;
  const datasetTotal = events.length;
  const datasetFraudCount = events.filter(event => event.is_fraudulent).length;
  const datasetValidCount = datasetTotal - datasetFraudCount;
  const datasetFraudRate = datasetTotal ? datasetFraudCount / datasetTotal * 100 : 0;

  const downloadReport = () => {
    const reportDate = new Date();
    const reportDateLabel = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(reportDate);
    const rows = [
      ['Laporan ClickGuard', 'Seluruh event aktual dari Express API'],
      ['Tanggal laporan', reportDateLabel],
      [],
      ['No', 'Click ID', 'Tanggal event', 'IP Address', 'Perangkat', 'Status', 'Risk score', 'Alasan', 'Keterangan', 'Kesimpulan']
    ];

    events.forEach((event, index) => {
      const reason = event.is_fraudulent
        ? [
            event.VPN_usage && 'VPN terdeteksi',
            event.proxy_usage && 'Proxy terdeteksi',
            Number(event.click_frequency) > 0 && 'Frekuensi klik tercatat'
          ].filter(Boolean).join('; ') || 'Event berlabel fraud pada dataset'
        : 'Event berlabel valid pada dataset';

      rows.push([
        index + 1, event.click_id, event.timestamp, event.ip_address, event.device,
        event.classification, event.risk_score, reason,
        'Klasifikasi mengikuti dataset; belum diverifikasi backend',
        event.is_fraudulent ? 'Perlu ditinjau' : 'Valid menurut label dataset'
      ]);
    });

    rows.push([]);
    rows.push(['Ringkasan', `Total ${events.length} event`]);
    rows.push(['Event berlabel fraud', datasetFraudCount]);
    rows.push(['Event berlabel valid', datasetValidCount]);
    rows.push(['Kesimpulan', 'Klasifikasi mengikuti dataset dan perlu validasi backend.']);
    downloadCsv(`clickguard-laporan-${reportDate.toISOString().slice(0, 10)}.csv`, rows);
  };

  const title = {
    overview: 'Overview', events: 'Click events', fraud: 'Fraud monitoring',
    blocked: 'Blocked IPs', settings: 'Pengaturan'
  }[active];

  return (
    <div className="app-shell">
      <Sidebar active={active} onNavigate={setActive} open={mobileOpen} onClose={() => setMobileOpen(false)} eventCount={events.length} />
      <div className="main-shell">
        <Header
          onMenu={() => setMobileOpen(true)}
          onNotifications={() => { setNotifyOpen(value => !value); setNotificationsRead(true); }}
          notificationOpen={notifyOpen}
          unread={!notificationsRead}
        />

        {notifyOpen && (
          <div className="notification-pop">
            <div className="pop-title">
              <b>Notifikasi</b>
              <button onClick={() => setNotifyOpen(false)} aria-label="Tutup"><X size={15} /></button>
            </div>
            <p><span className="notif-dot red" />{fraudCount} event berlabel fraud pada dataset.</p>
            <p><span className="notif-dot blue" />API memuat {numberFormat(events.length)} event aktual.</p>
            <small>Notifikasi dihitung dari event API yang dimuat, bukan alert backend.</small>
          </div>
        )}

        <main className="content">
          <div className="eyebrow"><span />AD FRAUD DETECTION SYSTEM</div>
          <div className="title-row">
            <div><h1>{title}</h1><p className="lead">{descriptions[active]}</p></div>
            <div className="toolbar">
              {active === 'events' && (
                <button
                  type="button"
                  className="btn-back-overview"
                  onClick={() => {
                    setActive('overview');
                    setPage(1);
                    setFilterOpen(false);
                  }}
                  aria-label="Kembali ke halaman Overview"
                >
                  <ChevronLeft size={15} aria-hidden="true" />
                  Kembali ke Overview
                </button>
              )}
              {active !== 'settings' && (
                <button className={`btn-filter ${filterOpen ? 'selected' : ''}`} onClick={() => setFilterOpen(value => !value)} aria-expanded={filterOpen}>
                  <Filter size={16} />{active === 'blocked' ? 'Filter risk signals' : 'Filter data'}<ChevronDown size={14} />
                </button>
              )}
              <button className="btn-download" onClick={downloadReport}><FileDown size={16} />Unduh Laporan</button>
            </div>
          </div>

          {loadError && <div className="demo-banner"><Info size={18} />{loadError}</div>}
          {loading && <p className="loading-message">Memuat dataset...</p>}

          {filterOpen && active !== 'settings' && (
            <div className="filter-panel">
              <div className="filter-heading"><b>{active === 'blocked' ? 'Filter Risk Signals' : 'Filter event'}</b><button onClick={() => setFilterOpen(false)} aria-label="Tutup filter"><X size={15} /></button></div>
              <label>Klasifikasi
                <select value={classFilter} onChange={event => setClassFilter(event.target.value)}>
                  <option value="all">Semua</option><option value="fraud">Fraud</option><option value="valid">Valid</option>
                </select>
              </label>
              <label>Perangkat
                <select value={deviceFilter} onChange={event => setDeviceFilter(event.target.value)}>
                  <option value="all">Semua perangkat</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option>
                </select>
              </label>
              <button className="clear-filter" onClick={() => { setClassFilter('all'); setDeviceFilter('all'); }}>Reset filter</button>
              <span className="filter-result">Menampilkan {filtered.length} {active === 'blocked' ? 'event risk signals' : 'event'}</span>
            </div>
          )}

          {active === 'settings' ? (
            <section className="panel settings-panel">
              <div className="panel-head">
                <div><h2>Status integrasi</h2><p>Informasi koneksi dashboard</p></div>
                <span className={`status-chip ${backendStatus === 'connected' ? 'status-connected' : ''}`}><span />{backendStatus === 'connected' ? 'Backend terhubung' : backendStatus === 'offline' ? 'Backend offline' : 'Memeriksa backend'}</span>
              </div>
              <div className="setting-row">
                <div><b>Backend</b><p>Express API · GET /health dan /api/events.</p></div><span className="status-chip">{backendStatus === 'connected' ? 'Terhubung' : backendStatus === 'offline' ? 'Offline' : 'Memeriksa'}</span>
              </div>
              <div className="setting-row">
                <div><b>Sumber data</b><p>{dataSource === 'api' ? 'Express API · data aktual' : dataSource === 'error' ? 'API gagal dimuat' : 'Sumber data sedang diperiksa'} · {events.length} event terbaca.</p></div>
                <span className="status-chip"><Check size={13} />Terbaca</span>
              </div>
              <div className="setting-row">
                <div><b>Blocked IPs</b><p>GET /api/blocked-ips · {blockedIPs.length} IP aktual terbaca.</p></div>
                <span className="status-chip">{blockedIPStatus === 'success' ? 'Terbaca' : blockedIPStatus === 'empty' ? 'Kosong' : blockedIPStatus === 'error' ? 'Gagal' : 'Memuat'}</span>
              </div>
              <div className="setting-row">
                <div><b>Model deteksi</b><p>{modelStatus === 'no-run' ? 'Belum ada hasil model run tersimpan di MongoDB.' : modelStatus === 'available' ? 'Endpoint metrics mengembalikan status model.' : 'Status model sedang diperiksa.'}</p></div><span className="status-chip">{modelStatus === 'no-run' ? 'Belum ada hasil model' : modelStatus === 'available' ? 'Status tersedia' : 'Belum diverifikasi'}</span>
              </div>
            </section>
          ) : (
            <>
              {active === 'overview' && (
                <>
                  <section className="metrics-grid">
                    <Metric title="Total click events" value={numberFormat(datasetTotal)} sub="Total event dari Express API" Icon={MousePointer2} tone="blue" delay={0} />
                    <Metric title="Fraud flagged" value={numberFormat(datasetFraudCount)} sub="Event dengan is_fraudulent = 1" Icon={ShieldAlert} tone="rose" delay={60} />
                    <Metric title="Valid traffic" value={numberFormat(datasetValidCount)} sub="Event dengan is_fraudulent = 0" Icon={ShieldCheck} tone="green" delay={120} />
                    <Metric title="Fraud rate" value={percent(datasetFraudRate)} sub="Fraud ÷ total event × 100%" Icon={Activity} tone="violet" delay={180} />
                  </section>
                  <section className="panels-grid">
                    <section className="panel traffic-panel">
                      <div className="panel-head">
                        <div><h2>Traffic overview</h2><p>Jumlah event Valid dan Fraud berdasarkan periode waktu</p></div>
                        <div className="chart-actions">
                          <label className="period-select-wrap" aria-label="Pilih periode grafik traffic">
                            <CalendarDays size={14} aria-hidden="true" />
                            <select className="period-select" value={period} onChange={event => setPeriod(event.target.value)} aria-label="Periode traffic">
                              <option value="hour">Per jam</option><option value="day">Per hari</option><option value="week">Per minggu</option><option value="month">Per bulan</option><option value="year">Per tahun</option>
                            </select>
                            <ChevronDown size={13} aria-hidden="true" />
                          </label>
                          <Tooltip>Grafik memakai event aktual dari GET /api/events dan mengelompokkan timestamp sesuai periode yang dipilih. Per jam menampilkan seluruh bucket dari jam event paling awal sampai jam event terbaru. Per hari, minggu, bulan, dan tahun mengikuti tanggal event paling awal sampai terbaru. Titik tanpa event bernilai 0. Garis lurus menunjukkan regresi linear Valid dan Fraud.</Tooltip>
                        </div>
                      </div>
                      <TrafficChart events={events} period={period} />
                    </section>
                    <section className="panel model-panel">
                      <div className="panel-head">
                        <div><h2>Model status</h2><p>Kesiapan model deteksi</p></div>
                        <span className={`status-chip ${backendStatus === 'connected' ? 'status-connected' : ''}`}><span />{backendStatus === 'connected' ? 'Backend terhubung' : backendStatus === 'offline' ? 'Backend offline' : 'Memeriksa backend'}</span>
                      </div>
                      <div className="model-illustration">
                        <div className="orb orb-a" /><div className="orb orb-b" />
                        <div className="model-icon"><Activity size={25} /></div>
                        <b>{modelStatus === 'no-run' ? 'Belum ada hasil model tersimpan' : modelStatus === 'available' ? 'Status model tersedia' : 'Model belum diverifikasi'}</b>
                        <p>{modelStatus === 'no-run' ? 'Backend terhubung, tetapi belum ada hasil model run di MongoDB.' : 'Status model dan hasil deteksi mengikuti respons endpoint backend.'}</p>
                      </div>
                      <div className="model-source"><span>Status integrasi</span><code>{backendStatus === 'connected' ? 'Terhubung' : backendStatus === 'offline' ? 'Offline' : 'Memeriksa'}</code></div>
                      {modelMetrics && (
                        <div className="model-metrics">
                          <h3>Metrik evaluasi model</h3>
                          <p className="model-metrics-name">{modelMetrics.model_type}</p>

                          <div className="model-metrics-grid">
                            {[
                              ['Accuracy', modelMetrics.accuracy],
                              ['Precision', modelMetrics.precision],
                              ['Recall', modelMetrics.recall],
                              ['F1-score', modelMetrics.f1_score],
                              ['ROC-AUC', modelMetrics.roc_auc]
                            ].map(([label, value]) => (
                              <div className="model-metric-item" key={label}>
                                <span>{label}</span>
                                <strong>
                                  {typeof value === 'number' && Number.isFinite(value)
                                    ? `${(value * 100).toFixed(2)}%`
                                    : '—'}
                                </strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  </section>
                  <section className="panel events-panel latest-events-panel">
                    <div className="panel-head events-head latest-events-head">
                      <div>
                        <h2>Event Terbaru</h2>
                        <p>10 event terbaru dari Express API · pilih baris untuk melihat detail</p>
                      </div>
                      <button
                        type="button"
                        className="latest-events-all-button"
                        onClick={() => {
                          setClassFilter('all');
                          setDeviceFilter('all');
                          setPage(1);
                          setActive('events');
                        }}
                        aria-label="Lihat semua event pada halaman Click events"
                      >
                        Lihat semua event
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    </div>
                    <LatestEventsTable
                      events={latestEvents}
                      onSelect={setSelected}
                      loading={loading}
                    />
                  </section>
                </>
              )}
              {active === 'blocked' && (
                <>
                  <section className="panel events-panel">
                    <div className="panel-head events-head">
                      <div>
                        <h2>Blocked IPs aktual</h2>
                        <p>Daftar IP yang benar-benar tersimpan pada collection blocked_ips melalui GET /api/blocked-ips.</p>
                      </div>
                      <span className="table-badge">{blockedIPStatus === 'success' ? `${blockedIPs.length} IP` : blockedIPStatus === 'loading' ? 'Memuat' : blockedIPStatus === 'error' ? 'Gagal dimuat' : '0 IP'}</span>
                    </div>
                    <BlockedIPTable
                      ips={blockedIPs}
                      status={blockedIPStatus}
                      error={blockedIPError}
                      page={blockedIPPage}
                      setPage={setBlockedIPPage}
                    />
                  </section>
                  <section className="panel events-panel" style={{ marginTop: '18px' }}>
                    <div className="panel-head events-head">
                      <div>
                        <h2>Risk signals (VPN / Proxy)</h2>
                        <p>{shown.length} event dengan VPN_usage=1 atau proxy_usage=1. Sinyal ini bukan daftar IP yang diblokir.</p>
                      </div>
                      <span className="table-badge">{shown.length} events</span>
                    </div>
                    <EventTable events={shown} onSelect={setSelected} page={page} setPage={setPage} />
                  </section>
                </>
              )}
              {active !== 'overview' && active !== 'blocked' && (
                <section className="panel events-panel">
                  <div className="panel-head events-head">
                    <div>
                      <h2>{active === 'fraud' ? 'Fraud events' : 'Click event records'}</h2>
                      <p>{shown.length} event · pilih baris untuk detail</p>
                    </div>
                    <span className="table-badge">{shown.length} events</span>
                  </div>
                  <EventTable events={shown} onSelect={setSelected} page={page} setPage={setPage} />
                </section>
              )}
            </>
          )}

          <footer>
            <span>© 2026 ClickGuard · Sistem Deteksi Fraud Klik Iklan Digital</span>
            <span className="footer-state"><i />{backendStatus === 'connected' ? (dataSource === 'api' ? 'Backend terhubung · data API' : 'Backend terhubung · data belum tersedia') : backendStatus === 'offline' ? 'Backend offline · data API tidak tersedia' : 'Memeriksa koneksi backend'}</span>
          </footer>
        </main>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section className="detail-modal" onClick={event => event.stopPropagation()}>
            <div className="modal-head">
              <div><small>DETAIL EVENT</small><h3>{selected.click_id}</h3></div>
              <button onClick={() => setSelected(null)} aria-label="Tutup detail"><X size={18} /></button>
            </div>
            <div className="detail-status">
              <span className={`class-pill ${selected.is_fraudulent ? 'fraud' : 'valid'}`}>{selected.classification}</span>
              <b>Risk score {selected.risk_score}/100</b>
            </div>
            <div className="detail-grid">
              {[
                ['IP address', selected.ip_address], ['Timestamp', selected.timestamp],
                ['Device', selected.device], ['Browser', selected.browser], ['OS', selected.operating_system],
                ['Click duration', `${selected.click_duration}s`], ['Scroll depth', `${selected.scroll_depth}%`],
                ['Click frequency', selected.click_frequency], ['VPN usage', selected.VPN_usage ? 'Yes' : 'No'],
                ['Proxy usage', selected.proxy_usage ? 'Yes' : 'No']
              ].map(([key, value]) => <div key={key}><small>{key}</small><b>{value}</b></div>)}
            </div>
            <p className="modal-note">Klasifikasi dan risk score mengikuti nilai yang tersedia pada dataset. Hasil ini belum diverifikasi oleh backend.</p>

            {/* Catatan tambahan Progress 18: menjelaskan arti Risk Score tanpa mengubah alur yang sudah ada. */}
            <section
              className="risk-score-note"
              role="note"
              aria-label="Penjelasan risk score"
              style={{
                marginTop: '12px',
                padding: '12px 14px',
                border: '1px solid #dbe5f4',
                borderRadius: '12px',
                background: '#f8faff',
                color: '#52627a',
                fontSize: '13px',
                lineHeight: 1.55
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '5px',
                  color: '#172b4d',
                  fontWeight: 750
                }}
              >
                <Info size={16} aria-hidden="true" />
                Arti Risk Score
              </div>
              <p style={{ margin: '0 0 6px' }}>
                Skor {selected.risk_score}/100 menunjukkan nilai pada skala tampilan 0–100. Misalnya, skor 75/100 berarti nilai skornya 75 dari 100, bukan otomatis berarti peluang fraud sebesar 75%. Makna tingkat risikonya tetap mengikuti definisi skor dari API atau model yang digunakan.
              </p>
              <p style={{ margin: 0 }}>
                Langkah lanjutan di bawah ditentukan oleh label Classification (Fraud/Valid), bukan secara otomatis oleh ambang Risk Score. Gunakan skor sebagai indikator tambahan untuk pemeriksaan, bukan bukti tunggal fraud.
              </p>
            </section>

            <section
              className={`detail-followup ${selected.is_fraudulent ? 'followup-fraud' : 'followup-valid'}`}
              aria-labelledby="detail-followup-title"
            >
              <div className="followup-heading">
                <span className="followup-icon">
                  {selected.is_fraudulent ? <ShieldAlert size={19} /> : <ShieldCheck size={19} />}
                </span>
                <div>
                  <h4 id="detail-followup-title">Penjelasan Event</h4>
                  <span className="followup-status">
                    {selected.is_fraudulent ? 'Label dataset: Fraud' : 'Label dataset: Valid'}
                  </span>
                </div>
              </div>

              <p className="followup-description">
                {selected.is_fraudulent
                  ? 'Event ini memiliki label Fraud pada dataset. Label tersebut menjadi sinyal untuk pemeriksaan lebih lanjut, bukan bukti final bahwa aktivitas merupakan fraud.'
                  : 'Event ini memiliki label Valid pada dataset. Label tersebut menunjukkan klasifikasi yang tercatat, tetapi tetap perlu dibandingkan dengan konteks aktivitas jika ditemukan indikator yang tidak konsisten.'}
              </p>

              <h4 className="followup-subtitle">Langkah Lanjutan</h4>
              <ol className="followup-steps">
                {(selected.is_fraudulent
                  ? [
                      {
                        title: 'Periksa indikator risiko',
                        description: 'Tinjau risk score, frekuensi klik, durasi klik, serta indikator VPN dan proxy yang tercatat.'
                      },
                      {
                        title: 'Bandingkan aktivitas terkait',
                        description: 'Periksa event lain dari IP yang sama, waktu kejadian, perangkat, dan pola klik untuk mencari konteks tambahan.'
                      },
                      {
                        title: 'Verifikasi data',
                        description: 'Cocokkan catatan event dengan data sumber dan log backend yang tersedia. Jangan menyimpulkan fraud hanya dari satu indikator.'
                      },
                      {
                        title: 'Dokumentasikan hasil',
                        description: 'Catat indikator dan bukti yang ditemukan. Pertimbangkan tindakan pembatasan hanya setelah verifikasi sesuai prosedur keamanan.'
                      }
                    ]
                  : [
                      {
                        title: 'Cocokkan label dataset',
                        description: 'Pastikan label Valid dan nilai event sesuai dengan catatan sumber yang diterima.'
                      },
                      {
                        title: 'Tinjau indikator pendukung',
                        description: 'Periksa frekuensi klik, durasi, risk score, serta penggunaan VPN atau proxy jika datanya tersedia.'
                      },
                      {
                        title: 'Periksa ketidaksesuaian',
                        description: 'Jika ada indikator yang tidak sesuai dengan label Valid, bandingkan dengan event terkait dan log backend.'
                      },
                      {
                        title: 'Catat hasil pemeriksaan',
                        description: 'Dokumentasikan hasil verifikasi. Pertahankan klasifikasi sesuai bukti yang tersedia dan tinjau ulang jika diperlukan.'
                      }
                    ]
                ).map((step, index) => (
                  <li className="followup-step" key={step.title}>
                    <span className="followup-number">{index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="followup-note">
                <Info size={16} />
                <p>Langkah-langkah ini merupakan panduan pemeriksaan manual. Dashboard tidak otomatis memverifikasi fraud atau memblokir IP.</p>
              </div>
            </section>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
