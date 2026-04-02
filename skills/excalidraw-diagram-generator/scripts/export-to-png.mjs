#!/usr/bin/env node
/**
 * Export Excalidraw files to PNG using Excalidraw's native renderer.
 *
 * Uses Playwright to load @excalidraw/excalidraw from esm.sh CDN
 * (which bundles all deps), then calls exportToBlob() for pixel-perfect
 * output identical to Excalidraw's own "Copy as PNG".
 *
 * Usage:
 *   node export-to-png.mjs input.excalidraw [output.png] [--scale 2]
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { resolve, basename } from "path";
import { parseArgs } from "util";

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
// HTML page using esm.sh for zero-config dependency resolution
// ---------------------------------------------------------------------------
const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<div id="status">loading</div>
<script type="module">
try {
  document.getElementById("status").textContent = "importing";

  // esm.sh bundles all transitive dependencies (react, jotai, etc.)
  const { exportToBlob } = await import(
    "https://esm.sh/@excalidraw/excalidraw?bundle-deps"
  );

  document.getElementById("status").textContent = "exporting";

  // Decode Base64 as UTF-8 bytes; plain atob() corrupts non-Latin-1 text.
  const raw = document.getElementById("excalidraw-data").textContent;
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const data = JSON.parse(new TextDecoder("utf-8").decode(bytes));
  const scale = ${scale};

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
      width: w * scale,
      height: h * scale,
      scale: scale,
    }),
  });

  const reader = new FileReader();
  reader.onloadend = () => {
    window.__EXPORT_RESULT__ = reader.result;
    document.getElementById("status").textContent = "done";
  };
  reader.readAsDataURL(blob);
} catch (e) {
  document.getElementById("status").textContent = "error:" + e.message;
  console.error("Export error:", e);
}
</script>
<script type="text/plain" id="excalidraw-data">__DATA_BASE64__</script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Launch headless browser
// ---------------------------------------------------------------------------
console.log(`Exporting ${basename(inputPath)} → PNG (${scale}x)...`);

const browser = await chromium.launch();
const page = await browser.newPage();

// Capture console for debugging
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("BROWSER:", msg.text());
});

// Inject HTML with data embedded as Base64 (avoids HTML injection from JSON content)
const base64Data = Buffer.from(excalidrawRaw).toString("base64");
const fullHtml = html.replace("__DATA_BASE64__", base64Data);

await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });

// Wait for export (up to 60s — first run needs to download from esm.sh CDN)
try {
  await page.waitForFunction(() => window.__EXPORT_RESULT__, {
    timeout: 60000,
  });
} catch {
  const status = await page.textContent("#status");
  console.error(`Export timed out. Status: ${status}`);
  await browser.close();
  process.exit(1);
}

// Save PNG
const dataUrl = await page.evaluate(() => window.__EXPORT_RESULT__);
if (!dataUrl || !dataUrl.includes(",")) {
  console.error("Export failed: no valid data URL returned");
  await browser.close();
  process.exit(1);
}
const base64Png = dataUrl.split(",")[1];
writeFileSync(outputPath, Buffer.from(base64Png, "base64"));

await browser.close();
console.log(`Done: ${outputPath}`);
