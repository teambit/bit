const fs = require('fs');
const https = require('https');

const BIT_VERSION = process.env.BIT_VERSION;
const random = Math.floor(Math.random() * 100000);

(async () => {
  if (!BIT_VERSION) {
    console.log('Skipping index.json generation because the BIT_VERSION env variable is not set');
    return;
  }
  https.get(
    {
      host: 'bvm.bit.dev',
      // Going to the google storage directly to not getting a version from the cache
      // host: 'https://storage.googleapis.com',
      // adding random to avoid cache
      path: `/bit/index.json?random=${random}`,
      // path: '/bvm.bit.dev/bit/index.json',
      port: 443,
      headers: {
        'Content-Type': 'application/json',
      },
    },
    (response) => {
      let body = '';
      response.on('data', (d) => {
        body += d;
      });
      response.on('end', () => {
        let index;
        if (response.statusCode === 404) {
          index = [];
        } else {
          index = JSON.parse(body);
        }
        const found = index.find((release) => release.version === BIT_VERSION);
        if (!found) {
          index = index.filter((release) => release.version !== BIT_VERSION);
          index.push({
            version: BIT_VERSION,
            date: new Date().toISOString(),
            nightly: true,
          });
        }
        fs.writeFileSync('index.json', JSON.stringify(index), 'utf8');
      });
    }
  );
})();
