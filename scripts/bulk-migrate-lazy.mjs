#!/usr/bin/env node
// Bulk migration script for the ESM Lazy Aspects RFC (Slice 7).
//
// Converts ONE aspect directory at a time:
//   1. Extracts command static fields from `*.cmd.ts` / `*-cmd.ts` files into
//      a new `<aspect>.commands.ts` with `CommandDescriptor` exports.
//   2. Rewrites the matching command class files so each static field reads
//      from the descriptor (single source of truth).
//   3. Rewrites `cli.register(new XxxCmd(...))` calls in `*.main.runtime.ts`
//      into the descriptor+factory form `cli.register(xxxCommand, () => new XxxCmd(...))`
//      and adds an import for the new descriptors.
//   4. Rewrites `<aspect>.aspect.ts` to import `Aspect` from the harmony
//      manifest module and to declare `runtimes` (and `commands` when
//      applicable) thunks.
//
// The script aims to handle the common shape. Unusual patterns (nested
// `parent.commands = [...]`, conditional registrations, classes defined in
// the runtime file itself, etc.) are reported and left for manual cleanup
// after the run.
//
// Usage:
//   node scripts/bulk-migrate-lazy.mjs <aspect-dir>
//
// Example:
//   node scripts/bulk-migrate-lazy.mjs scopes/harmony/doctor

import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const HARMONY_ASPECT_MODULE = resolve(REPO_ROOT, 'scopes/harmony/harmony/aspect');

const STATIC_FIELDS = new Set([
  'name',
  'alias',
  'description',
  'extendedDescription',
  'helpUrl',
  'group',
  'private',
  'loader',
  'loadAspects',
  'options',
  'arguments',
  'commands',
  'remoteOp',
  'skipWorkspace',
  'examples',
]);

main(process.argv[2]);

function main(aspectDirArg) {
  if (!aspectDirArg) {
    fail('usage: node scripts/bulk-migrate-lazy.mjs <aspect-dir>');
  }
  const aspectDir = resolve(REPO_ROOT, aspectDirArg);
  if (!existsSync(aspectDir) || !statSync(aspectDir).isDirectory()) {
    fail(`not a directory: ${aspectDir}`);
  }

  const files = findAspectFiles(aspectDir);
  if (!files.aspectFile) fail(`no *.aspect.ts file in ${aspectDir}`);
  console.log(`→ migrating ${relative(REPO_ROOT, aspectDir)}`);

  const aspectInfo = parseAspectFile(files.aspectFile);
  console.log(`  aspect id: ${aspectInfo.aspectId}`);

  if (aspectInfo.hasRuntimesThunk) {
    console.log(`  aspect.ts already has \`runtimes\` — skipping aspect rewrite, will still update runtimes.`);
  }

  // 1. Find which command classes are registered, in which order, by which calls.
  const registrations = files.mainRuntimeFile
    ? findCommandRegistrations(files.mainRuntimeFile)
    : { calls: [], warnings: ['no *.main.runtime.ts file found'] };
  registrations.warnings.forEach((w) => console.warn(`  ! ${w}`));

  // 2. For every distinct class name, locate the file that declares it and
  //    extract its static fields.
  const classNames = uniq(registrations.calls.flatMap((c) => c.classes.map((cls) => cls.className)));
  const descriptors = [];
  for (const className of classNames) {
    const located = findClassDeclaration(className, aspectDir);
    if (!located) {
      console.warn(`  ! could not find class ${className} in ${relative(REPO_ROOT, aspectDir)} — skipping`);
      continue;
    }
    const fields = extractStaticFields(located.sourceFile, located.classNode);
    if (fields.size === 0) {
      console.warn(`  ! class ${className} has no extractable static fields — skipping`);
      continue;
    }
    descriptors.push({
      className,
      descriptorName: descriptorVarName(className),
      file: located.file,
      classNode: located.classNode,
      sourceText: located.sourceText,
      fields,
    });
  }

  // 3. Write <aspect>.commands.ts.
  let commandsModule = null;
  if (descriptors.length > 0) {
    commandsModule = join(aspectDir, `${aspectInfo.baseName}.commands.ts`);
    writeFileSync(commandsModule, renderCommandsFile(descriptors));
    console.log(`  + wrote ${relative(REPO_ROOT, commandsModule)} (${descriptors.length} descriptor(s))`);
  } else {
    console.log(`  (no commands registered — skipping ${aspectInfo.baseName}.commands.ts)`);
  }

  // 4. Rewrite each command class file to read from its descriptor.
  for (const d of descriptors) {
    const updated = rewriteCommandClassFile(d, aspectInfo.baseName);
    if (updated !== null) {
      writeFileSync(d.file, updated);
      console.log(`  ~ updated ${relative(REPO_ROOT, d.file)} (class ${d.className})`);
    }
  }

  // 5. Rewrite the runtime's cli.register(...) calls.
  if (files.mainRuntimeFile && descriptors.length > 0) {
    const updatedRuntime = rewriteRuntimeFile(
      files.mainRuntimeFile,
      registrations.calls,
      descriptors,
      aspectInfo.baseName,
    );
    if (updatedRuntime !== null) {
      writeFileSync(files.mainRuntimeFile, updatedRuntime);
      console.log(`  ~ updated ${relative(REPO_ROOT, files.mainRuntimeFile)}`);
    }
  }

  // 6. Rewrite the aspect.ts.
  const updatedAspect = rewriteAspectFile(files.aspectFile, aspectInfo, {
    hasMain: !!files.mainRuntimeFile,
    hasUi: !!files.uiRuntimeFile,
    hasCommands: descriptors.length > 0,
  });
  if (updatedAspect !== null) {
    writeFileSync(files.aspectFile, updatedAspect);
    console.log(`  ~ updated ${relative(REPO_ROOT, files.aspectFile)}`);
  }

  console.log(`✓ done`);
}

