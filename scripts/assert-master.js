const { exec } = require('child_process');
exec('git rev-parse --abbrev-ref HEAD', (err, stdout, stderr) => {
  if (err) {
    process.exit(1);
  }

  if (typeof stdout === 'string' && stdout.trim() !== 'master') {
    console.error('Not on master');
    process.exit(1);
  }
});
