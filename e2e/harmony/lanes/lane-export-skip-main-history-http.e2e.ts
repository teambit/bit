/* eslint no-console: 0 */
import chai, { expect } from 'chai';
import type { ChildProcess } from 'child_process';
import childProcess from 'child_process';
import chaiFs from 'chai-fs';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(chaiFs);

const HTTP_READY_MSG = 'UI server of teambit.scope/scope is listening to port';
const HTTP_READY_TIMEOUT_MS = 120_000; // 2 min — mirrors e2e/http-helper.ts

/**
 * Spawn `bit start` in an arbitrary scope path on a chosen port. Yields a process handle
 * and a kill function. We can't reuse e2e/http-helper because it hardcodes the default
 * remote scope path and port 3000.
 *
 * Rejects with a clear error if the ready message doesn't appear within
 * HTTP_READY_TIMEOUT_MS — without this, a regression in the server's startup log would
 * hang the suite indefinitely (`this.timeout(0)` is set on the describe).
 */
function startBitServerInScope(bitBin: string, cwd: string, port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn(bitBin, ['start', '--port', String(port), '--verbose', '--log'], { cwd });
    let stderrData = '';
    const timer = setTimeout(() => {
      proc.kill('SIGINT');
      reject(
        new Error(
          `bit start did not print the ready message within ${HTTP_READY_TIMEOUT_MS}ms.\n` +
            `expected: "${HTTP_READY_MSG}"\nstderr so far:\n${stderrData}`
        )
      );
    }, HTTP_READY_TIMEOUT_MS);
    proc.stdout?.on('data', (data) => {
      if (data.toString().includes(HTTP_READY_MSG)) {
        clearTimeout(timer);
        resolve(proc);
      }
    });
    proc.stderr?.on('data', (data) => {
      stderrData += data.toString();
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      reject(new Error(`bit start exited with code ${code}\n${stderrData}`));
    });
  });
}

function killProc(proc: ChildProcess) {
  if (process.platform === 'win32' && proc.pid) {
    childProcess.execSync(`taskkill /pid ${proc.pid.toString()} /f /t`);
  } else {
    proc.kill('SIGINT');
  }
}

// @TODO: fix for Windows
(IS_WINDOWS ? describe.skip : describe)('lane export skips main history — HTTP protocol', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('lane scope served over HTTP, components home scope on fs', () => {
    let laneScope: string;
    let laneScopePath: string;
    let laneProc: ChildProcess;
    let mainSnap1: string;
    let mainSnap2: string;
    let laneSnap: string;
    let mergeSnap: string;
    const lanePort = 3110;

    before(async () => {
      // scope-C (default remote) = components' home scope, served via filesystem
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // scope-L = lane scope, served via HTTP
      const newScope = helper.scopeHelper.getNewBareScope('-lane-http');
      laneScope = newScope.scopeName;
      laneScopePath = newScope.scopePath;
      helper.scopeHelper.addRemoteScope(laneScopePath);
      helper.scopeHelper.addRemoteScope(laneScopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, laneScopePath);

      // build main history and export to home scope (file://)
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      mainSnap1 = helper.command.getHead('comp1');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainSnap2 = helper.command.getHead('comp1');
      helper.command.export();

      // create the lane in scope-L, snap, export (still file://)
      helper.command.createLane('dev', `--scope ${laneScope}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      laneSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
      const laneWs = helper.scopeHelper.cloneWorkspace();

      // main advances, merge into lane, then re-export the lane — this time over HTTP
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(laneWs);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
      mergeSnap = helper.command.getHeadOfLane('dev', 'comp1');

      // start HTTP server on the lane scope, swap workspace's lane remote to HTTP, then export
      laneProc = await startBitServerInScope(helper.command.bitBin, laneScopePath, lanePort);
      helper.scopeHelper.removeRemoteScope(laneScope);
      helper.command.runCmd(`bit remote add http://localhost:${lanePort}`);
      helper.command.export();
    });

    after(() => {
      if (laneProc) killProc(laneProc);
    });

    it('the HTTP-served lane scope should hold the merge and lane snaps', () => {
      expect(() => helper.command.catObject(mergeSnap, false, laneScopePath)).to.not.throw();
      expect(() => helper.command.catObject(laneSnap, false, laneScopePath)).to.not.throw();
    });

    it('the HTTP-served lane scope should NOT contain pre-lane main Version objects', () => {
      // mainSnap1 (0.0.1) is older than any home-scope head at export time. Nothing pulls it.
      // mainSnap2 (0.0.2) WAS the home-scope head at the first lane export, so the lean-fetch
      // pulled it as the head Version — same behavior as the fs variant. The chain stays on
      // the home scope; only the latest head at each export point is fetched.
      expect(() => helper.command.catObject(mainSnap1, false, laneScopePath)).to.throw();
    });

    describe('fresh consumer imports the lane over HTTP', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        // home scope on fs, lane scope on HTTP
        helper.scopeHelper.addRemoteScope();
        helper.command.runCmd(`bit remote add http://localhost:${lanePort}`);
        helper.command.runCmd(`bit lane import ${laneScope}/dev -x`);
      });

      it('bit status should not throw', () => {
        expect(() => helper.command.status()).to.not.throw();
      });

      it('bit log should reach into main history transparently (fetched from home scope)', () => {
        const log = helper.command.logParsed('comp1');
        const hashes = log.map((l: any) => l.hash);
        expect(hashes).to.include(mergeSnap);
        expect(hashes).to.include(laneSnap);
        expect(hashes).to.include(mainSnap1);
        expect(hashes).to.include(mainSnap2);
      });
    });
  });
});
