

import { test } from "node:test";
import assert from "node:assert/strict";


function groupTrafficByPeriod(events, interval) {
  const supportedIntervals = ["hour", "day", "week", "month", "year"];

  if (!supportedIntervals.includes(interval)) {
    throw new Error(`Interval tidak didukung: ${interval}`);
  }

  const groups = new Map();

  for (const event of events) {
    const date = new Date(event.timestamp);

    if (Number.isNaN(date.getTime())) continue;

    let key;

    if (interval === "hour") {
      key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
    } else if (interval === "day") {
      key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    } else if (interval === "week") {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      key = start.toISOString().slice(0, 10);
    } else if (interval === "month") {
      key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    } else if (interval === "year") {
      key = String(date.getFullYear());
    } else {
      throw new Error(`Interval tidak didukung: ${interval}`);
    }

    groups.set(key, (groups.get(key) || 0) + 1);
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

test("mengelompokkan traffic per jam", () => {
  const events = [
    { timestamp: "2025-01-01T10:10:00" },
    { timestamp: "2025-01-01T10:40:00" },
    { timestamp: "2025-01-01T11:10:00" }
  ];

  assert.deepEqual(groupTrafficByPeriod(events, "hour").map(x => x[1]), [2, 1]);
});

test("mengelompokkan traffic per hari", () => {
  const events = [
    { timestamp: "2025-01-01T10:00:00" },
    { timestamp: "2025-01-01T12:00:00" },
    { timestamp: "2025-01-02T10:00:00" }
  ];

  assert.deepEqual(groupTrafficByPeriod(events, "day").map(x => x[1]), [2, 1]);
});

test("mengelompokkan traffic per minggu", () => {
  const events = [
    { timestamp: "2025-01-06T10:00:00" },
    { timestamp: "2025-01-07T10:00:00" }
  ];

  assert.equal(groupTrafficByPeriod(events, "week").length, 1);
});

test("mengelompokkan traffic per bulan", () => {
  const events = [
    { timestamp: "2025-01-01T10:00:00" },
    { timestamp: "2025-02-01T10:00:00" }
  ];

  assert.equal(groupTrafficByPeriod(events, "month").length, 2);
});

test("mengelompokkan traffic per tahun", () => {
  const events = [
    { timestamp: "2024-01-01T10:00:00" },
    { timestamp: "2025-01-01T10:00:00" }
  ];

  assert.equal(groupTrafficByPeriod(events, "year").length, 2);
});

test("menghasilkan hasil kosong jika tidak ada event", () => {
  assert.deepEqual(groupTrafficByPeriod([], "day"), []);
});

test("melewati timestamp yang tidak valid", () => {
  assert.deepEqual(
    groupTrafficByPeriod([{ timestamp: "bukan-tanggal" }], "day"),
    []
  );
});

test("menolak interval yang tidak didukung", () => {
  assert.throws(
    () => groupTrafficByPeriod([], "minute"),
    /Interval tidak didukung/
  );
});

test("menghitung seluruh event dalam kelompok", () => {
  const events = [
    { timestamp: "2025-03-01T08:00:00" },
    { timestamp: "2025-03-01T09:00:00" },
    { timestamp: "2025-03-01T10:00:00" }
  ];

  const result = groupTrafficByPeriod(events, "day");
  assert.equal(result.reduce((total, item) => total + item[1], 0), 3);
});

test("mengurutkan kelompok berdasarkan waktu", () => {
  const events = [
    { timestamp: "2025-01-03T10:00:00" },
    { timestamp: "2025-01-01T10:00:00" },
    { timestamp: "2025-01-02T10:00:00" }
  ];

  const result = groupTrafficByPeriod(events, "day");
  assert.deepEqual(result.map(item => item[1]), [1, 1, 1]);
  assert.deepEqual(
    result.map(item => item[0]),
    ["2025-0-1", "2025-0-2", "2025-0-3"]
  );
});
