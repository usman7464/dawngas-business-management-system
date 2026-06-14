const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  "server.js",
  "server/config/db.js",
  "services/storageService.js",
  "api/index.js",
  "public/app.js",
  "scripts/smoke-test.js",
  "scripts/migrate-local-mongodb-to-atlas.js",
  "scripts/migrate-local-files-to-blob.js",
  "scripts/audit-mongodb.js"
];

for (const file of files) {
  execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
}

for (const required of ["public/index.html", "public/styles.css", "public/app.js", "vercel.json"]) {
  if (!fs.existsSync(path.join(root, required))) {
    throw new Error(`${required} is missing.`);
  }
}

console.log("Build check passed.");