// ── filesystem discovery ───────────────────────────────────────────────────

function findAspectFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  let aspectFile = null;
  let mainRuntimeFile = null;
  let uiRuntimeFile = null;
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (e.name.endsWith('.aspect.ts')) aspectFile = join(dir, e.name);
    else if (e.name.endsWith('.main.runtime.ts')) mainRuntimeFile = join(dir, e.name);
    else if (e.name.endsWith('.ui.runtime.ts')) uiRuntimeFile = join(dir, e.name);
  }
  return { aspectFile, mainRuntimeFile, uiRuntimeFile };
}

// ── .aspect.ts parsing ─────────────────────────────────────────────────────

function parseAspectFile(file) {
  const text = readFileSync(file, 'utf8');
  const idMatch = text.match(/id:\s*['"]([^'"]+)['"]/);
  if (!idMatch) fail(`could not find \`id:\` in ${file}`);
  const baseName = basename(file).replace(/\.aspect\.ts$/, '');
  const exportMatch = text.match(/export\s+const\s+(\w+Aspect)\s*=\s*Aspect\.create/);
  if (!exportMatch) fail(`could not find \`export const XxxAspect = Aspect.create\` in ${file}`);
  return {
    file,
    text,
    baseName,
    aspectId: idMatch[1],
    aspectExportName: exportMatch[1],
    hasRuntimesThunk: /\bruntimes:\s*{/.test(text),
    hasDefaultExport: /export\s+default\s+\w+Aspect/.test(text),
  };
}

// ── *.main.runtime.ts: find cli.register(...) targets ──────────────────────

function findCommandRegistrations(runtimeFile) {
  const text = readFileSync(runtimeFile, 'utf8');
  const sf = ts.createSourceFile(runtimeFile, text, ts.ScriptTarget.Latest, true);
  const calls = [];
  const warnings = [];

  // Build a local map: identifier name → `new XxxCmd(...)` if we can prove it.
  const localCmdAliases = new Map();
  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isNewExpression(node.initializer)) {
      const className = node.initializer.expression && ts.isIdentifier(node.initializer.expression)
        ? node.initializer.expression.text
        : null;
      if (className && className.endsWith('Cmd') && ts.isIdentifier(node.name)) {
        localCmdAliases.set(node.name.text, { className, exprText: node.initializer.getText(sf) });
      }
    }
    ts.forEachChild(node, collectAliases);
  }
  collectAliases(sf);

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.name) &&
      node.expression.name.text === 'register'
    ) {
      const recv = node.expression.expression;
      // Match `cli.register(...)` / `cliMain.register(...)` etc. — accept any
      // identifier receiver whose name contains "cli" (case-insensitive).
      if (ts.isIdentifier(recv) && /cli/i.test(recv.text)) {
        const callInfo = analyzeRegisterCall(node, sf, localCmdAliases);
        if (callInfo.classes.length > 0) calls.push(callInfo);
        else if (callInfo.warnings.length) callInfo.warnings.forEach((w) => warnings.push(w));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  return { calls, warnings };
}

function analyzeRegisterCall(callNode, sf, localCmdAliases) {
  const classes = [];
  const warnings = [];
  for (const arg of callNode.arguments) {
    if (ts.isNewExpression(arg) && arg.expression && ts.isIdentifier(arg.expression)) {
      const className = arg.expression.text;
      if (className.endsWith('Cmd')) {
        classes.push({ className, source: 'new', argText: arg.getText(sf), argNode: arg });
        continue;
      }
    }
    if (ts.isIdentifier(arg)) {
      const alias = localCmdAliases.get(arg.text);
      if (alias) {
        warnings.push(
          `register(...) uses local variable \`${arg.text}\` (=> new ${alias.className}). ` +
            `Inline the construction at the register site for the migration to rewrite it.`,
        );
        continue;
      }
      warnings.push(
        `register(...) argument \`${arg.getText(sf)}\` is not a \`new XxxCmd(...)\` expression — skipping.`,
      );
      continue;
    }
    warnings.push(`register(...) has non-trivial argument: ${arg.getText(sf)} — skipping.`);
  }
  return {
    callNode,
    callText: callNode.getText(sf),
    callStart: callNode.getStart(sf),
    callEnd: callNode.getEnd(),
    indent: lineIndent(sf.text, callNode.getStart(sf)),
    classes,
    warnings,
  };
}

function lineIndent(text, pos) {
  let i = pos;
  while (i > 0 && text[i - 1] !== '\n') i--;
  let indent = '';
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) {
    indent += text[i];
    i++;
  }
  return indent;
}

