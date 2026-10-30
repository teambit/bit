/* eslint no-console: 0 */

import fs from 'fs-extra';
import path from 'path';
import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import _ from 'lodash';
import { fileURLToPath } from 'url';

// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_FILES_READ = 1100;
// The "bit status" guard counts UNIQUE LOGICAL MODULES — installation paths normalized past every
// node_modules nesting level ('.pnpm/fs-extra@11/node_modules/fs-extra/lib/copy.js' and
// '@teambit/compilation.compiler-task/node_modules/fs-extra/lib/copy.js' both count once, as
// 'fs-extra/lib/copy.js') — NOT raw physical reads. History of why: the raw-reads guard
// (then 1515) failed e2e_test_bbit nightly for three weeks starting 2026-07-23. Diffing
// BIT_DEBUG_READ_FILE output of bvm-installed 2.0.33 (last green) vs 2.0.35 (first red) showed
// ZERO new logical modules — #10515's dependency change merely reshaped the released bundle's
// pnpm hoisted layout, so the same packages were read from duplicated nested copies (physical
// unique files 1836→1857, duplicate copies 211→232, logical modules 1625→1625). The nightly
// +1-3 creep had the same cause: every nightly bundle re-resolves latest transitive deps, and
// hoisting shifts add/remove nested duplicates. The logical metric is immune to that entire noise
// class, catches what the guard exists for (bit loading MORE CODE), and converges for both
// flavors (repo .pnpm layout and released hoisted bundle) — so it needs no drift headroom.
// Measured logical baselines (2026/08/11): 1625 (2.0.33/2.0.35), 1634 (2.0.74 macOS),
// 1645 (2.0.74 released linux-x64 bundle in a clean container, a superset fixture of CI's).
// Every run also prints a physical/logical/duplication report line; once CI logs accumulate the
// true CI baselines, tighten this to measured + ~30.
const MAX_LOGICAL_MODULES_STATUS = 1700;
// Second guard: DUPLICATE COPIES (physical files minus logical modules). The logical metric alone
// is blind to duplication — if bit starts loading two copies/versions of the same package (real
// extra I/O, memory, and potential instanceof bugs), logical modules stay flat. Duplication was a
// core motivation for this e2e test in the first place, so it gets its own ceiling. Unlike the
// logical metric this one IS exposed to hoisting-layout drift (the released bundle's baseline
// crept +1-3 per nightly), so it needs headroom: measured baselines (2026/08/11) are 211 (2.0.33),
// 232 (2.0.35), ~233 (2.0.74 linux bundle), and the repo `.pnpm` flavor is lower. The ceiling
// catches a duplication explosion (e.g. a whole second copy of a dependency tree) and bounds the
// slow creep, while the per-run report line tracks the trend. On failure, the error names the
// most-duplicated packages and their install locations. Tighten alongside the logical threshold
// once CI report lines establish per-environment baselines.
const MAX_DUPLICATE_COPIES_STATUS = 350;

