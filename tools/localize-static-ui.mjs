// Mechanical JSX localization. Dynamic source data is never translated.
// Emits a patch for review/apply_patch; does not edit source files.
import fs from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
const files = [
  'app/review-studio.tsx',
  'app/review-workbench.tsx',
  'app/review-modules.tsx',
  'app/project-data-workspace.tsx',
  'app/project-registration-workspace.tsx',
  'app/source-document-checklist.tsx',
];
let patch = '*** Begin Patch\n';
for (const path of files) {
  if (process.argv[2] && path !== process.argv[2]) continue;
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes("from './ui-translation'")) continue;
  const tree = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const changes = [];
  const hooks = new Set();
  let textComponents = false;
  function owner(node) {
    let found;
    while (node.parent && !ts.isSourceFile(node.parent)) {
      node = node.parent;
      if (ts.isFunctionDeclaration(node) && node.body) found = node;
    }
    return found;
  }
  function visit(node) {
    if (ts.isJsxText(node) && /[가-힣]/u.test(node.text)) {
      const normalized = node.text.replace(/\s+/gu, ' ').trim();
      if (normalized) {
        changes.push([
          node.pos,
          node.end,
          `${/^\s/u.test(node.text) ? ' ' : ''}<UiText text=${JSON.stringify(normalized)} />${/\s$/u.test(node.text) ? ' ' : ''}`,
        ]);
        textComponents = true;
      }
      return;
    }
    if (ts.isStringLiteral(node) && /[가-힣]/u.test(node.text)) {
      let inJsx = ts.isJsxAttribute(node.parent);
      let parent = node.parent;
      while (
        parent &&
        !ts.isFunctionDeclaration(parent) &&
        !ts.isSourceFile(parent)
      ) {
        if (ts.isJsxExpression(parent)) inJsx = true;
        parent = parent.parent;
      }
      const component = owner(node);
      if (inJsx && component && /^[A-Z]/.test(component.name?.text ?? '')) {
        const call = `uiText(${JSON.stringify(node.text)})`;
        changes.push([
          node.getStart(tree),
          node.end,
          ts.isJsxAttribute(node.parent) ? `{${call}}` : call,
        ]);
        hooks.add(component);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!changes.length) continue;
  for (const fn of hooks)
    changes.push([
      fn.body.getStart(tree) + 1,
      fn.body.getStart(tree) + 1,
      '\n  const uiText = useUiText();',
    ]);
  const imports = [textComponents && 'UiText', hooks.size && 'useUiText']
    .filter(Boolean)
    .join(', ');
  const pos = source.indexOf("'use client';") + "'use client';".length;
  changes.push([
    pos,
    pos,
    `\nimport { ${imports} } from './ui-translation';\n`,
  ]);
  let next = source;
  for (const [start, end, value] of changes.sort((a, b) => b[0] - a[0]))
    next = next.slice(0, start) + value + next.slice(end);
  patch +=
    `*** Update File: ${resolve(path).replaceAll('\\', '/')}\n@@\n` +
    source
      .trimEnd()
      .split(/\r?\n/)
      .map((l) => '-' + l)
      .join('\n') +
    '\n' +
    next
      .trimEnd()
      .split(/\r?\n/)
      .map((l) => '+' + l)
      .join('\n') +
    '\n';
}
console.log(patch + '*** End Patch');
