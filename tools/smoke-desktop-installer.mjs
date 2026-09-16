// Inspect the actual NSIS payload without installing or modifying the registry.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { extractFile } from '@electron/asar';
import { _electron } from 'playwright';

const installer = resolve(
  process.argv[2] ??
    'desktop/release/CONCOST-QC-Internal-Preview-Setup-0.1.2.exe',
);
const evidenceRoot = resolve('output/playwright');
await mkdir(evidenceRoot, { recursive: true });
const output = await mkdtemp(join(evidenceRoot, 'desktop-installer-'));
const sevenZip = resolve('node_modules/electron-winstaller/vendor/7z.exe');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const evidence = {
  installer: basename(installer),
  sha256: hash(await readFile(installer)),
  installed: false,
  registryChangedByInstaller: false,
  output,
};
let application;
let page;
try {
  for (const [archive, target] of [
    [installer, join(output, 'nsis')],
    [join(output, 'nsis', '$PLUGINSDIR', 'app-64.7z'), join(output, 'app')],
  ]) {
    const extracted = spawnSync(sevenZip, ['x', archive, `-o${target}`, '-y'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(
      extracted.status,
      0,
      `Payload extraction failed: ${extracted.stderr}`,
    );
  }
  const archive = join(output, 'app', 'resources', 'app.asar');
  const pkg = JSON.parse(extractFile(archive, 'package.json').toString());
  assert.equal(pkg.main, 'main.js');
  assert.equal(pkg.type, 'module');
  evidence.version = pkg.version;
  evidence.appAsarSha256 = hash(await readFile(archive));
  // The build's manifest may describe a newer installer: compare only a matching one.
  const manifest = JSON.parse(
    await readFile('desktop/release/package-manifest.json', 'utf8'),
  );
  const record = manifest.installers.find(
    (item) => item.name === basename(installer),
  );
  if (record) {
    assert.equal(evidence.sha256, record.sha256);
    for (const item of manifest.files)
      assert.equal(
        hash(extractFile(archive, item.name.slice(1))),
        item.sha256,
        item.name,
      );
    evidence.manifestMatched = true;
  }
  // Never reuse an employee's real Electron profile or contact a production server.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await _electron.launch({
    executablePath: join(output, 'app', 'CONCOST QC Studio.exe'),
    args: [
      `--user-data-dir=${join(output, 'profile')}`,
      '--host-resolver-rules=MAP * ~NOTFOUND',
    ],
    env,
    timeout: 30000,
  });
  page = await application.firstWindow();
  evidence.pageErrors = [];
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message));
  await page.locator('#login').waitFor();
  assert.equal(await page.locator('#run').isDisabled(), true);
  assert.equal(
    await page.evaluate(() => typeof window.qc?.session),
    'function',
  );
  evidence.runtime = await application.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    version: app.getVersion(),
    userData: app.getPath('userData'),
  }));
  assert.equal(evidence.runtime.packaged, true);
  assert.equal(evidence.runtime.version, pkg.version);
  assert.equal(resolve(evidence.runtime.userData), resolve(output, 'profile'));
  evidence.title = await page.title();
  await page.screenshot({ path: join(output, 'startup.png') });
  evidence.status = 'PASS';
} catch (error) {
  evidence.status = 'FAIL';
  evidence.error = error instanceof Error ? error.message : String(error);
  if (page) {
    evidence.url = page.url();
    evidence.body = await page
      .locator('body')
      .innerText()
      .catch(() => 'unavailable');
    await page
      .screenshot({ path: join(output, 'failure.png') })
      .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (application) await application.close();
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify(evidence, null, 2),
  );
}
console.log(JSON.stringify(evidence, null, 2));