/**
 * as of now (2026/08/08) ~1,072 files are loaded during bit-bootstrap (recent additions: the
 * ci-sync commands, harmony 0.4.12's dist layout, and the global-virtual-store bridge - the
 * bridge module plus one .modules.yaml read per install root).
 * for "bit status", around 1,433 files are loaded when running from the repo; the released
 * hoisted bundle loads ~1,540 (its node_modules layout duplicates some packages).
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
        // sanity check that the BIT_DEBUG_READ_FILE mechanism produced the expected output
        expect(output).to.have.string('package.json');
        expect(output).to.have.string('node_modules');
        const numberOfReads = getNumberOfReads(output);
        expect(numberOfReads, 'no "#<num>" read lines found in the output').to.be.greaterThan(0);
        if (numberOfReads >= MAX_FILES_READ) {
          throw new Error(
            buildExceededError('bit-bootstrap', numberOfReads, MAX_FILES_READ, getNewlyLoadedFiles(output))
          );
        }
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
      it('should not exceed a reasonable logical-module count', () => {
        const output = helper.command.runCmd('bit status', undefined, undefined, undefined, undefined, {
          BIT_DEBUG_READ_FILE: 'true',
        });
        const numberOfReads = getNumberOfReads(output);
        const { linesFromBitInstallation } = getLinesFromBitInstallation(output);
        const physicalFiles = _.uniq(linesFromBitInstallation);
        const logicalModules = toLogicalModules(linesFromBitInstallation);
        const duplicateCopies = physicalFiles.length - logicalModules.length;
        // always print the metrics: CI logs accumulate the true per-environment baselines
        // (repo flavor in e2e_test, released bundle in e2e_test_bbit), enabling threshold
        // tightening from measurements instead of projections, and keeping duplication trends
        // visible below the ceiling.
        console.log(
          `bit status filesystem-read report: total reads ${numberOfReads}, ` +
            `physical files ${physicalFiles.length}, logical modules ${logicalModules.length}, ` +
            `duplicate copies ${duplicateCopies}`
        );
        if (logicalModules.length >= MAX_LOGICAL_MODULES_STATUS) {
          // the snapshot is generated offline and is a superset of what CI's leaner fixture
          // reads, so the diff below can in principle miss a module that exists in the snapshot
          // but is newly-read on CI. printing the full current list on every failure closes that
          // gap: the red run itself carries the exact data to inspect and to regenerate a
          // perfect snapshot from.
          makeSnapshot(output, true);
          throw new Error(
            buildExceededError(
              'bit status',
              logicalModules.length,
              MAX_LOGICAL_MODULES_STATUS,
              getNewlyLoadedModules(logicalModules, 'files-snapshot-status.txt')
            )
          );
        }
        // checked after the logical guard: when a change adds both new modules and duplication,
        // the logical failure (which names the new modules) is the more root-cause signal.
        if (duplicateCopies >= MAX_DUPLICATE_COPIES_STATUS) {
          throw new Error(buildDuplicationError(duplicateCopies, MAX_DUPLICATE_COPIES_STATUS, physicalFiles));
        }
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
        console.log(
          `bit status load time in milliseconds: ${Math.floor(timeInMs)} (max allowed: ${maxTimeInSeconds}s)`
        );
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

/**
 * builds a concise, readable failure message for when the file-count threshold is exceeded.
 * instead of dumping the entire command output (thousands of lines), it shows only the diff:
 * the files that are loaded now but were not present in the last snapshot.
 */
function buildExceededError(label: string, count: number, max: number, newFiles?: string[]): string {
  const lines = [`${label} loaded ${count} files/modules, exceeding the allowed maximum of ${max}.`];
  if (newFiles) {
    if (newFiles.length > 150) {
      // the run's node_modules layout doesn't match the snapshot's flavor (repo `.pnpm` layout vs
      // the released hoisted bundle), so a per-file diff would be pure noise. show a sample only.
      lines.push(
        `${newFiles.length} file(s) differ from the last snapshot — too many for a layout-compatible ` +
          'diff (the snapshot was likely generated from the other install flavor: repo vs released bundle).'
      );
      lines.push('First 20:');
      lines.push(...newFiles.slice(0, 20).map((file) => `  + ${file}`));
    } else if (newFiles.length) {
      lines.push(`The following ${newFiles.length} file(s) are loaded now but were not in the last snapshot:`);
      lines.push(...newFiles.map((file) => `  + ${file}`));
    } else {
      lines.push('No new files compared to the last snapshot (the increase comes from files read more than once).');
    }
  }
  lines.push(
    'If this increase is intentional, bump the threshold in filesystem-read.e2e.ts and regenerate ' +
      'the corresponding snapshot file in e2e/performance/ (see makeSnapshot()).'
  );
  return `\n${lines.join('\n')}`;
}

/**
 * returns the bit-installation files that are loaded now but were not present in the last snapshot.
 * used by the bootstrap guard, whose snapshot (files-snapshot.txt) holds raw installation paths.
 */
function getNewlyLoadedFiles(cmdOutput: string, snapshotFile = 'files-snapshot.txt'): string[] {
  const fromLastSnapshot = fs.readFileSync(path.join(__dirname, snapshotFile)).toString();
  const fromLastSnapshotLines = fromLastSnapshot.split('\n');
  const { linesFromBitInstallation } = getLinesFromBitInstallation(cmdOutput);
  return _.difference(linesFromBitInstallation, fromLastSnapshotLines);
}

/**
 * normalizes installation paths to logical module ids by stripping everything up to and including
 * the LAST 'node_modules/' — '.pnpm/fs-extra@11.1.0/node_modules/fs-extra/lib/copy.js' (repo
 * layout) and '@teambit/compilation.compiler-task/node_modules/fs-extra/lib/copy.js' (hoisted
 * bundle layout) both become 'fs-extra/lib/copy.js'. this makes the metric identical across
 * install flavors and immune to pnpm hoisting/layout drift, which duplicates physical copies of
 * the same module without bit loading any new code.
 */
