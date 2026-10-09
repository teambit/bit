const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sandbox = path.resolve(process.argv[2] || __dirname);
const root = path.resolve(process.env.BIT_SCANNER_INTEGRATION_ROOT || path.join(__dirname, '../../..'));
const source = path.join(root, 'scopes/dependencies/dependency-resolver/detector-hook.ts');
assert.ok(fs.existsSync(source), 'checkout DetectorHook source must exist');
const destination = path.join(sandbox, 'node_modules/@teambit/dependency-resolver');
assert.ok(!fs.existsSync(destination), 'do not replace an installed dependency-resolver package');
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(
  path.join(destination, 'package.json'),
  JSON.stringify({
    name: '@teambit/dependency-resolver',
    private: true,
    main: 'index.cjs',
  })
);
// Narrow package boundary, real source implementation. Test runners register
// TypeScript compilation before requiring this source; no detector is mocked.
fs.writeFileSync(path.join(destination, 'index.cjs'), `module.exports = require(${JSON.stringify(source)});\n`);
console.log('Prepared checkout DetectorHook package boundary');
