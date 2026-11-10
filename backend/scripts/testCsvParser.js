"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv } = require("../src/utils/csvParser");

test("parseCsv parses comma-separated fields and CRLF records", () => {
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n3,4\r\n"), [
    ["a", "b"],
    ["1", "2"],
    ["3", "4"],
  ]);
});

test("parseCsv supports quoted commas, escaped quotes, and embedded newlines", () => {
  assert.deepEqual(parseCsv('name,note\n"Doe, Jane","said ""hello"""\n"line 1\nline 2",ok'), [
    ["name", "note"],
    ["Doe, Jane", 'said "hello"'],
    ["line 1\nline 2", "ok"],
  ]);
});

test("parseCsv removes UTF-8 BOM and ignores blank physical lines", () => {
  assert.deepEqual(parseCsv("\uFEFFa,b\n\n1,2\n\n"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("parseCsv rejects an unclosed quote", () => {
  assert.throws(() => parseCsv('a,b\n1,"not closed'), {
    name: "TypeError",
    status: 400,
    importCode: "INVALID_CSV",
  });
});

test("parseCsv rejects quotes in unquoted fields", () => {
  assert.throws(() => parseCsv('a,b\nva"lue,2'), /tanda kutip hanya boleh memulai field/);
});

test("parseCsv rejects text after a closing quote", () => {
  assert.throws(() => parseCsv('a,b\n"value"x,2'), /setelah tanda kutip penutup/);
});
