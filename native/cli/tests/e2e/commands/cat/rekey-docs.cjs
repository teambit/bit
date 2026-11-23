// Rebase path-keyed fixture entries while preserving their exact freshness metadata.
const fs = require('node:fs');
const cacache = require(require.resolve('cacache', { paths: [process.argv[1]] }));
const entries = JSON.parse(fs.readFileSync(0, 'utf8'));
Promise.all(entries.map(entry => cacache.put(process.argv[2], entry.key, entry.data, {
  metadata: { timestamp: entry.timestamp },
}))).catch(error => { console.error(error); process.exitCode = 1; });
