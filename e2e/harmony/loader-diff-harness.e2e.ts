/**
 * Diff harness validation tests.
 *
 * The diff harness (BIT_LOADER_DIFF=1) runs two loader instances in parallel
 * and writes diffs to a JSONL log. In V1-vs-V1 mode, the log should contain
 * only header lines — any data lines mean either the snapshot is non-deterministic
 * or V1 has cold/hot-cache divergence we need to find before V2 is built.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

interface DiffLogLine {
  header?: boolean;
  callId?: number;
  operation?: string;
  ids?: string[];
  diff?: unknown;
  partnerError?: string;
}

function readDiffLog(logPath: string): DiffLogLine[] {
  if (!fs.existsSync(logPath)) return [];
  const content = fs.readFileSync(logPath, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map((line) => JSON.parse(line));
}

function dataLines(lines: DiffLogLine[]): DiffLogLine[] {
  return lines.filter((l) => !l.header);
}

describe('loader diff harness — V1-vs-V1 baseline', function () {
  this.timeout(0);
  let helper: Helper;
  let logPath: string;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  beforeEach(() => {
    // Unique path per test so parallel runs don't collide.
    logPath = path.join(os.tmpdir(), `bit-loader-diff-${process.pid}-${Date.now()}.jsonl`);
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  });

  describe('workspace with two new components', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
    });

    it('bit status writes a harness header and produces zero diffs', () => {
      helper.command.runCmd(`bit status`, helper.scopes.localPath, 'pipe', undefined, false, {
        BIT_LOADER_DIFF: '1',
        BIT_LOADER_DIFF_OUT: logPath,
      });
      const lines = readDiffLog(logPath);
      expect(
        lines.filter((l) => l.header),
        'expected at least one header line'
      ).to.have.length.greaterThan(0);
      expect(
        dataLines(lines),
        `expected zero diffs but got: ${JSON.stringify(dataLines(lines), null, 2)}`
      ).to.have.lengthOf(0);
    });
  });

  // TODO: re-enable once the harness's memory footprint is acceptable on workspaces
  // with scope state. Today, running two WorkspaceComponentLoader instances in parallel
  // doubles the cache footprint and can OOM Node's default 4GB heap even on tiny
  // workspaces. Likely needs a sampling mode or a lighter-weight partner.
  describe.skip('workspace with tagged + modified component', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.fs.appendFile('comp1/index.js', '\n// modified after tag');
    });

    it('bit status on a modified component produces zero diffs', () => {
      helper.command.runCmd(`bit status`, helper.scopes.localPath, 'pipe', undefined, false, {
        BIT_LOADER_DIFF: '1',
        BIT_LOADER_DIFF_OUT: logPath,
      });
      const lines = readDiffLog(logPath);
      expect(
        dataLines(lines),
        `expected zero diffs but got: ${JSON.stringify(dataLines(lines), null, 2)}`
      ).to.have.lengthOf(0);
    });
  });
});
