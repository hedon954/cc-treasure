#!/usr/bin/env node
/**
 * Convert mermaid blocks to excalidraw JSON using Playwright browser context,
 * then export to PNG using Excalidraw's native renderer.
 *
 * Uses offline vendor bundle (./vendor/excalidraw-browser.iife.js) — no CDN.
 *
 * Usage: node convert-browser.mjs <input.md> <output-dir>
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const [inputFile, outputDir] = process.argv.slice(2);
if (!inputFile || !outputDir) {
  console.error("Usage: node convert-browser.mjs <input.md> <output-dir>");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const hostUrl = pathToFileURL(join(__dirname, "export-host.html")).href;

mkdirSync(outputDir, { recursive: true });

// Extract mermaid blocks
const content = readFileSync(inputFile, "utf-8");
const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
const blocks = [];
let m;
while ((m = mermaidRegex.exec(content)) !== null) {
  blocks.push(m[1].trim());
}
console.log(`Found ${blocks.length} mermaid blocks`);

// Heuristic: rectangles larger than this are treated as subgraph containers
const AREA_THRESHOLD = 50000;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("BROWSER:", msg.text());
  });

  await page.goto(hostUrl, { waitUntil: "domcontentloaded" });

  try {
    await page.waitForFunction(
      () =>
        window.__excalidrawVendor &&
        typeof window.__excalidrawVendor.parseMermaidToExcalidraw === "function" &&
        typeof window.__excalidrawVendor.exportToBlob === "function",
      { timeout: 120000 }
    );
  } catch {
    const status = await page.textContent("#status");
    console.error(
      `Timed out loading Excalidraw vendor. Status: ${status}\n` +
        `Ensure vendor/excalidraw-browser.iife.js exists (run: npm run build:vendor).`
    );
    process.exit(1);
  }

  await page.evaluate(() => {
    window.convertMermaid = async function (mermaidCode) {
      try {
        const { parseMermaidToExcalidraw, convertToExcalidrawElements } =
          window.__excalidrawVendor;
        const result = await parseMermaidToExcalidraw(mermaidCode, {
          fontSize: 16,
        });
        // Clean <br> tags and literal \\n in labels before conversion
        for (const el of result.elements) {
          if (el.label && el.label.text) {
            el.label.text = el.label.text.replace(/<br\s*\/?>/gi, "\n");
            el.label.text = el.label.text.replace(/\\n/g, "\n");
          }
          if (el.text) {
            el.text = el.text.replace(/<br\s*\/?>/gi, "\n");
            el.text = el.text.replace(/\\n/g, "\n");
          }
        }
        const elements = convertToExcalidrawElements(result.elements);
        return { ok: true, elements, files: result.files || {} };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    };

    window.exportToPng = async function (excalidrawData, scale) {
      try {
        const { exportToBlob } = window.__excalidrawVendor;
        const blob = await exportToBlob({
          elements: excalidrawData.elements || [],
          appState: {
            exportBackground: true,
            exportWithDarkMode: false,
            viewBackgroundColor: "#ffffff",
          },
          files: excalidrawData.files || {},
          exportPadding: 20,
          getDimensions: (w, h) => ({
            width: w * scale,
            height: h * scale,
            scale,
          }),
        });
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve({ ok: true, dataUrl: reader.result });
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    };
  });

  await page.waitForFunction(
    () => typeof window.convertMermaid === "function",
    { timeout: 5000 }
  );

  console.log("Browser ready, converting...");

  const results = [];
  for (let i = 0; i < blocks.length; i++) {
    const idx = i + 1;
    const filename = `mermaid-${String(idx).padStart(2, "0")}`;

    // Step 1: Convert mermaid to excalidraw
    const convertResult = await page.evaluate(async (code) => {
      return await window.convertMermaid(code);
    }, blocks[i]);

    if (!convertResult.ok) {
      console.error(`✗ Block ${idx} convert failed: ${convertResult.error}`);
      results.push({
        index: idx,
        filename,
        status: "convert_error",
        error: convertResult.error,
      });
      continue;
    }

    // Post-process: inject semantic color scheme based on element role
    // Uses Excalidraw Open Colors palette for native compatibility
    const styledElements = convertResult.elements.map((el) => {
      if (el.type === "rectangle" || el.type === "ellipse") {
        const area = (el.width || 0) * (el.height || 0);
        if (area > AREA_THRESHOLD) {
          // Container / subgraph — recede into background
          return {
            ...el,
            strokeColor: "#adb5bd",
            backgroundColor: "#f1f3f5",
            fillStyle: "solid",
            strokeWidth: 1,
            roughness: 0,
            roundness: { type: 3 },
          };
        }
        // Regular node — primary blue-indigo
        return {
          ...el,
          strokeColor: "#4263eb",
          backgroundColor: "#dbe4ff",
          fillStyle: "solid",
          strokeWidth: 1,
          roughness: 0,
          roundness: { type: 3 },
        };
      }
      if (el.type === "diamond") {
        // Decision node — warm amber/orange
        return {
          ...el,
          strokeColor: "#e8590c",
          backgroundColor: "#fff3bf",
          fillStyle: "solid",
          strokeWidth: 1,
          roughness: 0,
        };
      }
      if (el.type === "arrow" || el.type === "line") {
        return {
          ...el,
          strokeColor: "#495057",
          strokeWidth: 1,
          roughness: 0,
          roundness: { type: 2 },
        };
      }
      if (el.type === "text") {
        return {
          ...el,
          strokeColor: "#343a40",
          roughness: 0,
        };
      }
      return { ...el, roughness: 0 };
    });

    const excalidrawData = {
      type: "excalidraw",
      version: 2,
      source: "mermaid-to-excalidraw",
      elements: styledElements,
      appState: { viewBackgroundColor: "#ffffff", gridSize: null },
      files: convertResult.files,
    };

    // Save excalidraw JSON
    const excalidrawPath = resolve(outputDir, `${filename}.excalidraw`);
    writeFileSync(excalidrawPath, JSON.stringify(excalidrawData, null, 2));

    // Step 2: Export to PNG
    const pngResult = await page.evaluate(async (data) => {
      return await window.exportToPng(data, 2);
    }, excalidrawData);

    if (!pngResult.ok) {
      console.error(`✗ Block ${idx} export failed: ${pngResult.error}`);
      results.push({
        index: idx,
        filename,
        status: "export_error",
        error: pngResult.error,
      });
      continue;
    }

    const pngPath = resolve(outputDir, `${filename}.png`);
    const base64Png = pngResult.dataUrl.split(",")[1];
    writeFileSync(pngPath, Buffer.from(base64Png, "base64"));

    console.log(`✓ Block ${idx} → ${filename}.png`);
    results.push({ index: idx, filename, status: "ok", pngPath });
  }

  const okCount = results.filter((r) => r.status === "ok").length;
  console.log(`\nDone: ${okCount}/${blocks.length} succeeded`);
  writeFileSync(
    resolve(outputDir, "results.json"),
    JSON.stringify(results, null, 2)
  );
} finally {
  await browser.close();
}
