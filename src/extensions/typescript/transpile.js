/* eslint-disable no-console */
/**
 * work-in-progress typescript compiler.
 * once Flows is able to show errors, remove the console.logs
 */

require('typescript');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const tsconfig = require('./tsconfig.default.json');

console.log(process.cwd());
function transpile() {
  fs.writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2));
  let results;
  try {
    // @todo: make sure this is working on Windows
    results = childProcess.execSync(path.join(__dirname, 'node_modules/.bin/tsc'));
  } catch (err) {
    console.log('transpile -> err', err);
    console.log('transpile -> stdout', err.stdout ? err.stdout.toString() : '');
    console.log('transpile -> stderr', err.stderr ? err.stderr.toString() : '');
    // @todo: probably a bug in Flows. when the next line is un-commented, Flows hangs
    // return { err };
    return { dir: 'dist', results, err };
  }
  updatePackageJsonWithMainDist();
  console.log('transpile -> results', results);
  return { dir: 'dist', results };
}

function updatePackageJsonWithMainDist() {
  const packageJsonPath = 'package.json';
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
  const currentMain = packageJson.main;
  if (currentMain.startsWith('dist/')) return;
  const fileNameNoExt = path.parse(currentMain).name;
  packageJson.main = `dist/${fileNameNoExt}.js`;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

module.exports = transpile;
