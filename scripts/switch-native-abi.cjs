/**
 * Switch better-sqlite3 native module ABI between Node and Electron.
 *
 * better-sqlite3 compiles native addons against ONE V8 ABI.
 * - Vitest (dev tests) runs under Node.js  -> requires ABI 127 (node-v127)
 * - Packaged app runs under Electron 42    -> requires ABI 146 (electron-v146)
 *
 * This script downloads the matching prebuilt binary via prebuild-install.
 * Usage:
 *   node scripts/switch-native-abi.cjs --to node
 *   node scripts/switch-native-abi.cjs --to electron
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const https = require('https');
const http = require('http');

const PROJECT_ROOT = path.join(__dirname, '..');
const BETTER_DIR = path.join(PROJECT_ROOT, 'node_modules', 'better-sqlite3');
const NODE_FILE = path.join(BETTER_DIR, 'build', 'Release', 'better_sqlite3.node');
const ELECTRON_VERSION = (() => {
  try {
    return require(path.join(PROJECT_ROOT, 'package.json')).devDependencies.electron;
  } catch {
    return '42.0.1';
  }
})();

function getTargetAbi() {
  const arg = process.argv[process.argv.indexOf('--to') + 1];
  if (arg === 'electron') return 'electron';
  if (arg === 'node') return 'node';
  console.error('Usage: node scripts/switch-native-abi.cjs --to <node|electron>');
  process.exit(1);
}

function detectCurrentAbi() {
  if (!fs.existsSync(NODE_FILE)) return 'none';
  // Read the binary and scan for the NODE_MODULE_VERSION value.
  // For better-sqlite3, the ABI version (uint16 LE) appears at a known offset.
  // Electron 42 = ABI 146 (0x92); Node 22 = ABI 127 (0x7F).
  const buf = fs.readFileSync(NODE_FILE);
  for (let i = 0; i < Math.min(8192, buf.length); i += 2) {
    const val = buf.readUInt16LE(i);
    if (val === 146) return 'electron';
    if (val === 127) return 'node';
  }
  // Fallback: try require test
  for (const key of Object.keys(require.cache)) {
    if (key.includes('better_sqlite3.node')) delete require.cache[key];
  }
  try {
    require(NODE_FILE);
    return 'node';
  } catch {
    return 'electron';
  }
}

function runPrebuildInstall(runtime, target) {
  console.log(`[native-abi] switching to ${runtime} (target ${target})...`);
  const bin = require.resolve('prebuild-install/bin.js', { paths: [BETTER_DIR] });
  const args = [
    bin,
    '--runtime=' + runtime,
    '--target=' + target,
    '--arch=x64',
    '--platform=win32',
    '--verbose',
  ];

  // GitHub releases sometimes resets connections from China networks;
  // npmmirror may have stale/wrong binaries (electron-v146 prebuild has wrong ABI).
  // Try GitHub first, then GitHub proxy, then node-gyp as last resort.
  const attempts = [
    { label: 'github', env: {} },
  ];

  // Only try npmmirror for node runtime (electron prebuilds on npmmirror are corrupted)
  if (runtime === 'node') {
    attempts.push({
      label: 'npmmirror',
      env: {
        npm_config_better_sqlite3_binary_host_mirror:
          'https://registry.npmmirror.com/-/binary/better-sqlite3',
      },
    });
  }

  for (const attempt of attempts) {
    console.log(`[native-abi] download via ${attempt.label}`);
    const result = spawnSync(process.execPath, args, {
      cwd: BETTER_DIR,
      encoding: 'utf8',
      env: { ...process.env, ...attempt.env },
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status === 0) {
      // Verify the downloaded binary has the correct ABI
      const after = detectCurrentAbi();
      if (after === runtime) {
        console.log('[native-abi] done.');
        return;
      }
      console.warn(`[native-abi] prebuild-install succeeded but ABI mismatch (got ${after}, expected ${runtime}). Binary may be corrupted.`);
    }
    // Retry with mirror when the primary source fails
  }

  // prebuild-install failed or produced wrong ABI — try GitHub proxy download
  console.log('[native-abi] prebuild-install failed, trying GitHub proxy...');
  const pkg = require(path.join(BETTER_DIR, 'package.json'));
  const filename = `better-sqlite3-v${pkg.version}-${runtime}-v${target === process.versions.node ? '127' : '146'}-win32-x64.tar.gz`;
  const ghProxyUrl = `https://ghfast.top/https://github.com/WiseLibs/better-sqlite3/releases/download/v${pkg.version}/${filename}`;

  if (downloadAndExtractPrebuild(ghProxyUrl)) {
    const after = detectCurrentAbi();
    if (after === runtime) {
      console.log('[native-abi] done via GitHub proxy.');
      return;
    }
  }

  // Last resort: compile from source with node-gyp
  console.log('[native-abi] all download sources failed, falling back to node-gyp rebuild...');
  runNodeGypRebuild(runtime, target);
}

function downloadAndExtractPrebuild(url) {
  const tmpDir = path.join(require('os').tmpdir(), 'native-abi-download-' + Date.now());
  const tmpFile = path.join(tmpDir, 'prebuild.tar.gz');
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    console.log(`[native-abi] downloading from ${url}`);
    // Use spawnSync with curl (available on Windows 10+)
    const result = spawnSync('curl', ['-L', '-o', tmpFile, '--connect-timeout', '15', '--max-time', '60', url], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status !== 0 || !fs.existsSync(tmpFile)) {
      console.warn('[native-abi] curl download failed:', result.stderr || 'file not created');
      return false;
    }
    // Extract with tar
    const extract = spawnSync('tar', ['-xzf', tmpFile, '-C', tmpDir], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (extract.status !== 0) {
      console.warn('[native-abi] tar extract failed:', extract.stderr);
      return false;
    }
    // Find the .node file and copy to build/Release
    const found = findFile(tmpDir, '.node');
    if (!found) {
      console.warn('[native-abi] no .node file found in archive');
      return false;
    }
    const destDir = path.join(BETTER_DIR, 'build', 'Release');
    fs.mkdirSync(destDir, { recursive: true });
    // Remove old .node file (try rename to backup, fall back to delete)
    if (fs.existsSync(NODE_FILE)) {
      const backup = NODE_FILE + '.bak.' + Date.now();
      try {
        fs.renameSync(NODE_FILE, backup);
      } catch {
        try { fs.unlinkSync(NODE_FILE); } catch {}
      }
    }
    fs.copyFileSync(found, NODE_FILE);
    console.log(`[native-abi] installed ${path.basename(found)} -> ${NODE_FILE}`);
    // Clear require cache so detectCurrentAbi() reads the fresh binary
    for (const key of Object.keys(require.cache)) {
      if (key.includes('better_sqlite3.node')) delete require.cache[key];
    }
    return true;
  } catch (err) {
    console.warn('[native-abi] download error:', err.message);
    return false;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function findFile(dir, ext) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, ext);
      if (found) return found;
    } else if (entry.name.endsWith(ext)) {
      return full;
    }
  }
  return null;
}

function runNodeGypRebuild(runtime, target) {
  const nodeGypBin = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'node-gyp');
  const nodeGypCmd = process.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp';
  const nodeGyp = fs.existsSync(nodeGypBin) ? nodeGypBin : nodeGypCmd;

  const args = [
    'rebuild',
    '--release',
    '--runtime=' + runtime,
    '--target=' + target,
    '--arch=x64',
    '--dist-url=https://electronjs.org/headers',
  ];

  console.log(`[native-abi] node-gyp rebuild (runtime=${runtime}, target=${target})`);
  const result = spawnSync(nodeGyp, args, {
    cwd: BETTER_DIR,
    encoding: 'utf8',
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_runtime: runtime,
      npm_config_target: target,
    },
  });

  if (result.status !== 0) {
    console.error('[native-abi] node-gyp rebuild failed.');
    process.exit(1);
  }
  console.log('[native-abi] node-gyp rebuild done.');
}

function releaseLockedFile() {
  // Windows Defender / lingering handles can briefly lock the .node file.
  // Rename it away so prebuild-install can write a fresh copy.
  const backup = NODE_FILE + '.prev';
  try {
    if (fs.existsSync(NODE_FILE)) {
      if (fs.existsSync(backup)) fs.unlinkSync(backup);
      fs.renameSync(NODE_FILE, backup);
      console.log('[native-abi] renamed existing binary aside (lock release)');
    }
  } catch (err) {
    console.warn('[native-abi] could not rename locked binary:', err.message);
  }
}

function main() {
  const target = getTargetAbi();
  const current = detectCurrentAbi();

  if (current === target) {
    console.log(`[native-abi] already ${target} (${NODE_FILE}), skipping download.`);
    return;
  }

  releaseLockedFile();

  if (target === 'electron') {
    runPrebuildInstall('electron', ELECTRON_VERSION);
  } else {
    // Node runtime: target the running Node version so prebuild-install
    // downloads node-v<ABI> matching this install of Node.
    runPrebuildInstall('node', process.versions.node);
  }

  const after = detectCurrentAbi();
  if (after !== target) {
    console.error(`[native-abi] verification failed: expected ${target}, got ${after}`);
    process.exit(1);
  }
  console.log(`[native-abi] verified: ${NODE_FILE} => ${after}`);
}

main();