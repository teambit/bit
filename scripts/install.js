const fs = require('fs');
const fetch = require('make-fetch-happen');
const semver = require('semver');
const path = require('path');
const chalk = require('chalk');
const { execSync } = require('child_process');
const userHome = require('user-home');
const { version, scripts } = require('../package.json');
const { CURRENT_BINARY_FILE_NAME, CURRENT_DEFAULT_BINARY_PATH, CURRENT_BINARY_PATH } = require('./scripts-constants');
// const { IS_WINDOWS } = require('../src/constants');

const EXECUTABLE_CACHE_LOCATION = path.join(userHome, 'Library', 'Caches', 'Bit', 'bit-executable'); // TODO: get this from constants

// This was temporarily copied from constants since constants has import statements that are not supported without build step

const ROOT_BIT_DIR = path.join(__dirname, '..');

const BASE_URL = 'https://github.com/teambit/bit/releases/download';

function log(msg) {
  console.log(chalk.green('bit install:'), msg);
}

function findFileUrl() {
  return `${BASE_URL}/v${version}/${CURRENT_BINARY_FILE_NAME}`;
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
    let existingBinary = CURRENT_DEFAULT_BINARY_PATH;
    log(`searching for ${CURRENT_DEFAULT_BINARY_PATH} and ${CURRENT_BINARY_PATH}`);
    if (fs.existsSync(CURRENT_DEFAULT_BINARY_PATH)) {
      existingBinary = CURRENT_DEFAULT_BINARY_PATH;
    } else if (fs.existsSync(CURRENT_BINARY_PATH)) {
      existingBinary = CURRENT_BINARY_PATH;
    } else {
      return false;
    }
    const cmd = `${existingBinary} --version`;
    const stdout = execSync(cmd);
    const isValidVersion = !!semver.valid(stdout.toString().trim());
    return isValidVersion;
  } catch (e) {
    console.log(e);
    return false;
  }
}

function buildSrc() {
  const buildScript = scripts.build;
  const stdout = execSync(buildScript, { cwd: ROOT_BIT_DIR, stdio: 'pipe' });
  const output = stdout.toString();
  if (!output.includes('Successfully compiled')) {
    throw new Error(`failed to build bit: ${output}`);
  }
}

function pkgBinary() {
  const pkgScript = scripts.pkg;
  const stdout = execSync(pkgScript, { cwd: ROOT_BIT_DIR, stdio: 'pipe' });
  // const output = stdout.toString();
  // TODO: detect failure (pkg does not exit 2 if there is an error?!)
}

function tryBuildingBinary() {
  buildSrc();
  pkgBinary();
}

async function tryDownloadingBinary() {
  try {
    const binaryFileUrl = findFileUrl();
    const binaryFile = await fetchBinary(binaryFileUrl);
    fs.writeFileSync(CURRENT_BINARY_PATH, binaryFile);
    fs.chmodSync(CURRENT_BINARY_PATH, '755');
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
