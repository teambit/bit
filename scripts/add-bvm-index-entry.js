#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Add one version to bvm's `index.json` under a chosen release type, and write the result to
 * `index.json` in the cwd for the caller to upload.
 *
 *   node scripts/add-bvm-index-entry.js --version 2.2.18-bundle.1 --release-type dev
 *   gsutil cp index.json gs://bvm.bit.dev/bit/index.json
 *   gsutil setmeta -h "Cache-Control:no-cache" gs://bvm.bit.dev/bit/index.json
 *
 * This is `update-bit-gcp-index.js` with the release type as an argument rather than always
 * `nightly`. bvm filters the index by the type the client asked for, so an entry flagged `dev` is
 * invisible to everyone on the default (`stable`) and on `nightly`, and reachable only by someone
 * who opts in with `BVM_RELEASE_TYPE=dev` or `bvm config set RELEASE_TYPE dev`. That is what makes
 * it safe to list a branch build next to the real releases.
 */
const fs = require('fs');
const https = require('https');

const RELEASE_TYPES = ['dev', 'nightly', 'stable'];

const argv = process.argv.slice(2);
const take = (flag, fallback) => {
  const i = argv.indexOf(flag);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  argv.splice(i, 2);
  return value;
};

const version = take('--version', process.env.BIT_VERSION);
const releaseType = take('--release-type', 'dev');

function fail(message) {
  console.error(`[bvm-index] ${message}`);
  process.exit(1);
}

if (!version) fail('missing --version <semver> (or the BIT_VERSION env variable)');
if (!RELEASE_TYPES.includes(releaseType)) fail(`--release-type must be one of ${RELEASE_TYPES.join(', ')}`);

function fetchIndex() {
  // go straight at the object with a cache-buster; the CDN in front of it serves stale copies
  const random = Math.floor(Math.random() * 100000);
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          host: 'bvm.bit.dev',
          path: `/bit/index.json?random=${random}`,
          port: 443,
          headers: { 'Content-Type': 'application/json' },
        },
        (response) => {
          let body = '';
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('end', () => {
            if (response.statusCode === 404) return resolve([]);
            if (response.statusCode !== 200) return reject(new Error(`index.json responded ${response.statusCode}`));
            try {
              return resolve(JSON.parse(body));
            } catch (err) {
              return reject(err);
            }
          });
        }
      )
      .on('error', reject);
  });
}

(async () => {
  const index = await fetchIndex();
  const existing = index.find((release) => release.version === version);
  if (existing) {
    existing[releaseType] = true;
    console.log(`[bvm-index] marked the existing ${version} entry as "${releaseType}"`);
  } else {
    index.push({ version, date: new Date().toISOString(), [releaseType]: true });
    console.log(`[bvm-index] added ${version} as "${releaseType}"`);
  }
  fs.writeFileSync('index.json', JSON.stringify(index, null, 2), 'utf8');
  console.log('[bvm-index] wrote index.json - upload it to gs://bvm.bit.dev/bit/index.json');
})().catch((err) => fail(err.message));