// ── Find the class declaration for a given Cmd name ────────────────────────

function findClassDeclaration(className, dir) {
  const candidates = [];
  function collect(d) {
    const entries = readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        collect(full);
      } else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
        candidates.push(full);
      }
    }
  }
  collect(dir);

  for (const file of candidates) {
    const text = readFileSync(file, 'utf8');
    if (!new RegExp(`class\\s+${escapeRegex(className)}\\b`).test(text)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    let found = null;
    function visit(node) {
      if (ts.isClassDeclaration(node) && node.name && node.name.text === className) {
        found = node;
      }
      if (!found) ts.forEachChild(node, visit);
    }
    visit(sf);
    if (found) return { file, sourceFile: sf, sourceText: text, classNode: found };
  }
  return null;
}

// ── Extract static fields from a class node ────────────────────────────────

function extractStaticFields(sf, classNode) {
  const fields = new Map();
  for (const member of classNode.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    if (member.modifiers && member.modifiers.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) continue;
    if (!member.name || !ts.isIdentifier(member.name)) continue;
    const name = member.name.text;
    if (!STATIC_FIELDS.has(name)) continue;
    if (!member.initializer) continue;
    fields.set(name, {
      initText: member.initializer.getText(sf),
      memberStart: member.getStart(sf),
      memberEnd: member.getEnd(),
      memberFullStart: member.getFullStart(),
      memberText: member.getText(sf),
    });
  }
  return fields;
}

// ── Render the *.commands.ts module ────────────────────────────────────────

function renderCommandsFile(descriptors) {
  const usesCommandOptions = descriptors.some((d) => d.fields.has('options'));
  const typeImports = ['CommandDescriptor'];
  if (usesCommandOptions) typeImports.push('CommandOptions');
  const lines = [];
  lines.push(`import type { ${typeImports.join(', ')} } from '@teambit/cli';`);
  lines.push('');
  lines.push(`/**`);
  lines.push(` * Declarative command descriptors for this aspect.`);
  lines.push(` *`);
  lines.push(` * Part of the ESM Migration with Lazy-Loaded Aspects RFC`);
  lines.push(` * (docs/rfc-esm-lazy-aspects.md §6.2). Each descriptor is the single`);
  lines.push(` * source of truth for its command's static fields; the matching handler`);
  lines.push(` * class reads these fields rather than redeclaring them, and`);
  lines.push(` * \`cli.register(descriptor, factory)\` consumes the pair.`);
  lines.push(` */`);
  for (let i = 0; i < descriptors.length; i++) {
    const d = descriptors[i];
    lines.push('');
    lines.push(`export const ${d.descriptorName}: CommandDescriptor = {`);
    for (const key of orderFields(d.fields)) {
      const f = d.fields.get(key);
      let value = f.initText;
      if (key === 'options' && !/\bas\s+CommandOptions\b/.test(value)) {
        value = `${value} as CommandOptions`;
      }
      const indented = indentMultiline(value, '  ');
      lines.push(`  ${key}: ${indented},`);
    }
    lines.push(`};`);
  }
  lines.push('');
  return lines.join('\n');
}

