const { execSync } = require('child_process');
const { SemVer } = require('semver');
const path = require('path');
const { platform } = require('process');

const cwd = path.resolve(__dirname, '..');
const WAIT_FOR_NPM_IN_SEC = 10;
const MAX_NPM_ATTEMPTS = 50;

const shouldBump = shouldBumpBitBin();
if (!shouldBump) {
  console.log('there was no change on legacy bit-bin that requires bumping its version');
  return;
}

const currentBitBinVersionInCode = require('../package.json').version;
console.log('currentBitBinVersionInCode', currentBitBinVersionInCode);
const currentBitBinVersionInNpm = getCurrentBitBinVerFromNpm();
const nextBitBinVersion = getNextBitBinVersion();

replaceVersionOccurrencesInCode();
gitCommitChanges();
gitPush();
publishBitBin();
waitUntilShownInNpm().then(() => console.log('bump has completed!'));

async function waitUntilShownInNpm() {
  let shouldWait = true;
  let numOfAttempts = 0;
  while (shouldWait) {
    const currentVer = getCurrentBitBinVerFromNpm();
    if (currentVer == nextBitBinVersion) {
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

function getCurrentBitBinVerFromNpm() {
  return exec('npm view bit-bin@dev version').trim();
}

function publishBitBin() {
  exec('npm publish --tag dev');
}

function shouldBumpBitBin() {
  // run git log and grab the first line
  const gitLogCmd = 'git log --oneline | grep "bump bit-bin version to" | head -n 1';
  const gitLogResult = execSync(gitLogCmd, { cwd }).toString();
  if (!gitLogResult) throw new Error('failed running bit-log');
  console.log('git log message', gitLogResult);
  const lastVer = gitLogResult.split(' ').filter((s) => s.startsWith('14'));
  console.log('last version extracted from the log message', lastVer);
  const commitOfLastVer = gitLogResult.split(' ')[0];
  // diff since the last version only for "src" and "package.json", we don't care about the rest.
  const gitDiff = `git diff --quiet ${commitOfLastVer} HEAD -- src package.json`;
  try {
    // if there is no diff, it exits with code 0, in which case, we don't want to bump bit-bin.
    const diffResult = execSync(gitDiff, { cwd });
    return false;
  } catch (err) {
    // if there is a diff, it exits with code 1, in which case, we want to bump bit-bin.
    return true;
  }
}

function getNextBitBinVersion() {
  console.log('currentBitBinVersionInNpm', currentBitBinVersionInNpm);
  const currentBitBinVersionInNpmSemver = new SemVer(currentBitBinVersionInNpm);
  const nextBitBinSemVer = currentBitBinVersionInNpmSemver.inc('prerelease');
  const nextBitBinVersion = nextBitBinSemVer.version;
  console.log('nextBitBinVersion', nextBitBinVersion);
  return nextBitBinVersion;
}

function replaceVersionOccurrencesInCode() {
  const isMac = platform === 'darwin';
  const sedBase = isMac ? `sed -i ''` : `sed -i`;
  const sed = `${sedBase} "s/${currentBitBinVersionInCode}/${nextBitBinVersion}/g"`;
  execSync(`${sed} package.json`, { cwd });
  execSync(`${sed} workspace.jsonc`, { cwd });
  execSync(`find scopes -name component.json -exec ${sed} {} \\;`, { cwd });

  console.log(`completed changing all occurrences of "${currentBitBinVersionInCode}" to "${nextBitBinVersion}"`);
}

function gitCommitChanges() {
  exec(`git commit -am "bump bit-bin version to ${nextBitBinVersion} [skip ci]"`);
}

function gitPush() {
  exec('GIT_MERGE_AUTOEDIT=no git pull origin master');
  exec('git push origin master');
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
