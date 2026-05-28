const fs = require('fs');
const https = require('https');

const BIT_VERSION = process.env.RELEASE_VERSION;
const STABLE = process.env.RELEASE_STABLE;
const TEST_MODE = process.env.RELEASE_TEST_MODE === 'true';

if (!BIT_VERSION) {
  console.error('RELEASE_VERSION env variable is required');
  process.exit(1);
}
if (STABLE !== 'true' && STABLE !== 'false') {
  console.error(`RELEASE_STABLE must be "true" or "false", got "${STABLE}"`);
  process.exit(1);
}

const stable = STABLE === 'true';
const indexObjectName = TEST_MODE ? 'index-test.json' : 'index.json';
const random = Math.floor(Math.random() * 100000);

// Fetch directly from GCS to bypass any CDN caching.
https
  .get(
    {
      host: 'storage.googleapis.com',
      path: `/bvm.bit.dev/bit/${indexObjectName}?random=${random}`,
      port: 443,
      headers: { 'Content-Type': 'application/json' },
    },
    (response) => {
      let body = '';
      response.on('data', (d) => {
        body += d;
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          console.error(`Failed to fetch index.json: HTTP ${response.statusCode}`);
          process.exit(1);
        }
        const index = JSON.parse(body);
        const release = index.find((r) => r.version === BIT_VERSION);
        if (!release) {
          console.error(`version ${BIT_VERSION} not found in index.json`);
          process.exit(1);
        }
        if (stable) {
          release.stable = true;
        } else {
          delete release.stable;
        }
        fs.writeFileSync('index.json', JSON.stringify(index), 'utf8');
        console.log(
          `Marked version ${BIT_VERSION} as ${stable ? 'stable' : 'not stable'} in ${indexObjectName}`
        );
      });
    }
  )
  .on('error', (err) => {
    console.error('Failed to fetch index.json:', err);
    process.exit(1);
  });