function orderFields(fields) {
  // A stable, readable ordering that roughly matches the existing pilot.
  const preferred = [
    'name',
    'alias',
    'description',
    'extendedDescription',
    'helpUrl',
    'group',
    'arguments',
    'private',
    'remoteOp',
    'skipWorkspace',
    'loadAspects',
    'loader',
    'options',
    'examples',
    'commands',
  ];
  const present = new Set(fields.keys());
  const ordered = preferred.filter((k) => present.has(k));
  for (const k of fields.keys()) if (!ordered.includes(k)) ordered.push(k);
  return ordered;
}

function indentMultiline(text, indent) {
  const lines = text.split('\n');
  if (lines.length === 1) return text;
  return lines.map((line, i) => (i === 0 ? line : indent + line)).join('\n');
}

// ── Rewrite a command class file to read from descriptor ───────────────────

function rewriteCommandClassFile(descriptor, aspectBaseName) {
  const { file, classNode, sourceText, fields, descriptorName } = descriptor;
  const sf = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  // re-find the class in the parsed file to get up-to-date offsets
  let target = null;
  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name && node.name.text === descriptor.className) target = node;
    if (!target) ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!target) return null;

  // Replace each field initializer with `<descriptorName>.<field>` reference.
  // Apply edits from end to start so offsets stay valid.
  const edits = [];
  for (const member of target.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    if (member.modifiers && member.modifiers.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) continue;
    if (!member.name || !ts.isIdentifier(member.name)) continue;
    const name = member.name.text;
    if (!fields.has(name) || !member.initializer) continue;
    edits.push({
      start: member.initializer.getStart(sf),
      end: member.initializer.getEnd(),
      replacement: `${descriptorName}.${name}`,
      memberName: name,
    });
  }
  edits.sort((a, b) => b.start - a.start);
  let updated = sourceText;
  for (const edit of edits) {
    // also drop any trailing `as XYZ` type assertion if present, e.g. `[...] as CommandOptions`
    // since the descriptor field is already typed.
    let end = edit.end;
    const tail = sourceText.slice(edit.end).match(/^(\s*as\s+\w+(?:<[^>]+>)?)/);
    if (tail) end += tail[1].length;
    updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(end);
  }

  if (edits.length === 0) return null;

  // Add `import { <descriptorName> } from './<aspect>.commands';` if missing.
  const importLine = importLineForDescriptor(updated, aspectBaseName, descriptorName);
  if (importLine) {
    updated = insertImport(updated, importLine);
  }
  return updated;
}

function importLineForDescriptor(text, aspectBaseName, descriptorName) {
  const importPath = `./${aspectBaseName}.commands`;
  const existing = new RegExp(`from\\s+['"]${escapeRegex(importPath)}['"]`).exec(text);
  if (!existing) {
    return `import { ${descriptorName} } from '${importPath}';`;
  }
  // already imported from same path — add the symbol if missing.
  const line = lineAt(text, existing.index);
  if (new RegExp(`\\b${escapeRegex(descriptorName)}\\b`).test(line)) return null;
  // augment the existing import in-place (handled in `insertImport`)
  return { augment: true, importPath, descriptorName };
}

function insertImport(text, importLineOrAugment) {
  if (typeof importLineOrAugment === 'object' && importLineOrAugment.augment) {
    const { importPath, descriptorName } = importLineOrAugment;
    return text.replace(new RegExp(`(import\\s+\\{[^}]*)(\\}\\s+from\\s+['"]${escapeRegex(importPath)}['"];?)`), (_m, head, tail) => {
      return `${head.replace(/\s+$/, '')}, ${descriptorName} ${tail}`;
    });
  }
  // Insert after the last top-level import statement.
  const importBlock = /^(?:import[^\n]*\n)+/m.exec(text);
  if (importBlock) {
    const end = importBlock.index + importBlock[0].length;
    return text.slice(0, end) + importLineOrAugment + '\n' + text.slice(end);
  }
  return importLineOrAugment + '\n' + text;
}

