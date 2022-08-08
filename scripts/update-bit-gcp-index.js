const fs = require('fs');
const https = require('https');

const BIT_VERSION = process.env.BIT_VERSION;

(async () => {
  if (!BIT_VERSION) {
    console.log('Skipping index.json generation because the BIT_VERSION env variable is not set');
    return;
  }
  https.get(
    {
      host: 'bvm.bit.dev',
      path: '/bit/index.json',
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
        index = index.filter((release) => release.version !== BIT_VERSION);
        index.push({
          version: BIT_VERSION,
          date: new Date().toISOString(),
          nightly: true,
        });
        fs.writeFileSync('index.json', JSON.stringify(index), 'utf8');
      });
    }
  );
})();
