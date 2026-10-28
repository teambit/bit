process.argv.splice(1, 1);
const path = require('node:path');
process.argv[1] = path.resolve(process.argv[1]);
const fs = require('node:fs');
const readline = require('node:readline');
const { createRequire } = require('node:module');
const defender = createRequire(installation.resolve('@teambit/defender.jest-tester'));
const react = createRequire(installation.resolve('@teambit/react.jest.react-jest'));
const jest = installation('@jest/core');
const { formatResultsErrors } = installation('jest-message-util');
const emit = process.stdout.write.bind(process.stdout);
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let request;
let config;
let argv;
lines.on('line', async line => {
  if (!request) {
    request = JSON.parse(line);
    if (jest.getVersion() !== '29.7.0') throw new Error('unqualified Jest version');
    for (const [name, version] of [['@teambit/defender.jest-tester', '2.1.3'], ['@teambit/react.jest.react-jest', '1.0.38']]) {
      if (JSON.parse(fs.readFileSync(installation.resolve(name + '/package.json'), 'utf8')).version !== version) {
        throw new Error('unqualified tester configuration');
      }
    }
    const modules = {
      '$identity': installation.resolve('identity-obj-proxy'),
      '$uuid': defender.resolve('uuid'),
      '$jsdom': installation.resolve('jest-environment-jsdom'),
      '$polyfill': react.resolve('react-app-polyfill/jsdom'),
    };
    const resolve = value => {
      if (typeof value === 'string') return value.startsWith('$asset:') ? path.join(request.assets, value.slice(7)) : modules[value] ?? value;
      if (Array.isArray(value)) return value.map(resolve);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolve(child)]));
      return value;
    };
    config = resolve(request.config);
    argv = { ...request.options, config: JSON.stringify(config) };
    await installation('jest-config').readConfigs(argv, [request.root]);
    for (const filename of Object.values(config.transform)) require(filename);
    require(config.snapshotResolver);
    react.resolve('@testing-library/jest-dom/extend-expect');
    emit(JSON.stringify({ ready: true }) + '\n');
    return;
  }
  if (JSON.parse(line) !== true) throw new Error('test tool execution signal');
  lines.close();
  const silent = (...args) => { const callback = args.find(value => typeof value === 'function'); if (callback) callback(); return true; };
  for (const method of ['log', 'warn', 'error', 'info', 'debug']) console[method] = () => {};
  process.stdout.write = silent;
  process.stderr.write = silent;
  try {
    const result = await jest.runCLI(argv, [request.root]);
    for (const file of result.results.testResults) {
      for (const test of file.testResults) {
        test.formattedError = formatResultsErrors([test], config, { noStackTrace: true }) || undefined;
      }
    }
    emit(JSON.stringify({ results: result.results, exitCode: process.exitCode }) + '\n');
  } catch (error) {
    emit(JSON.stringify({ error, errorMessage: error?.message, exitCode: process.exitCode }) + '\n');
  }
});
