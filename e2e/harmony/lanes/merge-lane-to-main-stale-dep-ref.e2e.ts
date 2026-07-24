import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

/**
 * When merging a lane to main, the squash rewrites each component's parent chain and drops the
 * intermediate snaps. If a component's head still pins a non-head (now dropped) snap of a dependency
 * — e.g. the dependency advanced but the dependent was not re-snapped — that snap is no longer part
 * of the dependency's exported history. On a lean lane (lane hosted in a separate scope) it lives
 * only on the lane scope, so exporting the merged result to the components' home scope would omit it
 * and the remote's dependency-integrity check would fail with "... was not found".
 *
 * The merge imports any such missing snap from the lane scope, and the export ships it alongside the
 * heads.
 */
describe('merge lane to main when a component pins a non-head (squashed-out) snap of its dependency', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  /**
   * Builds a lean lane where comp1 pins comp2@snapA while comp2 advances to snapB (comp1 is not
   * re-snapped, thanks to --skip-auto-snap). Returns the lane scope name and comp2@snapA.
   * comp2 gets real file changes on each snap, so snapA references file objects that exist in no
   * other version — the merge must fetch them (not only the Version object) from the lane scope.
   */
  function setupLaneWithStaleRef(): { laneScopeName: string; laneScopePath: string; comp2SnapA: string } {
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.fixtures.populateComponents(2); // comp1 depends on comp2
    helper.command.tagAllWithoutBuild();
    helper.command.export();

    const laneScope = helper.scopeHelper.getNewBareScope();
    helper.scopeHelper.addRemoteScope(laneScope.scopePath);
    helper.command.createLane();
    helper.command.changeLaneScope(laneScope.scopeName);

    helper.fs.outputFile('comp2/index.js', `module.exports = () => 'comp2 snapA';`);
    helper.command.snapAllComponentsWithoutBuild('--unmodified'); // comp1 pins comp2@snapA
    const comp2SnapA = helper.command.getHeadOfLane('dev', 'comp2');
    helper.command.export();

    // comp2 advances to snapB without auto-snapping comp1, so comp1 keeps pinning comp2@snapA
    helper.fs.outputFile('comp2/index.js', `module.exports = () => 'comp2 snapB';`);
    helper.command.snapComponentWithoutBuild('comp2', '--skip-auto-snap');
    helper.command.export();

    return { laneScopeName: laneScope.scopeName, laneScopePath: laneScope.scopePath, comp2SnapA };
  }

  describe('the referenced snap is present locally in the merging workspace', () => {
    let laneScopeName: string;
    before(() => {
      ({ laneScopeName } = setupLaneWithStaleRef());
      helper.command.switchLocalLane('main');
      helper.command.mergeLaneWithoutBuild(`${laneScopeName}/dev`);
    });
    it('should export the merged result without a missing-dependency error', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });

  describe('the stale pinned dependency lives in another scope (cross-scope pin)', () => {
    let anotherRemote: string;
    let anotherRemotePath: string;
    let laneScopeName: string;
    let comp2SnapA: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const newScope = helper.scopeHelper.getNewBareScope();
      anotherRemote = newScope.scopeName;
      anotherRemotePath = newScope.scopePath;
      // wire every scope to know every other scope
      helper.scopeHelper.addRemoteScope(anotherRemotePath);
      helper.scopeHelper.addRemoteScope(anotherRemotePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, anotherRemotePath);
      helper.fixtures.populateComponents(2, false, '', false);
      helper.command.setScope(anotherRemote, 'comp2'); // comp1 (remote) -> comp2 (anotherRemote)
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      const laneScope = helper.scopeHelper.getNewBareScope();
      laneScopeName = laneScope.scopeName;
      helper.scopeHelper.addRemoteScope(laneScope.scopePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, laneScope.scopePath);
      helper.scopeHelper.addRemoteScope(anotherRemotePath, laneScope.scopePath);
      helper.command.createLane();
      helper.command.changeLaneScope(laneScopeName);

      helper.fs.outputFile('comp2/index.js', `module.exports = () => 'comp2 snapA';`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // comp1 pins comp2@snapA
      comp2SnapA = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.export();

      helper.fs.outputFile('comp2/index.js', `module.exports = () => 'comp2 snapB';`);
      helper.command.snapComponentWithoutBuild('comp2', '--skip-auto-snap');
      helper.command.export();

      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLaneWithoutBuild(`${laneScopeName}/dev`, '-x');
    });
    it('the export should succeed — the remote integrity check skips cross-scope deps', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
    it('the stale snap should not exist on the dependency home scope, only on the lane scope', () => {
      expect(() => helper.command.catObject(comp2SnapA, false, anotherRemotePath)).to.throw();
    });
    // KNOWN LIMITATION (pre-existing, not introduced by the stale-ref fix): the squash orphans a
    // cross-scope pinned snap — it remains only on the lane scope, and nothing on main points there.
    // day-to-day consumption is unaffected (import/status tolerate the missing dep version), but the
    // pinned version itself is unfetchable: its home scope never received it and the fetch-missing-deps
    // mechanism asks that home scope, not the lane scope. shipping such snaps to the dependency's home
    // scope would require the export to look across per-scope batches — a possible future enhancement.
    describe('importing the dependent component later from a fresh workspace', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(anotherRemotePath);
        // the lane scope is deliberately not configured — after the merge to main, consumers of the
        // component do not know (and should not need to know) the lane it was developed on.
      });
      it('bit import of the dependent should work — the missing pinned dep version is tolerated', () => {
        const output = helper.command.import(`${helper.scopes.remote}/comp1`);
        expect(output).to.have.string('successfully');
      });
      it('bit status should not report invalid components', () => {
        const status = helper.command.statusJson();
        expect(status.invalidComponents).to.have.lengthOf(0);
      });
      it('bit import --dependencies should work — the missing pinned dep version is skipped silently', () => {
        expect(() => helper.command.import(`${helper.scopes.remote}/comp1 --dependencies --override`)).to.not.throw();
      });
      it('importing the pinned dep version explicitly should soft-fail as missing and not fetch it', () => {
        const output = helper.command.import(`${anotherRemote}/comp2@${comp2SnapA}`);
        expect(output).to.have.string('missing components');
        expect(output).to.have.string(`${anotherRemote}/comp2`);
        expect(() => helper.command.catObject(comp2SnapA)).to.throw();
      });
    });
  });

  describe('the referenced snap is only on the lane scope (fresh import; not local before the merge)', () => {
    let laneScopeName: string;
    let laneScopePath: string;
    let comp2SnapA: string;
    before(() => {
      ({ laneScopeName, laneScopePath, comp2SnapA } = setupLaneWithStaleRef());
      // fresh workspace that imports the lane leanly -> comp2@snapA is not present locally
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addRemoteScope(laneScopePath);
      helper.command.runCmd(`bit lane import ${laneScopeName}/dev -x`);
    });
    it('the referenced snap should not be present locally before the merge', () => {
      expect(() => helper.command.catObject(comp2SnapA)).to.throw();
    });
    it('the merge should import it from the lane scope and the export should succeed', () => {
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLaneWithoutBuild(`${laneScopeName}/dev`, '--ignore-config-changes -x');
      expect(() => helper.command.export()).to.not.throw();
    });
  });
});
