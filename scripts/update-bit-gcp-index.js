const fs = require('fs');
const https = require('https');

const BIT_VERSION = process.env.BIT_VERSION;

(async () => {
  if (!BIT_VERSION) return;
  https.get({
    host: 'bvm.bit.dev',
    path: '/index.json',
    port: 443,
    headers: {
      'Content-Type': 'application/json',
    },
  }, (response) => {
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
        date: getDate(),
        nightly: true,
      });
      fs.writeFileSync('index.json', JSON.stringify(index), 'utf8');
    });
  });
})();

function getDate() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  return `${today.getFullYear()}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`;
}
