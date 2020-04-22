const fs = require('fs');
const childProcess = require('child_process');
console.log(process.cwd());
const tsconfig = require('./tsconfig.default.json');

function transpile() {
  fs.writeFileSync('tsconfig.json', tsconfig);
  const results = childProcess.execSync('tsc -d');
  console.log('transpile -> results', results);
  return { dir: 'dist', results };
}

module.exports = transpile;
