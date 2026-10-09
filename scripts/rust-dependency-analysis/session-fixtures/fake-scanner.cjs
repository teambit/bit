const fs = require('node:fs');
const readline = require('node:readline');

// A real subprocess with controllable protocol failures. Each test gets its own
// explicit argument vector and log, avoiding process-wide environment state.
exports.run = function run(mode, logPath) {
  const log = (entry) => fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  log({ event: 'start', pid: process.pid, args: process.argv.slice(2) });
  if (mode === 'ignore-term') {
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000); // Survive stdin closure as well as SIGTERM.
  }
  let requests = 0;
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const request = JSON.parse(line);
    log({ event: 'request', request });
    requests++;
    const failing = mode !== 'ok' && (mode !== 'fail-after-first' || requests > 1);
    if (failing && (mode === 'hang' || mode === 'fail-after-first' || mode === 'ignore-term')) return;
    if (failing && mode === 'crash') return process.exit(23);
    if (failing && mode === 'malformed') return process.stdout.write('{broken\n');
    if (failing && mode === 'stdout-overflow') return process.stdout.write('x'.repeat(16384));
    if (failing && mode === 'stderr-overflow') process.stderr.write('diagnostic '.repeat(200000));
    const files = request.files.map(({ path, source }) => {
      const status = path.includes('unsupported')
        ? 'unsupported'
        : path.includes('parse-error')
          ? 'parse_error'
          : path.includes('read-error')
            ? 'read_error'
            : 'ok';
      return {
        path,
        status,
        dependencies:
          status === 'ok'
            ? {
                [source === undefined ? path : `inline:${source}`]: {
                  importSpecifiers: [{ isDefault: false, name: 'value' }],
                },
              }
            : {},
        diagnostics: status === 'ok' ? [] : ['original scanner diagnostic'],
      };
    });
    const response = { version: 1, id: request.id, files };
    if (failing && mode === 'wrong-id') response.id = 'wrong-request';
    if (failing && mode === 'wrong-path') response.files[0].path += '.other';
    if (failing && mode === 'wrong-count') response.files.pop();
    if (failing && mode === 'bad-status') response.files[0].status = 'unexpected';
    if (failing && mode === 'bad-metadata') response.files[0].dependencies = { pkg: { importSpecifiers: 'malformed' } };
    if (failing && mode === 'wrong-version') response.version = 2;
    if (failing && mode === 'partial-error')
      response.files[0] = { ...response.files[0], status: 'parse_error', diagnostics: ['bad syntax'] };
    const output = JSON.stringify(response) + '\n';
    if (mode === 'invalid-utf8') {
      const bytes = Buffer.from(output);
      bytes[bytes.indexOf('value')] = 0xff;
      return process.stdout.write(bytes);
    }
    if (mode === 'duplicate-response') return process.stdout.write(output + output);
    if (mode === 'delayed') return setTimeout(() => process.stdout.write(output), 50);
    if (mode === 'split-output') {
      process.stdout.write(output.slice(0, 7));
      return setTimeout(() => process.stdout.write(output.slice(7)), 10);
    }
    process.stdout.write(output);
  });
};

if (require.main === module) {
  const [, , mode, logPath] = process.argv;
  if (!mode || !logPath) throw new Error('usage: fake-scanner.cjs MODE LOG_PATH');
  exports.run(mode, logPath);
}
