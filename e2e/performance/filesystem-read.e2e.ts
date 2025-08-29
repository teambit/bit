/* eslint no-console: 0 */

import fs from 'fs-extra';
import path from 'path';
import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import { difference } from 'lodash';

const MAX_FILES_READ = 1050;
const MAX_FILES_READ_STATUS = 1500;

/**
 * as of now (2025/03/03) 1,030 files are loaded during bit-bootstrap.
 * for "bit status", around 1,433 files are loaded.
 *
 * two weeks ago we were at 2,964 files. a few PRs helped to reduce the number of files. among them:
 * #9568, #9572, #9576, #9577, #9578, #9584, #9587, #9588, #9590, #9593, #9594, #9598.
 * it can be helpful to take a look into those PRs in the future in case the number grows.
 */
describe('Filesystem read count', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('basic commands', () => {
    describe('bit --help', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
      });
      it('should not exceed a reasonable file-count number', () => {
        const output = helper.command.runCmd('bit --help', undefined, undefined, undefined, undefined, {
          BIT_DEBUG_READ_FILE: 'true',
        });
        const numberOfReads = getNumberOfReads(output);
        if (numberOfReads) {
          console.log(`Total reads found: ${numberOfReads}`);
          if (numberOfReads > MAX_FILES_READ) {
            printDiffFromLastSnapshot(output);
          }
        } else {
          console.log(`No read lines (#...) found`);
        }
        expect(output).to.have.string('0');
        expect(output).to.have.string('package.json');
        expect(output).to.have.string('node_modules');
        expect(output).to.not.have.string(`#${MAX_FILES_READ}`);
      });
      it('should take reasonable time to run bit --help', () => {
        const start = process.hrtime();
        helper.command.runCmd('bit --help');
        const [timeInSeconds, nanoseconds] = process.hrtime(start);
        const timeInMs = timeInSeconds * 1000 + nanoseconds / 1_000_000;
        // On my Mac M1, as of 2025/03/03, it takes 312ms.
        // On Circle it can take up to 1300ms.
        console.log('bit --help load time in milliseconds: ', Math.floor(timeInMs));
        expect(timeInMs).to.be.lessThan(1500);
      });
    });
    describe('bit status', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(1);
      });
      it('should not exceed a reasonable file-count number', () => {
        const output = helper.command.runCmd('bit status', undefined, undefined, undefined, undefined, {
          BIT_DEBUG_READ_FILE: 'true',
        });
        expect(output).to.not.have.string(`#${MAX_FILES_READ_STATUS}`);
      });
      it('should take less than 2 seconds', () => {
        const start = process.hrtime();
        helper.command.runCmd('bit status');
        const [timeInSeconds, nanoseconds] = process.hrtime(start);
        const timeInMs = timeInSeconds * 1000 + nanoseconds / 1_000_000;

        // Use different thresholds for CI vs local development
        // CI environments have more variability due to shared resources
        const isCI = process.env.CI || process.env.CIRCLECI;
        const maxTimeInSeconds = isCI ? 3 : 2;
        // On Mac M1, as of 2025/03/03, it takes 500ms.
        console.log(`bit status load time in milliseconds: ${Math.floor(timeInMs)} (max allowed: ${maxTimeInSeconds}s)`);
        expect(timeInSeconds).to.be.lessThan(maxTimeInSeconds);
      });
    });
  });
});

function getNumberOfReads(cmdOutput: string): number {
  const lines = cmdOutput.split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('#')) {
      // match lines that begin with `#<digits>`
      const match = line.match(/^#(\d+)/);
      if (match) {
        const lastNumber = parseInt(match[1], 10);
        return lastNumber;
      }
    }
  }

  // if no match found at all
  return 0;
}

function printDiffFromLastSnapshot(cmdOutput: string) {
  const fromLastSnapshot = fs.readFileSync(path.join(__dirname, 'files-snapshot.txt')).toString();
  const fromLastSnapshotLines = fromLastSnapshot.split('\n');
  const { linesFromBitInstallation, otherLines } = getLinesFromBitInstallation(cmdOutput);
  console.log('********** the following files are new ***************************');
  difference(linesFromBitInstallation, fromLastSnapshotLines).forEach((line) => console.log(line));
  console.log('******************************************************************');

  console.log('********** the following files are old ***************************');
  difference(fromLastSnapshotLines, linesFromBitInstallation).forEach((line) => console.log(line));
  console.log('******************************************************************');

  console.log('********** the following files are not from bit-installation *****');
  otherLines.forEach((line) => console.log(line));
  console.log('*******************************************************************');
}

function getLinesFromBitInstallation(cmdOutput: string) {
  const lines = cmdOutput.split('\n');
  const relevantLines = lines.filter((line) => line.startsWith('#'));
  const linesWithoutHash = relevantLines.map((l) => l.replace(/#[0-9]+/, ''));
  const mustPresentFileCandidate = '@teambit/bit/dist/bootstrap.js';
  const bitBootstrap = linesWithoutHash.find((l) => l.endsWith(mustPresentFileCandidate));
  if (!bitBootstrap) {
    throw new Error(`unable to find ${mustPresentFileCandidate} in the output`);
  }
  const commonDir = bitBootstrap.replace(mustPresentFileCandidate, '');
  const linesWithCommonDir = linesWithoutHash.filter((l) => l.startsWith(commonDir));
  const linesFromBitInstallation = linesWithCommonDir.map((l) => l.replace(commonDir, ''));
  const otherLines = linesWithoutHash.filter((l) => !l.startsWith(commonDir));
  return { linesFromBitInstallation, otherLines };
}

/**
 * in case a new snapshot is needed, call this function during the test.
 * then go to the output and paste the files into files-snapshot.txt.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeSnapshot(cmdOutput: string) {
  const { linesFromBitInstallation } = getLinesFromBitInstallation(cmdOutput);
  console.log('************** start snapshot **************');
  linesFromBitInstallation.forEach((line) => console.log(line));
  console.log('************** end snapshot ****************');
}
