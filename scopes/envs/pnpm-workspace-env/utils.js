const { spawn } = require('child_process');
const fs = require('fs/promises');

/**
 * runs pnpm with the given arguments. resolves with its output, stdout and stderr interleaved as
 * printed, and rejects with an error carrying that output when pnpm exits with a failure.
 */
function runPnpm(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { cwd, shell: process.platform === 'win32' });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', (err) => reject(Object.assign(err, { output })));
    child.on('close', (code) => {
      if (code === 0) return resolve(output);
      const err = new Error(`"pnpm ${args.join(' ')}" exited with code ${code}`);
      return reject(Object.assign(err, { output }));
    });
  });
}

function exists(filePath) {
  return fs.access(filePath).then(
    () => true,
    () => false
  );
}

module.exports = { exists, runPnpm };
