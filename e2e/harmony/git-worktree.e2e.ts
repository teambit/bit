import chai, { expect } from 'chai';
import chaiFs from 'chai-fs';
import * as path from 'path';
import fs from 'fs-extra';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(chaiFs);

/**
 * E2E for running bit commands inside a git worktree.
 *
 * In a worktree, `.git` is a FILE containing a `gitdir: <main>/.git/worktrees/<name>` pointer
 * rather than a directory. Bit used to blindly compose `.git/bit` and crash with
 * `ENOTDIR: not a directory, open '.git/bit/unmerged.json'`.
 *
 * The supported model: a worktree is treated like a non-git (standalone) workspace — its scope is a
 * self-contained `.bit` inside the worktree, starting empty like a fresh clone. The first bit command
 * auto-initializes it, the committed `.gitignore` (which Bit writes with a `.bit` entry) keeps it out
 * of git, and `git worktree remove` deletes it together with the worktree directory.
 */
describe('git worktree support', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  // tag+export `numComponents` components into a git workspace and make the initial commit, so a
  // worktree can be branched off it. `.bit` is gitignored to keep the worktrees' scopes out of git.
  function initGitWorkspaceWithExportedComponents(numComponents: number, gitIgnore: string[]) {
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.git.initNewGitRepo(true);
    helper.fixtures.populateComponents(numComponents);
    helper.command.tagAllWithoutBuild();
    helper.command.export();
    helper.git.writeGitIgnore(gitIgnore);
    helper.command.runCmd('git add .');
    helper.command.runCmd('git commit -m "initial commit"');
  }

  describe('running bit commands from a git worktree', () => {
    let worktreePath: string;
    let firstBitCommandOutput: string;

    before(() => {
      initGitWorkspaceWithExportedComponents(2, ['node_modules/', '.bit/']);

      worktreePath = `${helper.scopes.localPath}-worktree`;
      helper.git.addWorktree(worktreePath, 'feature-branch');

      // the first bit command in the worktree. it should auto-init an empty ".bit" scope inside the
      // worktree (same as the fresh-clone flow). registering the remote is needed anyway for the new
      // scope to be able to import objects.
      firstBitCommandOutput = helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, worktreePath);
    });

    after(() => {
      if (fs.existsSync(worktreePath)) {
        helper.git.removeWorktree(worktreePath);
      }
    });

    it('the worktree should have .git as a file, not a directory (sanity)', () => {
      const dotGit = path.join(worktreePath, '.git');
      expect(fs.statSync(dotGit).isFile()).to.be.true;
    });

    it('the first bit command should not throw ENOTDIR', () => {
      expect(firstBitCommandOutput).to.not.include('ENOTDIR');
    });

    it('should auto-init a standalone ".bit" scope inside the worktree (never compose .git/bit)', () => {
      expect(path.join(worktreePath, '.bit', 'objects')).to.be.a.directory();
      expect(path.join(worktreePath, '.bit', 'scope.json')).to.be.a.file();
    });

    describe('bit import and bit status in the worktree', () => {
      let statusOutput: string;
      before(() => {
        helper.command.runCmd('bit import', worktreePath);
        statusOutput = helper.command.runCmd('bit status', worktreePath);
      });

      it('bit status should run successfully (no ENOTDIR crash)', () => {
        expect(statusOutput).to.not.include('ENOTDIR');
      });

      it('bit list should show the components with their exported version', () => {
        const list: Record<string, any>[] = JSON.parse(helper.command.runCmd('bit list --json', worktreePath));
        expect(list).to.have.lengthOf(2);
        const comp1 = list.find((c) => c.id.includes('comp1'));
        expect(comp1?.currentVersion).to.equal('0.0.1');
      });
    });

    describe('snapping in the worktree', () => {
      let mainHeadBeforeSnap: string;
      before(() => {
        mainHeadBeforeSnap = helper.command.getHead('comp1');
        // the worktree is a fresh checkout without node_modules. link the workspace components
        // so comp1's dependency on comp2 is resolvable.
        helper.command.runCmd('bit link', worktreePath);
        fs.outputFileSync(path.join(worktreePath, 'comp1', 'worktree-change.js'), 'console.log("from worktree");');
        helper.command.runCmd('bit snap comp1 --message "snap from worktree"', worktreePath);
      });

      it('the snap should land in the worktree scope', () => {
        const worktreeHead = helper.command.getHead('comp1', worktreePath);
        expect(worktreeHead).to.not.equal(mainHeadBeforeSnap);
      });

      it('the main workspace scope should be unaffected', () => {
        const mainHeadAfterSnap = helper.command.getHead('comp1');
        expect(mainHeadAfterSnap).to.equal(mainHeadBeforeSnap);
      });

      it('the main workspace status should remain clean', () => {
        helper.command.expectStatusToBeClean();
      });
    });

    describe('lanes are independent per worktree', () => {
      before(() => {
        helper.command.runCmd('bit lane create worktree-lane', worktreePath);
      });

      it('the worktree should be on the new lane', () => {
        const worktreeLanes = JSON.parse(helper.command.runCmd('bit lane list --json', worktreePath));
        expect(worktreeLanes.currentLane).to.equal('worktree-lane');
      });

      it('the main workspace should stay on main and not know the lane', () => {
        const mainLanes = helper.command.listLanesParsed();
        expect(mainLanes.currentLane).to.equal('main');
        const laneNames = mainLanes.lanes.map((lane: any) => lane.name || lane.id?.name);
        expect(laneNames).to.not.include('worktree-lane');
      });
    });

    describe('git worktree remove cleans up the scope', () => {
      before(() => {
        helper.git.removeWorktree(worktreePath);
        helper.command.runCmd('git worktree prune');
      });

      it('the worktree directory (including its .bit scope) should be gone', () => {
        expect(fs.existsSync(worktreePath)).to.be.false;
      });
    });
  });

  /**
   * a worktree created INSIDE the main workspace directory is a hard boundary for scope resolution:
   * before its own scope is initialized, bit must NOT walk up and pick the main workspace's scope
   * (a `bit init --reset-scope` would then wipe the main scope).
   */
  describe('a worktree nested inside the main workspace directory', () => {
    let nestedWorktreePath: string;
    let mainScopeObjectsPath: string;

    before(() => {
      initGitWorkspaceWithExportedComponents(1, ['node_modules/', '.bit/', 'nested-wt/']);

      nestedWorktreePath = path.join(helper.scopes.localPath, 'nested-wt');
      helper.git.addWorktree(nestedWorktreePath, 'nested-branch');
      // the main workspace ran `bit init` before `git init`, so its scope is a standalone ".bit".
      mainScopeObjectsPath = path.join(helper.scopes.localPath, '.bit', 'objects');
    });

    it('bit init --reset-scope as the first command in the fresh worktree should not wipe the main scope', () => {
      // depending on whether consumer creation persisted the worktree scope first, this either resets
      // the worktree's own (empty) scope or errors with "scope not found". either way, the main
      // workspace's scope must never be picked by the walk-up and wiped.
      helper.general.runWithTryCatch('bit init --reset-scope', nestedWorktreePath);
      expect(mainScopeObjectsPath).to.be.a.directory().and.not.empty;
    });

    it('bit commands in the nested worktree should use its own scope, not the main one', () => {
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, nestedWorktreePath);
      helper.command.runCmd('bit import', nestedWorktreePath);
      helper.command.runCmd('bit status', nestedWorktreePath);
      expect(path.join(nestedWorktreePath, '.bit', 'objects')).to.be.a.directory();
      expect(mainScopeObjectsPath).to.be.a.directory().and.not.empty;
    });
  });
});