function toLogicalModules(installationLines: string[]): string[] {
  return _.uniq(installationLines.map(toLogicalId));
}

function toLogicalId(installationPath: string): string {
  const nm = 'node_modules/';
  const idx = installationPath.lastIndexOf(nm);
  return idx >= 0 ? installationPath.slice(idx + nm.length) : installationPath;
}

/**
 * builds the failure message for the duplicate-copies ceiling: names the packages with the most
 * duplicated files and the distinct node_modules locations their copies load from, so the red run
 * points straight at the offending package instead of at a bare number.
 */
function buildDuplicationError(duplicateCopies: number, max: number, physicalFiles: string[]): string {
  const packageOfLogicalId = (logicalId: string): string => {
    const segments = logicalId.split('/');
    return logicalId.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  };
  const installLocationOf = (physicalPath: string): string => {
    const nm = 'node_modules/';
    const idx = physicalPath.lastIndexOf(nm);
    return idx > 0 ? physicalPath.slice(0, idx) : '<installation root>';
  };
  const filesByLogicalId = _.groupBy(physicalFiles, toLogicalId);
  const duplicatedFiles = Object.entries(filesByLogicalId).filter(([, copies]) => copies.length > 1);
  const duplicatesByPackage = _.groupBy(duplicatedFiles, ([logicalId]) => packageOfLogicalId(logicalId));
  const packageSummaries = Object.entries(duplicatesByPackage)
    .map(([packageName, entries]) => ({
      packageName,
      // count extra copies only (a file present in N locations contributes N-1 duplicates)
      extraCopies: _.sumBy(entries, ([, copies]) => copies.length - 1),
      locations: _.uniq(entries.flatMap(([, copies]) => copies.map(installLocationOf))).sort(),
    }))
    .sort((a, b) => b.extraCopies - a.extraCopies);
  const lines = [
    `bit status loaded ${duplicateCopies} duplicate module copies (physical files minus logical modules), ` +
      `exceeding the allowed maximum of ${max}.`,
    'The same module being read from multiple node_modules locations means bit loads redundant copies/versions ' +
      'of packages. Most-duplicated packages and the locations their copies load from:',
  ];
  packageSummaries.slice(0, 20).forEach(({ packageName, extraCopies, locations }) => {
    lines.push(`  ${packageName}: ${extraCopies} duplicate file read(s) from ${locations.length} locations:`);
    locations.slice(0, 5).forEach((location) => lines.push(`    - ${location}`));
    if (locations.length > 5) lines.push(`    - ... and ${locations.length - 5} more`);
  });
  if (packageSummaries.length > 20) {
    lines.push(`  ... and ${packageSummaries.length - 20} more packages with duplicates`);
  }
  lines.push(
    'If this duplication is expected (e.g. an intentional dependency-layout change), bump ' +
      'MAX_DUPLICATE_COPIES_STATUS in filesystem-read.e2e.ts.'
  );
  return `\n${lines.join('\n')}`;
}

/**
 * returns the logical modules loaded now that are not present in the last snapshot.
 * used by the bit-status guard, whose snapshot (files-snapshot-status.txt) holds logical ids.
 */
function getNewlyLoadedModules(logicalModules: string[], snapshotFile: string): string[] {
  const fromLastSnapshot = fs.readFileSync(path.join(__dirname, snapshotFile)).toString();
  return _.difference(logicalModules, fromLastSnapshot.split('\n'));
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
 * prints the current snapshot-format list. called automatically when the bit-status guard trips,
 * so every failure carries the data to regenerate its snapshot; can also be called manually when
 * a fresh baseline is needed. paste the output into files-snapshot.txt (bit --help / bootstrap,
 * raw installation paths — flavor-specific) or files-snapshot-status.txt (bit status, logical
 * module ids — flavor-independent, pass logical=true).
 */
function makeSnapshot(cmdOutput: string, logical = false) {
  const { linesFromBitInstallation } = getLinesFromBitInstallation(cmdOutput);
  const lines = logical ? toLogicalModules(linesFromBitInstallation) : linesFromBitInstallation;
  console.log('************** start snapshot **************');
  lines.forEach((line) => console.log(line));
  console.log('************** end snapshot ****************');
}
