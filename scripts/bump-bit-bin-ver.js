const { execSync } = require('child_process');
const { SemVer } = require('semver');
const path = require('path');

const currentBitBinVersion = require('../package.json').version;
console.log('currentBitBinVersion', currentBitBinVersion);
const currentBitBinSemVer = new SemVer(currentBitBinVersion);
const nextBitBinVersion = currentBitBinSemVer.inc('prerelease');
console.log('nextBitBinVersion', nextBitBinVersion);

const rootDir = path.resolve(__dirname, '..');
// use the following sed for Mac.
// const sed = `sed -i '' "s/${currentBitBinVersion}/${nextBitBinVersion}/g"`;
// use the following sed for linux.
const sed = `sed -i "s/${currentBitBinVersion}/${nextBitBinVersion}/g"`;
execSync(`${sed} package.json`, { cwd: rootDir });
execSync(`${sed} workspace.jsonc`, { cwd: rootDir });
execSync(`find extensions/*/*.json -type f -exec ${sed} {} \\;`, { cwd: rootDir });

console.log(`completed changing all occurrences of "${currentBitBinVersion}" to "${nextBitBinVersion}"`);
