#!/usr/bin/env node
/**
 * Produces vendor/excalidraw-browser.iife.js — offline Excalidraw + mermaid helpers
 * for Playwright (no CDN). Re-run after bumping @excalidraw/* versions.
 */
import * as esbuild from "esbuild";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const dir = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  stdin: {
    contents: readFileSync(join(dir, "vendor-entry.mjs"), "utf-8"),
    resolveDir: dir,
    loader: "js",
    sourcefile: "vendor-entry.mjs",
  },
  outfile: join(dir, "vendor", "excalidraw-browser.iife.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  // Lucide / excalidraw use jsx-runtime from explicit paths; let esbuild resolve.
  jsx: "automatic",
});

console.log("Wrote vendor/excalidraw-browser.iife.js");
