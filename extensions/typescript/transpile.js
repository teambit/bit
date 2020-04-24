const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const tsconfig = require('./tsconfig.default.json');
const typescript = require('typescript');

console.log(process.cwd());
function transpile() {
  fs.writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2));
  const cwd = path.join(__dirname, 'node_modules/.bin');
  console.log('transpile -> tsc path', cwd);
  const results = childProcess.execSync('./tsc . -d', { cwd });
  console.log('transpile -> results', results);
  return { dir: 'dist', results };
}

module.exports = transpile;
