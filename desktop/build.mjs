import { build } from 'vite';
import {
  mkdir,
  copyFile,
  writeFile,
  readFile,
  readdir,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = process.cwd();
const bundles = await build({
  configFile: false,
  publicDir: false,
  resolve: { alias: { '@': root } },
  build: {
    ssr: true,
    outDir: 'desktop/out',
    emptyOutDir: true,
    minify: false,
    rolldownOptions: {
      input: {
        main: resolve('desktop/main.mjs'),
        worker: resolve('desktop/worker.mjs'),
      },
      external: ['electron', /^node:/],
      output: { entryFileNames: '[name].js' },
    },
  },
  ssr: { noExternal: true },
});
// Build metadata, not the web package.json, determines which notices ship.
const packageModules = new Map();
for (const bundle of [bundles].flat()) {
  for (const chunk of bundle.output.filter((item) => item.type === 'chunk')) {
    for (const [id, module] of Object.entries(chunk.modules)) {
      if (!module.renderedLength) continue;
      const match = id
        .replaceAll('\\', '/')
        .match(/^(.*\/node_modules\/)((?:@[^/]+\/)?[^/]+)\/(.+)$/);
      if (!match) continue;
      const directory = match[1] + match[2];
      if (!packageModules.has(directory))
        packageModules.set(directory, new Set());
      packageModules.get(directory).add(match[3]);
    }
  }
}
const supplements = await readFile('desktop/THIRD_PARTY_NOTICES.txt', 'utf8');
const notices = [
  'QC desktop bundled runtime notices\nElectron runtime notices: LICENSE.electron.txt and LICENSES.chromium.html beside the executable.',
];
const dependencies = [];
for (const [directory, modules] of [...packageModules].sort(([a], [b]) =>
  a < b ? -1 : a > b ? 1 : 0,
)) {
  const pkg = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
  const licenseFiles = (await readdir(directory))
    .filter((name) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let text = '';
  for (const file of licenseFiles)
    text += `\nSource: ${pkg.name}/${file}\n${await readFile(`${directory}/${file}`, 'utf8')}`;
  if (!text)
    text =
      supplements
        .split(`===== ${pkg.name}@${pkg.version} =====`)[1]
        ?.split('\n===== ')[0]
        ?.trim() ?? '';
  if (!text || !pkg.license)
    throw new Error(`Missing runtime license: ${pkg.name}@${pkg.version}`);
  notices.push(
    `\n===== ${pkg.name}@${pkg.version} (${pkg.license}) =====\n${text}`,
  );
  dependencies.push({
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    licenseSources: licenseFiles.length
      ? licenseFiles
      : ['desktop/THIRD_PARTY_NOTICES.txt (pinned upstream commit)'],
    noticeSha256: createHash('sha256').update(text).digest('hex'),
    modules: [...modules].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  });
}
if (!dependencies.length) throw new Error('No runtime module metadata found');
await writeFile('desktop/out/THIRD_PARTY_NOTICES.txt', notices.join('\n'));
await writeFile(
  'desktop/out/runtime-dependencies.json',
  JSON.stringify(dependencies, null, 2),
);
await mkdir('desktop/out/ui', { recursive: true });
for (const file of ['index.html', 'app.js', 'instructions.js', 'style.css'])
  await copyFile(`desktop/ui/${file}`, `desktop/out/ui/${file}`);
await copyFile(
  'public/brand/concost-logo-horizontal.png',
  'desktop/out/ui/concost-logo-horizontal.png',
);
await copyFile('desktop/preload.cjs', 'desktop/out/preload.cjs');
await writeFile(
  'desktop/out/package.json',
  JSON.stringify({
    name: 'concost-qc-desktop',
    version: '0.1.4',
    type: 'module',
    main: 'main.js',
    author: 'CONCOST',
    description: 'CONCOST QC desktop internal preview',
    dependencies: {},
  }),
);
// Keep the dependency-free bundle an independent npm project during packaging.
await writeFile(
  'desktop/out/package-lock.json',
  JSON.stringify({
    name: 'concost-qc-desktop',
    version: '0.1.4',
    lockfileVersion: 3,
    requires: true,
    packages: { '': { name: 'concost-qc-desktop', version: '0.1.4' } },
  }),
);
