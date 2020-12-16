const { execSync } = require('child_process');
const { SemVer } = require('semver');
const path = require('path');
const { platform } = require('process');

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

const cwd = path.resolve(__dirname, '..');
const isMac = platform === 'darwin';
const sedBase = isMac ? `sed -i ''` : `sed -i`;
const sed = `${sedBase} "s/${currentBitBinVersionInCode}/${nextBitBinVersion}/g"`;
execSync(`${sed} package.json`, { cwd });
execSync(`${sed} workspace.jsonc`, { cwd });
execSync(`find scopes -name component.json -exec ${sed} {} \\;`, { cwd });

console.log(`completed changing all occurrences of "${currentBitBinVersionInCode}" to "${nextBitBinVersion}"`);

const results = execSync(`git commit -am "bump bit-bin version to ${nextBitBinVersion} [skip ci]"`, { cwd });
console.log('commit output: ', results.toString());
