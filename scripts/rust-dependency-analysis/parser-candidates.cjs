#!/usr/bin/env node
// Syntax screening only: SWC has no Bit dependency extractor in this experiment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const cp = require('node:child_process');
const fixtures = require('./fixtures.cjs');
const { legacy, invoke, selectCorpus } = require('./compare.cjs');
assert.equal(process.argv.length, 5, 'usage: parser-candidates.cjs <isolated-swc-root> <native-helper> <output.json>');
const load = createRequire(path.join(path.resolve(process.argv[2]), 'package.json'));
const swc = load('@swc/core');
const root = path.resolve(__dirname, '../..');
const executable = path.resolve(process.argv[3]);
const files = selectCorpus(root).filter((filename) => /scopes\/(dependencies|workspace)\//.test(filename));
const samples = fixtures.concat(
  files.map((filename) => ({
    name: path.relative(root, filename),
    path: filename,
    source: fs.readFileSync(filename, 'utf8'),
  }))
);
const records = [];
for (let offset = 0; offset < samples.length; offset += 32) {
  const batch = samples.slice(offset, offset + 32);
  const native = invoke(executable, [
    { version: 1, id: offset, files: batch.map(({ path, source }) => ({ path, source })) },
  ])[0];
  batch.forEach((sample, index) => {
    if (!/\.(js|jsx|cjs|mjs|ts|tsx|mts|cts)$/.test(sample.path)) return;
    const typescript = /\.(ts|tsx|mts|cts)$/.test(sample.path);
    let swcStatus = 'accepted';
    let diagnostic;
    try {
      swc.parseSync(sample.source, {
        syntax: typescript ? 'typescript' : 'ecmascript',
        ...(typescript ? { tsx: sample.path.endsWith('.tsx') } : { jsx: true }),
        decorators: true,
      });
    } catch (error) {
      swcStatus = 'rejected';
      diagnostic = error.message.replace(/\u001b\[[0-9;]*m/g, '');
    }
    records.push({
      name: sample.name,
      sourceSha256: createHash('sha256').update(sample.source).digest('hex'),
      legacy: legacy(sample).status,
      oxcExtractor: native.files[index].status,
      swcSyntax: swcStatus,
      ...(diagnostic ? { swcDiagnostic: diagnostic } : {}),
    });
  });
}
const counts = {};
for (const record of records) {
  const key = `${record.legacy}/${record.oxcExtractor}/${record.swcSyntax}`;
  counts[key] = (counts[key] || 0) + 1;
}
fs.writeFileSync(
  process.argv[4],
  JSON.stringify(
    {
      revision: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      node: process.version,
      swcVersion: load('@swc/core/package.json').version,
      oxcVersion: '0.153.0',
      helperSha256: createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),
      method:
        'Syntax capability screening against actual legacy extraction outcomes and Oxc extractor outcomes. SWC has no extraction adapter; this is neither metadata parity nor a speed comparison. All syntax failures and compatibility fallbacks remain explicit.',
      counts,
      records,
    },
    null,
    2
  ) + '\n'
);
console.log(JSON.stringify({ selected: records.length, counts }));
