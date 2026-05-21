import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

describe('lane export skips main history objects', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('lane in scope-L with components in scope-C, main advances, merge main into lane', () => {
    let laneScope: string;
    let laneScopePath: string;
    let mainSnap1: string;
    let mainSnap2: string;
    let mainSnap3: string;
    let mainSnap4: string;
    let laneSnap: string;
    let mergeSnap: string;

    before(() => {
      // scope-C: components' home scope (default remote)
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // scope-L: the lane's home scope (separate)
      const newScope = helper.scopeHelper.getNewBareScope();
      laneScope = newScope.scopeName;
      laneScopePath = newScope.scopePath;
      helper.scopeHelper.addRemoteScope(laneScopePath);
      helper.scopeHelper.addRemoteScope(laneScopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, laneScopePath);

      // build several main snaps in scope-C
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      mainSnap1 = helper.command.getHead('comp1');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainSnap2 = helper.command.getHead('comp1');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainSnap3 = helper.command.getHead('comp1');
      helper.command.export();

      // create the lane in scope-L (off main, so its base is mainSnap3)
      helper.command.createLane('dev', `--scope ${laneScope}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      laneSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
      const laneWorkspace = helper.scopeHelper.cloneWorkspace();

      // main advances further (more snaps that the lane never saw)
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainSnap4 = helper.command.getHead('comp1');
      helper.command.export();

      // back to lane, pick up new main, merge main in (no squash; that's the default for lane->merge)
      helper.scopeHelper.getClonedWorkspace(laneWorkspace);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
      mergeSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
    });

    describe('what was pushed to lane scope (scope-L)', () => {
      it('should contain the merge snap', () => {
        expect(() => helper.command.catObject(mergeSnap, false, laneScopePath)).to.not.throw();
      });

      it('should contain the lane-only snap', () => {
        expect(() => helper.command.catObject(laneSnap, false, laneScopePath)).to.not.throw();
      });

      it('should NOT contain main snaps that the lane was based on', () => {
        expect(() => helper.command.catObject(mainSnap1, false, laneScopePath)).to.throw();
        expect(() => helper.command.catObject(mainSnap2, false, laneScopePath)).to.throw();
        expect(() => helper.command.catObject(mainSnap3, false, laneScopePath)).to.throw();
      });

      it('should NOT contain the new main snap that got merged in', () => {
        expect(() => helper.command.catObject(mainSnap4, false, laneScopePath)).to.throw();
      });
    });

    describe('what stayed on component home scope (scope-C)', () => {
      it('should still contain all main snaps', () => {
        expect(() => helper.command.catObject(mainSnap1, false, helper.scopes.remotePath)).to.not.throw();
        expect(() => helper.command.catObject(mainSnap2, false, helper.scopes.remotePath)).to.not.throw();
        expect(() => helper.command.catObject(mainSnap3, false, helper.scopes.remotePath)).to.not.throw();
        expect(() => helper.command.catObject(mainSnap4, false, helper.scopes.remotePath)).to.not.throw();
      });
    });

    describe('fresh consumer imports the lane', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(laneScopePath);
        helper.command.runCmd(`bit lane import ${laneScope}/dev -x`);
      });

      it('bit status should not throw', () => {
        expect(() => helper.command.status()).to.not.throw();
      });

      it('checkout HEAD should not throw', () => {
        expect(() => helper.command.checkoutHead()).to.not.throw();
      });

      it('bit log should not throw and should show the full history including main snaps', () => {
        // bit log walks parents into main history. lane scope does not have those snaps,
        // so the read path must fetch them from each component's home scope (scope-C)
        // transparently. importMissingHistory is server-side; this fallback is client-side.
        let log;
        expect(() => {
          log = helper.command.logParsed('comp1');
        }).to.not.throw();
        const hashes = log.map((l: any) => l.hash);
        expect(hashes).to.include(mergeSnap);
        expect(hashes).to.include(laneSnap);
        expect(hashes).to.include(mainSnap4);
        // pre-lane main history should also be reachable
        expect(hashes).to.include(mainSnap3);
        expect(hashes).to.include(mainSnap2);
        expect(hashes).to.include(mainSnap1);
      });
    });
  });

  describe('sanity: regular (non-merge) lane export still includes lane-only history fully', () => {
    let laneScope: string;
    let laneScopePath: string;
    let snap1: string;
    let snap2: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const newScope = helper.scopeHelper.getNewBareScope();
      laneScope = newScope.scopeName;
      laneScopePath = newScope.scopePath;
      helper.scopeHelper.addRemoteScope(laneScopePath);
      helper.scopeHelper.addRemoteScope(laneScopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, laneScopePath);

      // create a lane right away (no main tags), so all snaps are lane-origin
      helper.command.createLane('dev', `--scope ${laneScope}`);
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      snap1 = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      snap2 = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
    });

    it('lane scope should contain all lane-origin snaps', () => {
      expect(() => helper.command.catObject(snap1, false, laneScopePath)).to.not.throw();
      expect(() => helper.command.catObject(snap2, false, laneScopePath)).to.not.throw();
    });
  });

  describe('sanity: existing main-merge with no scope split still works (lane and components share scope)', () => {
    let mainSnap: string;
    let mergeSnap: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      mainSnap = helper.command.getHead('comp1');
      helper.command.export();

      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      const laneWorkspace = helper.scopeHelper.cloneWorkspace();

      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(laneWorkspace);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
      mergeSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
    });

    it('the shared remote scope should contain both the merge snap and the old main snap (same-scope case)', () => {
      // When lane scope == component scope, filtering by origin doesn't apply: everything already
      // belongs to this scope. Both objects should be present.
      expect(() => helper.command.catObject(mergeSnap, false, helper.scopes.remotePath)).to.not.throw();
      expect(() => helper.command.catObject(mainSnap, false, helper.scopes.remotePath)).to.not.throw();
    });

    it('bit log should work without errors', () => {
      expect(() => helper.command.logParsed('comp1')).to.not.throw();
    });
  });
});
