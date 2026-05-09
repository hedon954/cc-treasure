#!/usr/bin/env node
/**
 * Export Excalidraw files to PNG using Excalidraw's native renderer.
 *
 * Loads the bundled Excalidraw runtime from ./vendor/ (offline — no CDN).
 * Calls exportToBlob() for pixel-perfect output identical to Excalidraw's
 * own "Copy as PNG".
 *
 * Usage:
 *   node export-to-png.mjs input.excalidraw [output.png] [--scale 2]
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { resolve, basename, dirname, join } from "path";
import { parseArgs } from "util";
import { fileURLToPath, pathToFileURL } from "url";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    scale: { type: "string", default: "2" },
    "no-scale": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help || positionals.length === 0) {
  console.log(
    `Usage: node export-to-png.mjs <input.excalidraw> [output.png] [--scale N] [--no-scale]`
  );
  process.exit(0);
}

const inputPath = resolve(positionals[0]);
const scale = values["no-scale"] ? 1 : parseInt(values.scale, 10);
if (Number.isNaN(scale) || scale < 1) {
  console.error(`Invalid scale value: ${values.scale}`);
  process.exit(1);
}
const outputPath = positionals[1]
  ? resolve(positionals[1])
  : inputPath.replace(/\.excalidraw$/, ".png");

const __dirname = dirname(fileURLToPath(import.meta.url));
const hostUrl = pathToFileURL(join(__dirname, "export-host.html")).href;

// ---------------------------------------------------------------------------
// Read & validate
// ---------------------------------------------------------------------------
let excalidrawRaw;
try {
  excalidrawRaw = readFileSync(inputPath, "utf-8");
  JSON.parse(excalidrawRaw); // validate JSON
} catch (e) {
  console.error(`Error reading ${inputPath}: ${e.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Launch headless browser (local vendor bundle — no network)
// ---------------------------------------------------------------------------
console.log(`Exporting ${basename(inputPath)} → PNG (${scale}x)...`);

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") console.error("BROWSER:", msg.text());
});

await page.goto(hostUrl, { waitUntil: "domcontentloaded" });

try {
  await page.waitForFunction(
    () =>
      window.__excalidrawVendor &&
      typeof window.__excalidrawVendor.exportToBlob === "function",
    { timeout: 60000 }
  );
} catch {
  const status = await page.textContent("#status");
  console.error(
    `Timed out waiting for Excalidraw vendor bundle. Status: ${status}\n` +
      `Ensure vendor/excalidraw-browser.iife.js exists (run: npm run build:vendor).`
  );
  await browser.close();
  process.exit(1);
}

let dataUrl;
try {
  dataUrl = await page.evaluate(
    async ({ raw, scale: s }) => {
      const { exportToBlob } = window.__excalidrawVendor;
      const data = JSON.parse(raw);
      const blob = await exportToBlob({
        elements: data.elements || [],
        appState: {
          ...(data.appState || {}),
          exportBackground: true,
          exportWithDarkMode: false,
          viewBackgroundColor:
            (data.appState && data.appState.viewBackgroundColor) || "#ffffff",
        },
        files: data.files || {},
        exportPadding: 20,
        getDimensions: (w, h) => ({
          width: w * s,
          height: h * s,
          scale: s,
        }),
      });
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    },
    { raw: excalidrawRaw, scale }
  );
} catch (e) {
  const status = await page.textContent("#status");
  console.error(`Export failed: ${e.message}. Status: ${status}`);
  await browser.close();
  process.exit(1);
}

if (!dataUrl || !String(dataUrl).includes(",")) {
  console.error("Export failed: no valid data URL returned");
  await browser.close();
  process.exit(1);
}

const base64Png = String(dataUrl).split(",")[1];
writeFileSync(outputPath, Buffer.from(base64Png, "base64"));

await browser.close();
console.log(`Done: ${outputPath}`);
