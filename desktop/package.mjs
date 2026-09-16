import { build, Platform } from 'electron-builder';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { listPackage, extractFile } from '@electron/asar';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(
  await readFile(resolve(root, 'desktop/builder.json'), 'utf8'),
);
const electron = JSON.parse(
  await readFile(resolve(root, 'node_modules/electron/package.json'), 'utf8'),
);
process.env.ELECTRON_BUILDER_CACHE ??= resolve(root, '.cache/electron-builder');
process.env.electron_config_cache ??= resolve(root, '.cache/electron');

// All runtime dependencies are bundled. Do not collect the parent web project's modules.
const artifacts = await build({
  projectDir: resolve(root, 'desktop/out'),
  targets: Platform.WINDOWS.createTarget('nsis'),
  publish: 'never',
  config: {
    ...config,
    directories: { output: resolve(root, 'desktop/release') },
    electronDist: resolve(root, config.electronDist),
    electronVersion: electron.version,
  },
});

const archive = resolve(
  root,
  'desktop/release/win-unpacked/resources/app.asar',
);
const entries = listPackage(archive)
  .map((name) => name.replaceAll('\\', '/'))
  .sort();
const expected = [
  '/assets',
  ...(await readdir(resolve(root, 'desktop/out/assets'))).map((name) => {
    assert.match(name, /^contracts-[A-Za-z0-9_-]+\.js$/);
    return `/assets/${name}`;
  }),
  '/THIRD_PARTY_NOTICES.txt',
  '/runtime-dependencies.json',
  '/main.js',
  '/package.json',
  '/preload.cjs',
  '/ui',
  '/ui/app.js',
  '/ui/concost-logo-horizontal.png',
  '/ui/index.html',
  '/ui/instructions.js',
  '/ui/style.css',
  '/worker.js',
].sort();
assert.deepEqual(entries, expected, 'Unexpected files in desktop app package');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = expected
  .filter((name) => name !== '/ui' && name !== '/assets')
  .map((name) => {
    const bytes = extractFile(archive, name.slice(1));
    return { name, bytes: bytes.length, sha256: hash(bytes) };
  });
const installers = [];
for (const path of artifacts.filter((path) => path.endsWith('.exe'))) {
  const bytes = await readFile(path);
  installers.push({
    name: path.split(/[\\/]/).at(-1),
    bytes: bytes.length,
    sha256: hash(bytes),
  });
}
assert.equal(installers.length, 1, 'Expected one internal preview installer');
const runtimeNotices = [];
for (const name of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) {
  const bytes = await readFile(
    resolve(root, 'desktop/release/win-unpacked', name),
  );
  assert.ok(bytes.length, `Missing Electron runtime notice: ${name}`);
  runtimeNotices.push({ name, bytes: bytes.length, sha256: hash(bytes) });
}
await writeFile(
  resolve(root, 'desktop/release/package-manifest.json'),
  JSON.stringify(
    {
      channel: 'unsigned-internal-preview',
      automaticUpdates: false,
      electron: electron.version,
      runtimeNotices,
      files,
      installers,
    },
    null,
    2,
  ),
);
console.log('Package allowlist and SHA-256 verified:', installers[0].name);
