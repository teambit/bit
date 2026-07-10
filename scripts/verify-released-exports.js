#!/usr/bin/env node
/**
 * Fails if any @teambit/* package in a bit installation publishes `exports.types` pointing at a
 * TypeScript *source* file (`.ts`, not `.d.ts`). Such packages force consumers to type-check bit's
 * source instead of its declarations, breaking their builds — this is the 2.0.10 regression.
 *
 * Point it at a released bundle's @teambit dir, e.g. in the e2e_test_bbit CI job:
 *   BV=$(bbit --version | tr -d '[:space:]')
 *   node scripts/verify-released-exports.js "$HOME/.bvm/versions/$BV/bit-$BV/node_modules/@teambit"
 *
 * Do NOT run it against a local dev checkout's node_modules: dev linking intentionally points
 * exports.types at source, so it would (correctly) report everything.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const base = process.argv[2];
if (!base || !fs.existsSync(base)) {
  console.error(`usage: node verify-released-exports.js <path-to-node_modules/@teambit>\n(received: ${base})`);
  process.exit(2);
}

// source = ends in .ts/.tsx but NOT .d.ts/.d.tsx (a declaration file is a valid types target).
const pointsAtSource = (value) => typeof value === 'string' && /\.tsx?$/.test(value) && !/\.d\.tsx?$/.test(value);

const collectTypesEntries = (node, out) => {
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'types' && typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') collectTypesEntries(value, out);
  }
};

const offenders = [];
for (const dir of fs.readdirSync(base)) {
  const packageJsonPath = path.join(base, dir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) continue;
  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (err) {
    // a corrupt/unreadable manifest in a published bundle is itself a problem — fail, don't skip it.
    offenders.push(`${dir} -> unreadable package.json (${err.message})`);
    continue;
  }
  if (!packageJson.exports) continue;
  const typesEntries = [];
  collectTypesEntries(packageJson.exports, typesEntries);
  const sourceEntries = typesEntries.filter(pointsAtSource);
  if (sourceEntries.length) {
    offenders.push(`${packageJson.name}@${packageJson.version} -> exports.types: ${sourceEntries.join(', ')}`);
  }
}

if (offenders.length) {
  console.error(
    `ERROR: ${offenders.length} published @teambit package(s) failed the exports.types check (must be dist/*.d.ts, not .ts source):`
  );
  offenders.slice(0, 50).forEach((offender) => console.error(`  ${offender}`));
  if (offenders.length > 50) console.error(`  ...and ${offenders.length - 50} more`);
  console.error(
    "\nConsumers whose envs type-check these packages will compile bit's source and fail to build.\n" +
      'Republish the affected packages with dist-pointing exports.'
  );
  process.exit(1);
}

console.log(`OK: all @teambit packages under ${base} point exports.types at declarations (.d.ts).`);
