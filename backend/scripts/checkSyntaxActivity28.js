"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const directories = ["src", "scripts", "tests"];
const files = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }
}

for (const directory of directories) collect(path.join(root, directory));
let failures = 0;
for (const file of files) {
  try {
    new vm.Script(fs.readFileSync(file, "utf8"), { filename: path.relative(root, file) });
  } catch (error) {
    failures += 1;
    process.stderr.write(`FAIL ${path.relative(root, file)}: ${error.message}\n`);
  }
}

if (failures) {
  process.stderr.write(`\n${files.length - failures}/${files.length} file JavaScript lulus pemeriksaan sintaks.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${files.length}/${files.length} file JavaScript lulus pemeriksaan sintaks.\n`);
}
