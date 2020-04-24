const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const tsconfig = require('./tsconfig.default.json');
const typescript = require('typescript');

console.log(process.cwd());
function transpile() {
  fs.writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2));
  let results;
  try {
    result = childProcess.execSync('npx tsc -d', { cwd: 'node_modules/.bin' });
  } catch (err) {
    console.log('transpile -> err', err);
    console.log('transpile -> stdour', err.stdout ? err.stdout.toString() : '');
    console.log('transpile -> stderr', err.stderr ? err.stderr.toString() : '');
  }
  console.log('transpile -> results', results);
  return { dir: 'dist', results };
}

module.exports = transpile;
