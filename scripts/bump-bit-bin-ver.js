const { execSync } = require('child_process');
const { SemVer } = require('semver');
const path = require('path');

const currentBitBinVersionInCode = require('../package.json').version;
console.log('currentBitBinVersionInCode', currentBitBinVersionInCode);

// const currentBitBinSemVer = new SemVer(currentBitBinVersionInCode);
// const nextBitBinSemVer = currentBitBinSemVer.inc('prerelease');
// const nextBitBinVersion = nextBitBinSemVer.version;
// console.log('nextBitBinVersion', nextBitBinVersion);

let currentBitBinVersionInNpm = execSync('npm view bit-bin@dev version').toString();
console.log('currentBitBinVersionInNpm', currentBitBinVersionInNpm);
currentBitBinVersionInNpm = new SemVer(currentBitBinVersionInNpm);
const nextBitBinSemVer = currentBitBinVersionInNpm.inc('prerelease');
const nextBitBinVersion = nextBitBinSemVer.version;
console.log('nextBitBinVersion', nextBitBinVersion);

const rootDir = path.resolve(__dirname, '..');
// use the following sed for Mac.
// const sed = `sed -i '' "s/${currentBitBinVersionInCode}/${nextBitBinVersion}/g"`;
// use the following sed for linux.
const sed = `sed -i "s/${currentBitBinVersionInCode}/${nextBitBinVersion}/g"`;
execSync(`${sed} package.json`, { cwd: rootDir });
execSync(`${sed} workspace.jsonc`, { cwd: rootDir });
try {
  execSync('shopt -s globstar', { cwd: rootDir }); // enables the double asterisks
} catch (err) {
  // probably mac. no need for this in mac anyway.
}
execSync(`find scopes/**/component.json -type f -exec ${sed} {} \\;`, { cwd: rootDir });

console.log(`completed changing all occurrences of "${currentBitBinVersionInCode}" to "${nextBitBinVersion}"`);
