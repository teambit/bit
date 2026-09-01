#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Print the next bvm pre-release version for this branch, e.g. "2.2.11-bundle.3".
 *
 *   node scripts/next-bundle-version.js
 *
 * The base is whatever version this branch's components are on (`teambit.harmony/bit` in
 * `.bitmap`), so it tracks the branch: after the branch merges master and the bump lands, the base
 * moves with it and the counter restarts. The counter is the next one free in bvm's live index, so
 * two builds never collide and nobody has to remember which number they are up to.
 *
 * Only the version is written to stdout - anything else goes to stderr, so this can be used as
 * `VERSION=$(node scripts/next-bundle-version.js)`.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const BUNDLE_TAG = 'bundle';

function readBaseVersion(repoRoot) {
  const raw = fs.readFileSync(path.join(repoRoot, '.bitmap'), 'utf8');
  // .bitmap is JSON with a leading /* ... */ banner
  const bitmap = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, ''));
  const entry = bitmap.bit;
  if (!entry || !entry.version) throw new Error('could not read the "bit" entry from .bitmap');
  if (entry.scope && entry.scope !== 'teambit.harmony') {
    throw new Error(`.bitmap's "bit" entry is scoped to ${entry.scope}, expected teambit.harmony`);
  }
  return entry.version;
}

function fetchIndex() {
  const random = Math.floor(Math.random() * 100000);
  return new Promise((resolve, reject) => {
    https
      .get({ host: 'bvm.bit.dev', path: `/bit/index.json?random=${random}`, port: 443 }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 404) return resolve([]);
          if (res.statusCode !== 200) return reject(new Error(`index.json responded ${res.statusCode}`));
          try {
            return resolve(JSON.parse(body));
          } catch (err) {
            return reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

(async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const base = readBaseVersion(repoRoot);

  let index = [];
  try {
    index = await fetchIndex();
  } catch (err) {
    // A read failure must not silently restart the counter and overwrite an existing build.
    throw new Error(`could not read bvm's index.json to pick the next counter: ${err.message}`);
  }

  const pattern = new RegExp(`^${base.replace(/\./g, '\\.')}-${BUNDLE_TAG}\\.(\\d+)$`);
  const used = index
    .map((release) => pattern.exec(release.version))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  const next = used.length ? Math.max(...used) + 1 : 1;

  console.error(`[next-bundle-version] base ${base}, ${used.length} existing build(s)`);
  console.log(`${base}-${BUNDLE_TAG}.${next}`);
})().catch((err) => {
  console.error(`[next-bundle-version] ${err.message}`);
  process.exit(1);
});
