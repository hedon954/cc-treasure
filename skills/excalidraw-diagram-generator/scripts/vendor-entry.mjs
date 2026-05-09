/**
 * Browser bundle entry — built into vendor/excalidraw-browser.iife.js
 * (run: node build-excalidraw-vendor.mjs)
 */
import { exportToBlob, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

window.__excalidrawVendor = {
  exportToBlob,
  convertToExcalidrawElements,
  parseMermaidToExcalidraw,
};

const statusEl = document.getElementById("status");
if (statusEl) statusEl.textContent = "ready";
