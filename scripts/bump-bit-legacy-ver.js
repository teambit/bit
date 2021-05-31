const { execSync } = require('child_process');
const { SemVer } = require('semver');
const path = require('path');
const { platform } = require('process');

const cwd = path.resolve(__dirname, '..');
const WAIT_FOR_NPM_IN_SEC = 10;
const MAX_NPM_ATTEMPTS = 50;
gitStatus(); // to debug errors with git-pull
gitPull(); // this way, if the script is re-running after another commit, it has the correct data
const shouldBump = shouldBumpBitLegacy();
if (!shouldBump) {
  console.log('there was no change on legacy @teambit/legacy that requires bumping its version');
  return;
}

const currentBitLegacyVersionInCode = require('../package.json').version;
console.log('currentBitLegacyVersionInCode', currentBitLegacyVersionInCode);
const currentBitLegacyVersionInNpm = getCurrentBitLegacyVerFromNpm();
const nextBitLegacyVersion = getNextBitLegacyVersion();
replaceVersionOccurrencesInCode();
gitCommitChanges();
gitPull();
gitPush();
publishBitLegacy();
waitUntilShownInNpm().then(() => console.log('bump has completed!'));

async function waitUntilShownInNpm() {
  let shouldWait = true;
  let numOfAttempts = 0;
  while (shouldWait) {
    const currentVer = getCurrentBitLegacyVerFromNpm();
    if (currentVer == nextBitLegacyVersion) {
      console.log('NPM is up to date!');
      shouldWait = false;
    } else if (numOfAttempts < MAX_NPM_ATTEMPTS) {
      numOfAttempts++;
      console.log(`NPM is still showing version ${currentVer}. will try again in ${WAIT_FOR_NPM_IN_SEC} seconds`);
      // sleep X seconds. it takes time to get the results from npm anyway.
      await sleep(WAIT_FOR_NPM_IN_SEC * 1000);
    } else {
      throw new Error(
        `something is wrong with NPM. wait time of ${WAIT_FOR_NPM_IN_SEC * MAX_NPM_ATTEMPTS} seconds was not enough`
      );
    }
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCurrentBitLegacyVerFromNpm() {
  return exec('npm view @teambit/legacy version').trim();
}

function publishBitLegacy() {
  exec('npm publish');
}

function shouldBumpBitLegacy() {
  // run git log and grab the first line
  const gitLogCmd = 'git log --oneline | grep "bump @teambit/legacy version to" | head -n 1';
  const gitLogResult = execSync(gitLogCmd, { cwd }).toString();
  if (!gitLogResult) throw new Error('failed running bit-log');
  console.log('git log message', gitLogResult);
  const lastVer = gitLogResult.split(' ').filter((s) => s.startsWith('1.'));
  console.log('last version extracted from the log message', lastVer);
  const commitOfLastVer = gitLogResult.split(' ')[0];
  // diff since the last version only for "src" and "package.json", we don't care about the rest.
  const gitDiff = `git diff --quiet ${commitOfLastVer} HEAD -- src package.json`;
  try {
    // if there is no diff, it exits with code 0, in which case, we don't want to bump @teambit/legacy.
    const diffResult = execSync(gitDiff, { cwd });
    return false;
  } catch (err) {
    // if there is a diff, it exits with code 1, in which case, we want to bump @teambit/legacy.
    return true;
  }
}

function getNextBitLegacyVersion() {
  console.log('currentBitLegacyVersionInNpm', currentBitLegacyVersionInNpm);
  const currentBitLegacyVersionInNpmSemver = new SemVer(currentBitLegacyVersionInNpm);
  const nextBitLegacySemVer = currentBitLegacyVersionInNpmSemver.inc('patch');
  const nextBitLegacyVersion = nextBitLegacySemVer.version;
  console.log('nextBitLegacyVersion', nextBitLegacyVersion);
  return nextBitLegacyVersion;
}

function replaceVersionOccurrencesInCode() {
  const isMac = platform === 'darwin';
  const sedBase = isMac ? `sed -i ''` : `sed -i`;
  const sed = `${sedBase} "s/${currentBitLegacyVersionInCode}/${nextBitLegacyVersion}/g"`;
  const sedPackageJson = `s/\\"version\\": \\"${currentBitLegacyVersionInCode}\\",/\\"version\\": \\"${nextBitLegacyVersion}\\",/g`;
  const sedWorkspaceJson = `s/legacy\\": \\"${currentBitLegacyVersionInCode}\\"/legacy\\": \\"${nextBitLegacyVersion}\\"/g`;
  execSync(`${sedBase} "${sedPackageJson}" package.json`, { cwd });
  execSync(`${sedBase} "${sedWorkspaceJson}" workspace.jsonc`, { cwd });
  execSync(`find scopes -name component.json -exec ${sedBase} "${sedWorkspaceJson}" {} \\;`, { cwd });

  console.log(`completed changing all occurrences of "${currentBitLegacyVersionInCode}" to "${nextBitLegacyVersion}"`);
}

function gitCommitChanges() {
  exec(`git commit -am "bump @teambit/legacy version to ${nextBitLegacyVersion} [skip ci]"`);
}

function gitPush() {
  exec('git push origin master');
}

function gitPull() {
  exec('GIT_MERGE_AUTOEDIT=no git pull origin master');
}

function gitStatus() {
  exec('git status');
}

function exec(command) {
  console.log(`$ ${command}`);
  try {
    const results = execSync(command, { cwd });
    const resultsStr = results.toString();
    console.log('SUCCESS: ', resultsStr);
    return resultsStr;
  } catch (err) {
    console.log('FAILED: ', err.toString());
    throw err;
  }
}