function lineAt(text, idx) {
  const start = text.lastIndexOf('\n', idx) + 1;
  const end = text.indexOf('\n', idx);
  return text.slice(start, end === -1 ? text.length : end);
}

// ── Rewrite the *.main.runtime.ts cli.register() calls ─────────────────────

function rewriteRuntimeFile(file, registerCalls, descriptors, aspectBaseName) {
  const text = readFileSync(file, 'utf8');
  const descriptorByClass = new Map(descriptors.map((d) => [d.className, d]));

  // Build replacement text for each register call, then apply end→start.
  const edits = [];
  for (const call of registerCalls) {
    const replacement = buildRegisterReplacement(call, descriptorByClass);
    if (replacement === null) continue;
    // include the trailing semicolon if it sits on the same line.
    let end = call.callEnd;
    if (text[end] === ';') end += 1;
    edits.push({ start: call.callStart, end, replacement });
  }
  if (edits.length === 0) return null;

  edits.sort((a, b) => b.start - a.start);
  let updated = text;
  for (const edit of edits) {
    updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
  }

  // Add an import for the descriptors used.
  const descriptorNames = uniq(
    registerCalls.flatMap((c) =>
      c.classes
        .filter((cls) => descriptorByClass.has(cls.className))
        .map((cls) => descriptorByClass.get(cls.className).descriptorName),
    ),
  );
  if (descriptorNames.length > 0) {
    const importPath = `./${aspectBaseName}.commands`;
    updated = ensureNamedImport(updated, importPath, descriptorNames);
  }
  return updated;
}

function buildRegisterReplacement(call, descriptorByClass) {
  // Each `new XxxCmd(args...)` argument becomes its own register call.
  const lines = [];
  let i = 0;
  const indent = call.indent;
  for (const cls of call.classes) {
    const d = descriptorByClass.get(cls.className);
    if (!d) {
      // can't rewrite this argument — keep original call as-is (bail out).
      return null;
    }
    // Re-extract the original receiver text (e.g. `cli.register` or `cliMain.register`).
    const receiver = extractReceiverFromCall(call.callText);
    const newArg = cls.argText; // e.g. `new StatusCmd(statusMain)`
    const line = `${receiver}(${d.descriptorName}, () => ${newArg});`;
    lines.push(i === 0 ? line : `${indent}${line}`);
    i++;
  }
  if (lines.length === 0) return null;
  return lines.join('\n');
}

