const fs = require('fs');
const os = require('os');
const fetch = require('make-fetch-happen');
const semver = require('semver');
const path = require('path');
const chalk = require('chalk');
const { execSync } = require('child_process');
const { version, scripts } = require('../package.json');
const userHome = require('user-home');
// const { IS_WINDOWS } = require('../src/constants');

const EXECUTABLE_CACHE_LOCATION = path.join(userHome, 'Library', 'Caches', 'Bit', 'bit-executable'); // TODO: get this from constants

// This was temporarily copied from constants since constants has import statements that are not supported without build step
const IS_WINDOWS = os.platform() === 'win32';

const rootBitDir = path.join(__dirname, '..');

const { platform } = process;
const fileNames = {
  linux: 'bit-linux',
  win32: 'bit-win.exe',
  darwin: 'bit-macos'
};

const binaryDir = path.join(__dirname, '..', 'bin');
const binaryName = IS_WINDOWS ? 'bit.exe' : 'bit';
const pathToBinaryFile = path.join(binaryDir, binaryName);

const baseUrl = 'https://github.com/teambit/bit/releases/download';

function log(msg) {
  console.log(chalk.green('bit install:'), msg);
}

function findFileUrl() {
  return `${baseUrl}/v${version}/${fileNames[platform]}`;
}

async function fetchBinary(binaryFileUrl) {
  const res = await fetch(binaryFileUrl, {
    cacheManager: EXECUTABLE_CACHE_LOCATION,
    retry: 3 // 3 is arbitrary
  });
  if (res.status !== 200) {
    throw new Error(`failed to fetch binary: ${res.statusText}`);
  }
  return res.buffer();
}

function checkExistingBinary() {
  try {
    if (!fs.existsSync(pathToBinaryFile)) {
      return false;
    }
    const stdout = execSync(pathToBinaryFile, ['--version'], { stdio: 'ignore' });
    return !!semver.valid(stdout.toString());
  } catch (e) {
    return false;
  }
}

function buildSrc() {
  const buildScript = scripts.build;
  const stdout = execSync(buildScript, { cwd: rootBitDir, stdio: 'pipe' });
  const output = stdout.toString();
  if (!output.includes('Successfully compiled')) {
    throw new Error(`failed to build bit: ${output}`);
  }
}

function pkgBinary() {
  const pkgScript = scripts.pkg;
  const stdout = execSync(pkgScript, { cwd: rootBitDir, stdio: 'pipe' });
  const output = stdout.toString();
  // TODO: detect failure (pkg does not exit 2 if there is an error?!)
}

function copyBinary() {
  const releaseFile = path.join(__dirname, '..', 'releases', binaryName);
  log(`copying ${releaseFile} to ${pathToBinaryFile}`);
  fs.copyFileSync(releaseFile, pathToBinaryFile);
}

function tryBuildingBinary() {
  buildSrc();
  pkgBinary();
  copyBinary();
}

async function tryDownloadingBinary() {
  try {
    const binaryFileUrl = findFileUrl();
    const binaryFile = await fetchBinary(binaryFileUrl);
    fs.writeFileSync(pathToBinaryFile, binaryFile);
    fs.chmodSync(pathToBinaryFile, '755');
  } catch (e) {} // silently fail, we recover from all errors here by building on our own
}

async function main() {
  if (checkExistingBinary()) {
    log('Existing bit binary found.');
    return;
  }
  log('Bit binary not found or corrupted, attempting to download a prebuilt version.');
  if (process.env.SKIP_FETCH_BINARY) {
    log('SKIP_FETCH_BINARY is set to true, skipping fetching the binary file');
  } else {
    await tryDownloadingBinary();
    if (checkExistingBinary()) {
      log('Prebuilt version downloaded successfully.');
      return;
    }
  }
  log('unable to download pre-packaged version. packaging bit locally (this might take a few minutes)...');
  if (process.env.SKIP_LOCAL_BUILD_BINARY) {
    log('SKIP_LOCAL_BUILD_BINARY is set to true, skipping building binary locally');
  } else {
    tryBuildingBinary();
  }
  log('Compiled binary locally. All is well!');
}

main();
