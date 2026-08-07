#!/usr/bin/env node
/**
 * Ensure npm pack includes files required for ClawHub / OpenClaw install.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const pkg = JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(pluginRoot, "openclaw.plugin.json"), "utf8"));
if (manifest.version && manifest.version !== pkg.version) {
  console.error(
    `[verify-pack] openclaw.plugin.json version (${manifest.version}) must match package.json (${pkg.version})`
  );
  process.exit(1);
}

const pack = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts"], {
  cwd: pluginRoot,
  encoding: "utf8"
});
if (pack.status !== 0) {
  console.error(pack.stderr || pack.stdout);
  process.exit(pack.status ?? 1);
}

const output = `${pack.stdout}\n${pack.stderr}`;
const required = [
  "dist/index.js",
  "openclaw.plugin.json",
  "package.json",
  "README.md",
  "LICENSE"
];
const forbidden = ["tests/", "src/"];

for (const entry of required) {
  if (!output.includes(entry)) {
    console.error(`[verify-pack] missing from npm pack: ${entry}`);
    console.error("Add required paths to package.json files.");
    process.exit(1);
  }
}

for (const entry of forbidden) {
  if (output.includes(entry)) {
    console.error(`[verify-pack] forbidden path in npm pack: ${entry}`);
    process.exit(1);
  }
}

/** Patterns that ClawHub static analysis flags on published dist/ files. */
const clawhubScanPatterns = [
  { name: "insecure TLS skip", re: /rejectUnauthorized\s*:\s*false/ },
  { name: "privateKey string literal", re: /privateKey\s*:\s*["'`]/ },
];

function walkJsFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkJsFiles(full, files);
    else if (entry.endsWith(".js") && !entry.endsWith(".js.map")) files.push(full);
  }
  return files;
}

const distDir = join(pluginRoot, "dist");
for (const file of walkJsFiles(distDir)) {
  const text = readFileSync(file, "utf8");
  for (const { name, re } of clawhubScanPatterns) {
    if (re.test(text)) {
      console.error(
        `[verify-pack] ClawHub scan hazard (${name}) in ${relative(pluginRoot, file)}`
      );
      process.exit(1);
    }
  }
}

console.log("[verify-pack] OK — publish tarball includes required plugin files");
