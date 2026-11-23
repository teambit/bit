const fs = require('node:fs');
const { createRequire } = require('node:module');
const installation = createRequire(process.argv[1]);
const dependencies = createRequire(installation.resolve('@teambit/typescript.deps-detectors.detective-typescript'));
const parser = dependencies('@typescript-eslint/typescript-estree');
const Walker = dependencies('node-source-walk');
const inputs = JSON.parse(fs.readFileSync(0, 'utf8'));
const errors = inputs.map(file => {
  const walker = new Walker({ parser, comment: true, loc: true, jsx: file.path.endsWith('.tsx') });
  try { walker.parse(file.source); return null; }
  catch (error) { return { code: 'PARSING_ERROR', message: error.message, lineNumber: error.lineNumber, column: error.column }; }
});
process.stdout.write(JSON.stringify(errors));
