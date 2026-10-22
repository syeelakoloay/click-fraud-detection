"use strict";

function createCsvSyntaxError(message) {
  const error = new TypeError(`Format CSV tidak valid: ${message}`);
  error.status = 400;
  error.importCode = "INVALID_CSV";
  return error;
}

/**
 * Parses CSV records, including quoted commas, doubled quotes, and newlines
 * inside quoted fields. Blank physical lines are ignored. It intentionally
 * does not coerce values; validation/casting belongs to the Event model.
 */
function parseCsv(input) {
  if (typeof input !== "string") {
    throw new TypeError("Isi CSV harus berupa teks.");
  }

  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records = [];
  let row = [];
  let field = "";
  let insideQuotes = false;
  let quoteClosed = false;
  let rowHasSyntax = false;

  function pushField() {
    row.push(field);
    field = "";
    quoteClosed = false;
    rowHasSyntax = true;
  }

  function pushRecord() {
    if (row.length > 0 || field.length > 0 || rowHasSyntax || quoteClosed) {
      row.push(field);
      records.push(row);
    }
    row = [];
    field = "";
    quoteClosed = false;
    rowHasSyntax = false;
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (insideQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          insideQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += character;
      }
      rowHasSyntax = true;
      continue;
    }

    if (quoteClosed) {
      if (character === ",") {
        pushField();
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        pushRecord();
      } else {
        throw createCsvSyntaxError(
          "setelah tanda kutip penutup hanya boleh ada koma atau akhir baris."
        );
      }
      continue;
    }

    if (character === ",") {
      pushField();
      continue;
    }

    if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      pushRecord();
      continue;
    }

    if (character === '"') {
      if (field.length !== 0) {
        throw createCsvSyntaxError(
          "tanda kutip hanya boleh memulai field, bukan muncul di tengah nilai tanpa kutip."
        );
      }
      insideQuotes = true;
      rowHasSyntax = true;
      continue;
    }

    field += character;
    rowHasSyntax = true;
  }

  if (insideQuotes) {
    throw createCsvSyntaxError("field berisi tanda kutip yang tidak ditutup.");
  }

  if (row.length > 0 || field.length > 0 || rowHasSyntax || quoteClosed) {
    pushRecord();
  }

  return records;
}

module.exports = { parseCsv };
