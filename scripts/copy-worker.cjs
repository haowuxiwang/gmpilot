/**
 * Copy the embedding worker script to dist-electron/main/ so it ships inside
 * the packaged app (dist-electron/** is included by electron-builder).
 * Dev and packaged builds resolve it via path.join(__dirname, 'embed-worker.cjs').
 */

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'electron', 'embed-worker.cjs');
const destDir = path.join(__dirname, '..', 'dist-electron', 'main');
const dest = path.join(destDir, 'embed-worker.cjs');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`[copy-worker] ${src} -> ${dest}`);