function extractReceiverFromCall(callText) {
  // e.g. "cli.register(...)" → "cli.register"
  const m = callText.match(/^([\w.]+)\s*\(/);
  return m ? m[1] : 'cli.register';
}

function ensureNamedImport(text, importPath, names) {
  const re = new RegExp(`import\\s+\\{([^}]*)\\}\\s+from\\s+['"]${escapeRegex(importPath)}['"];?`);
  const m = re.exec(text);
  if (m) {
    const existing = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = uniq([...existing, ...names]).sort();
    return text.slice(0, m.index) + `import { ${merged.join(', ')} } from '${importPath}';` + text.slice(m.index + m[0].length);
  }
  const line = `import { ${names.sort().join(', ')} } from '${importPath}';`;
  return insertImport(text, line);
}

// ── Rewrite the *.aspect.ts with runtimes/commands thunks ──────────────────

function rewriteAspectFile(file, aspectInfo, { hasMain, hasUi, hasCommands }) {
  const text = aspectInfo.text;
  const aspectModuleRel = posixify(relative(dirname(file), HARMONY_ASPECT_MODULE));
  const importRel = aspectModuleRel.startsWith('.') ? aspectModuleRel : `./${aspectModuleRel}`;

  // Replace the Aspect import.
  let updated = text;
  updated = updated.replace(
    /import\s*\{\s*Aspect\s*(?:,\s*[^}]+)?\}\s*from\s*['"]@teambit\/harmony['"];?/,
    `import { Aspect } from '${importRel}';`,
  );

  // If the existing import line still has other symbols we need (RuntimeDefinition),
  // preserve them on a second import line.
  const preserved = preserveHarmonyImports(text);
  if (preserved && !/import\s*\{[^}]*RuntimeDefinition[^}]*\}\s*from\s*['"]@teambit\/harmony['"]/.test(updated)) {
    updated = updated.replace(
      `import { Aspect } from '${importRel}';`,
      `import { ${preserved} } from '@teambit/harmony';\nimport { Aspect } from '${importRel}';`,
    );
  }

  // Build the new Aspect.create({...}) body. We replace the entire call so
  // the result is deterministic even when the original was multi-line.
  const runtimes = [];
  if (hasMain) runtimes.push(`main: () => import('./${aspectInfo.baseName}.main.runtime')`);
  if (hasUi) runtimes.push(`ui: () => import('./${aspectInfo.baseName}.ui.runtime')`);

  const newBodyLines = [`  id: '${aspectInfo.aspectId}',`];
  // preserve dependencies/defaultConfig if present in the original.
  const deps = extractCreateOptionText(text, 'dependencies');
  if (deps) newBodyLines.push(`  dependencies: ${deps},`);
  const defaultConfig = extractCreateOptionText(text, 'defaultConfig');
  if (defaultConfig) newBodyLines.push(`  defaultConfig: ${defaultConfig},`);

  if (runtimes.length === 1) {
    newBodyLines.push(`  runtimes: { ${runtimes[0]} },`);
  } else if (runtimes.length > 1) {
    newBodyLines.push(`  runtimes: {`);
    for (const r of runtimes) newBodyLines.push(`    ${r},`);
    newBodyLines.push(`  },`);
  }

  if (hasCommands) {
    newBodyLines.push(
      `  commands: () => import('./${aspectInfo.baseName}.commands').then((m) => [${'/* fill in descriptor refs */'}]),`,
    );
  }

  const newBody = newBodyLines.join('\n');
  const createRe = /Aspect\.create\(\{[\s\S]*?\}\)/;
  if (!createRe.test(updated)) return null;
  updated = updated.replace(createRe, `Aspect.create({\n${newBody}\n})`);

  // If we have commands, fill in `[m.fooCommand, m.barCommand]`. We do this in
  // a second pass to read the descriptor names from the freshly-written
  // commands file.
  if (hasCommands) {
    const commandsFile = join(dirname(file), `${aspectInfo.baseName}.commands.ts`);
    const names = readDescriptorNames(commandsFile);
    if (names.length > 0) {
      updated = updated.replace(
        `[${'/* fill in descriptor refs */'}]`,
        `[${names.map((n) => `m.${n}`).join(', ')}]`,
      );
    }
  }

  return updated;
}

function preserveHarmonyImports(originalText) {
  const m = originalText.match(/import\s*\{\s*([^}]+)\}\s*from\s*['"]@teambit\/harmony['"];?/);
  if (!m) return null;
  const symbols = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== 'Aspect');
  return symbols.length > 0 ? symbols.join(', ') : null;
}

function extractCreateOptionText(text, key) {
  const m = text.match(new RegExp(`\\b${escapeRegex(key)}:\\s*`));
  if (!m) return null;
  const start = m.index + m[0].length;
  // Read a balanced expression until the next top-level comma or `}` in the
  // Aspect.create call body.
  let depthSquare = 0;
  let depthCurly = 0;
  let depthRound = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '[') depthSquare++;
    else if (ch === ']') depthSquare--;
    else if (ch === '{') depthCurly++;
    else if (ch === '}') {
      if (depthCurly === 0) break;
      depthCurly--;
    } else if (ch === '(') depthRound++;
    else if (ch === ')') depthRound--;
    else if (ch === ',' && depthSquare === 0 && depthCurly === 0 && depthRound === 0) break;
    i++;
  }
  const value = text.slice(start, i).trim();
  // Discard the obvious no-ops.
  if (value === '[]' || value === '{}') return null;
  return value;
}

function readDescriptorNames(commandsFile) {
  if (!existsSync(commandsFile)) return [];
  const text = readFileSync(commandsFile, 'utf8');
  const names = [];
  const re = /export\s+const\s+(\w+):\s*CommandDescriptor/g;
  let m;
  while ((m = re.exec(text))) names.push(m[1]);
  return names;
}

// ── utilities ──────────────────────────────────────────────────────────────

function descriptorVarName(className) {
  // FooCmd → fooCommand, MiniStatusCmd → miniStatusCommand
  const base = className.replace(/Cmd$/, '');
  return base.charAt(0).toLowerCase() + base.slice(1) + 'Command';
}

function uniq(arr) {
  return [...new Set(arr)];
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function posixify(p) {
  return p.split(sep).join('/');
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
