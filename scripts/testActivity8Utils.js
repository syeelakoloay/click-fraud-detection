"use strict";

const assert = require("node:assert/strict");
const {
  assertNonEmptyString,
  normalizePagination,
  parseDate,
  buildTimestampFilter,
  normalizeBinaryLabel,
} = require("../src/services/serviceUtils");

assert.equal(assertNonEmptyString("  click-1  ", "clickId"), "click-1");
assert.throws(() => assertNonEmptyString("  ", "clickId"), /tidak kosong/);

assert.deepEqual(normalizePagination({ page: 2, limit: 25 }), {
  page: 2,
  limit: 25,
  skip: 25,
});
assert.deepEqual(normalizePagination({ page: 1, limit: 500 }), {
  page: 1,
  limit: 100,
  skip: 0,
});
assert.throws(() => normalizePagination({ page: 0 }), /minimal 1/);

const date = parseDate("2026-01-01T00:00:00.000Z", "startDate");
assert.equal(date.toISOString(), "2026-01-01T00:00:00.000Z");
assert.throws(() => parseDate("bukan-tanggal", "startDate"), /tanggal yang valid/);
assert.throws(
  () => buildTimestampFilter({ startDate: "2026-02-01", endDate: "2026-01-01" }),
  /startDate tidak boleh lebih besar/
);
assert.deepEqual(buildTimestampFilter({}), {});
assert.equal(normalizeBinaryLabel(0), 0);
assert.equal(normalizeBinaryLabel("1"), 1);
assert.equal(normalizeBinaryLabel(undefined), undefined);
assert.throws(() => normalizeBinaryLabel(2), /0 atau 1/);

console.log("PENGUJIAN UNIT UTILITAS AKTIVITAS 8 LULUS (13 assertion checks).");
