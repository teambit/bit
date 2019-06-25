const fs = require('fs');
const fetch = require('make-fetch-happen');
const path = require('path');
const chalk = require('chalk');
const { execSync } = require('child_process');
const { version, scripts } = require('../package.json');
const userHome = require('user-home');

const EXECUTABLE_CACHE_LOCATION = path.join(userHome, 'Library', 'Caches', 'Bit', 'bit-executable'); // TODO: get this from constants

const rootBitDir = path.join(__dirname, '..');

const { platform } = process;
const fileNames = {
  linux: 'bit-bin-linux',
  win32: 'bit-bin-win.exe',
  darwin: 'bit-bin-macos'
};

const binaryDir = path.join(__dirname, '..', 'bin');
const pathToBinaryFile = path.join(binaryDir, 'bit');

const baseUrl = 'http://localhost:1337'; // TODO: change to github releases url

function log(msg) {
  console.log(chalk.green('bit install:'), msg);
}

function findFileUrl() {
  return `${baseUrl}/v${version}-${fileNames[platform]}`;
}

async function fetchBinary(binaryFileUrl) {
  const res = await fetch(binaryFileUrl, { cacheManager: EXECUTABLE_CACHE_LOCATION });
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
    const stdout = execSync(pathToBinaryFile, ['--help'], { stdio: 'ignore' });
    if (stdout.toString().includes('usage: bit')) {
      return true;
    } 
    return false;
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
  const releaseFile = path.join(__dirname, '..', 'releases', 'bit');
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
  await tryDownloadingBinary();
  if (checkExistingBinary()) {
    log('Prebuilt version downloaded successfully.');
    return;
  }
  log('Failed to download prebuilt version. Compiling locally.');
  tryBuildingBinary();
  log('Compiled binary locally. All is well!');
}

main();
