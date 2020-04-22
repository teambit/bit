const fs = require('fs-extra');
const fetch = require('make-fetch-happen');
const semver = require('semver');
const path = require('path');
const chalk = require('chalk');
const { execSync } = require('child_process');
const userHome = require('user-home');
const { version, scripts } = require('../package.json');
const {
  CURRENT_BINARY_FILE_NAME,
  CURRENT_DEFAULT_BINARY_PATH,
  CURRENT_BINARY_PATH,
  BINARY_FINAL_FILE_NAME,
  IS_WINDOWS
} = require('./scripts-constants');
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

function getExistingBinary() {
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
    if (isValidVersion) {
      return existingBinary;
    }
    return false;
  } catch (e) {
    console.log(e);
    return false;
  }
}

function getInstallationPathFromEnv() {
  // We couldn't infer path from `npm bin`. Let's try to get it from
  // Environment variables set by NPM when it runs.
  // npm_config_prefix points to NPM's installation directory where `bin` folder is available
  // Ex: /Users/foo/.nvm/versions/node/v4.3.0
  log('getting installation path from env.npm_config_prefix');
  const env = process.env;
  if (env && env.npm_config_prefix) {
    const dir = path.join(env.npm_config_prefix, 'bin');
    return dir;
  }
}

function correctInstallationPathForWindows(originalDir) {
  const osPath = process.env.path;
  const splittedOsPath = osPath.split(';');
  const pathsExistingInOrigDir = splittedOsPath.filter(currPath => {
    const includes = currPath && originalDir.includes(currPath);
    return includes;
  });
  if (!pathsExistingInOrigDir || !pathsExistingInOrigDir.length) {
    return null;
  }
  pathsExistingInOrigDir.sort((a, b) => {
    return b.length - a.length;
  });
  return pathsExistingInOrigDir[0];
}

function getInstallationPath() {
  let dir;
  let npmBinCmd;
  try {
    // `$npm_execpath bin` will output the path where binary files should be installed
    // using whichever package manager is current
    // const packageManager = process.env.npm_execpath || 'npm';
    // npmBinCmd = `${packageManager} bin`;
    // const stdout = execSync(npmBinCmd);
    // if (!stdout || stdout.length === 0) {
    //  dir = getInstallationPathFromEnv();
    // } else {
    //  dir = stdout.toString().trim();
    // }
    dir = getInstallationPathFromEnv();
  } catch (e) {
    // log(`failing running ${npmBinCmd}`);
    log('failing running getInstallationPathFromEnv');
    dir = getInstallationPathFromEnv();
  }
  if (dir) {
    // taken from here: https://github.com/sanathkr/go-npm/pull/7
    dir = dir.replace(/node_modules.*\/\.bin/, 'node_modules/.bin');
    let finalDir = dir;
    if (IS_WINDOWS) {
      log('change installation dir for windows');
      const updatedDir = correctInstallationPathForWindows(dir);
      finalDir = updatedDir || dir;
    }
    fs.ensureDirSync(finalDir);
    return finalDir;
  }
}

function getBinaryInstallationPath() {
  const binDir = getInstallationPath();
  return path.join(binDir, BINARY_FINAL_FILE_NAME);
}

function copyBinaryToBinDir() {
  const installationPath = getBinaryInstallationPath();
  const existingBinary = getExistingBinary();
  log(`copy binary from ${existingBinary} to ${installationPath}`);
  fs.copyFileSync(existingBinary, installationPath);
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
  copyBinaryToBinDir();
}

async function tryDownloadingBinary() {
  try {
    const binaryFileUrl = findFileUrl();
    const binaryFile = await fetchBinary(binaryFileUrl);
    const targetFilePath = getBinaryInstallationPath();
    log(`writing binary at ${targetFilePath}`);
    fs.writeFileSync(targetFilePath, binaryFile);
    fs.chmodSync(targetFilePath, '755');
  } catch (e) {} // silently fail, we recover from all errors here by building on our own
}

async function main() {
  if (getExistingBinary()) {
    log('Existing bit binary found.');
    copyBinaryToBinDir();
    return;
  }
  log('Bit binary not found or corrupted, attempting to download a prebuilt version.');
  if (process.env.SKIP_FETCH_BINARY) {
    log('SKIP_FETCH_BINARY is set to true, skipping fetching the binary file');
  } else {
    await tryDownloadingBinary();
    if (getExistingBinary()) {
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
