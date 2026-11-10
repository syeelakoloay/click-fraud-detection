const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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

export function parseTrafficDate(row) {
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

function readNumericField(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') {
      const value = Number(row[key]);
      if (Number.isFinite(value)) return Math.max(0, value);
    }
  }
  return undefined;
}

export function normalizeTrafficRows(rows) {
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

export function periodConfig(period) {
  if (period === 'hour') return { count: 24, interval: 'hour', label: 'Per jam' };
  if (period === 'day') return { count: null, interval: 'day', label: 'Per hari' };
  if (period === 'week') return { count: null, interval: 'day', label: 'Per minggu' };
  if (period === 'month') return { count: null, interval: 'day', label: 'Per bulan' };
  return { count: null, interval: 'day', label: 'Per tahun' };
}

export function startOfHour(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfWeek(date) {
  const result = startOfDay(date);
  // Calendar week starts on Monday (Indonesia/local calendar convention).
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

export function dayOrdinal(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

export function hourLabel(date) {
  return `${String(date.getHours()).padStart(2, '0')}:00`;
}

export function dayLabel(date) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function monthLabel(date) {
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(date);
}

export function validDatedRows(rows) {
  return rows.filter(row => row?.date instanceof Date && !Number.isNaN(row.date.getTime()));
}

export function dateExtent(rows, now = new Date()) {
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
 * Build timeline buckets from the actual data extent. The hourly view includes
 * every hour from the first timestamp to the last timestamp; an empty API response
 * retains a 24-hour zero-data axis for a useful empty state.
 */
export function createTimeline(period, rows = [], now = new Date()) {
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
  const { first, last, datedRows } = dateExtent(rows, now);

  if (period === 'hour') {
    if (datedRows.length) {
      // Show every hour between the earliest and latest actual API timestamps.
      const cursor = startOfHour(first);
      const end = startOfHour(last);
      while (cursor <= end) {
        pushBucket(cursor, hourLabel(cursor));
        cursor.setHours(cursor.getHours() + 1);
      }
    } else {
      // Preserve a useful empty-state axis when the API has no dated rows.
      const anchor = startOfHour(now);
      for (let offset = 23; offset >= 0; offset -= 1) {
        const date = new Date(anchor);
        date.setHours(date.getHours() - offset);
        pushBucket(date, hourLabel(date));
      }
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

export function getBucketIndex(eventDate, timeline, period) {
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

export function aggregateRowsIntoTimeline(rows, period, now = new Date()) {
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

export function bucketsFromApi(rows, period, now = new Date()) {
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

export function bucketsFromEvents(events, period, now = new Date()) {
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

export function extractTrafficRows(payload) {
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

export function apiRange(period, now) {
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

