/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

/**
 * Cascade behavior on a lane that has `updateDependents` (hidden `skipWorkspace: true` entries).
 * The seed step uses `helper.snapping.snapFromScope` — an in-process call to
 * `SnappingMain.snapFromScope` against a bare scope, which is what produces those entries.
 *
 * The two sides being exercised:
 *  1. Local `bit snap` on a lane with existing `updateDependents` folds the affected entries
 *     into the same snap pass, producing one Version per cascaded component (scenarios 1, 5, 6).
 *  2. The bare-scope "snap updates" path also re-snaps any entries in `lane.components` that
 *     depend on the new updateDependent, so the lane doesn't end up with
 *     `compA@lane.components -> compB@main` once `compB` enters `lane.updateDependents`
 *     (scenario 4).
 *
 * Divergence/merge-resolution (scenario 3 inner block) is pending a design decision on how
 * "parent = main head" updateDependents should interact with reset/re-snap and remote merge.
 */
describe('local snap cascades updateDependents on the lane', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  /**
   * Common starting state used by every scenario:
   *   main:  comp1@0.0.1 -> comp2@0.0.1 -> comp3@0.0.1
   *   lane `dev` on remote:
   *     components:        [ comp3@<comp3HeadOnLaneInitial> ]
   *     updateDependents:  [ comp2@<comp2InUpdDepInitial>    ]
   */
  async function buildBaseRemoteState(): Promise<{
    comp3HeadOnLaneInitial: string;
    comp2InUpdDepInitial: string;
  }> {
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.fixtures.populateComponents(3);
    helper.command.tagAllWithoutBuild();
    helper.command.export();
    helper.command.createLane();
    helper.command.snapComponentWithoutBuild('comp3', '--skip-auto-snap --unmodified');
    helper.command.export();
    const comp3HeadOnLaneInitial = helper.command.getHeadOfLane('dev', 'comp3');

    const bareSnap = helper.scopeHelper.getNewBareScope('-bare-seed-updep');
    helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap.scopePath);
    await helper.snapping.snapFromScope(
      bareSnap.scopePath,
      [{ componentId: `${helper.scopes.remote}/comp2`, message: 'initial update-dependent' }],
      { lane: `${helper.scopes.remote}/dev`, updateDependents: true, push: true }
    );

    const lane = helper.command.catLane('dev', helper.scopes.remotePath);
    const comp2InUpdDepInitial = lane.updateDependents[0].split('@')[1];
    return { comp3HeadOnLaneInitial, comp2InUpdDepInitial };
  }

  // ---------------------------------------------------------------------------------------------
  // Scenario 1: basic cascade — workspace has only comp3, snaps it, comp2 (in updateDependents)
  // should be auto-re-snapped with the new comp3 version, and the parent chain should be intact.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 1: workspace has the lane component only (no workspace dependents)', () => {
    let comp3HeadOnLaneInitial: string;
    let comp2InUpdDepInitial: string;
    let comp3HeadAfterLocalSnap: string;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp3HeadOnLaneInitial = base.comp3HeadOnLaneInitial;
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      comp3HeadAfterLocalSnap = helper.command.getHeadOfLane('dev', 'comp3');
    });

    it('comp3 should have advanced on the lane', () => {
      expect(comp3HeadAfterLocalSnap).to.not.equal(comp3HeadOnLaneInitial);
    });

    it('comp2 in updateDependents should be re-snapped to a new hash', () => {
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(lane.updateDependents).to.have.lengthOf(1);
      const comp2NewVersion = lane.updateDependents[0].split('@')[1];
      expect(comp2NewVersion).to.not.equal(comp2InUpdDepInitial);
    });

    it('cascaded comp2 should point at the new comp3 head', () => {
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp2 = helper.command.catComponent(lane.updateDependents[0], helper.scopes.remotePath);
      const comp3Dep = comp2.dependencies.find((d) => d.id.name === 'comp3');
      expect(comp3Dep.id.version).to.equal(comp3HeadAfterLocalSnap);
    });

    it('comp2 should NOT appear in the workspace bitmap (still a hidden updateDependent)', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp2');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 4 (first "snap updates" click on a lane with existing lane.components that depend
  // on the new updateDependent): the workspace user has both compA and compC on the lane from the
  // start; compB lives only on main. When compA was snapped on the lane, its recorded dep on
  // compB was still compB@main because compB hadn't entered the lane yet.
  //
  // The first time the user clicks "snap updates" in the UI, compB is introduced into
  // `updateDependents`. After that click, compA on the lane should be re-snapped so its compB
  // dep points at the *new* updateDependent snap — otherwise compA keeps pointing at compB@main
  // and the lane's graph isn't internally consistent.
  // ---------------------------------------------------------------------------------------------
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'scenario 4: first snap-updates click re-snaps lane.components that depend on the new updateDependent',
    () => {
      let comp1InitialLaneSnap: string;
      let comp2NewHash: string;
      let npmCiRegistry: NpmCiRegistry;

      before(async () => {
        // Destroy the outer helper's temp dirs before swapping in a dot-scope helper, otherwise
        // the original instance's workspaces/scopes leak for the rest of the suite.
        helper.scopeHelper.destroy();
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.fixtures.populateComponents(3);
        helper.command.tagAllComponents();
        helper.command.export();

        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
        npmCiRegistry.setResolver();
        helper.command.createLane();
        helper.command.importComponent('comp1');
        helper.command.importComponent('comp3');
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.export();
        const laneBeforeSnapUpdates = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp1BeforeEntry = laneBeforeSnapUpdates.components.find((c) => c.id.name === 'comp1');
        expect(comp1BeforeEntry, 'comp1 must be on lane.components before snap-updates').to.exist;
        comp1InitialLaneSnap = comp1BeforeEntry.head;

        // Sanity-check the "bug" starting state: comp1's lane snap currently depends on
        // comp2@0.0.1 (main). The fix needs to rewrite this once snap-updates runs.
        const comp1BeforeObj = helper.command.catComponent(
          `${helper.scopes.remote}/comp1@${comp1InitialLaneSnap}`,
          helper.scopes.remotePath
        );
        const comp2DepBefore = comp1BeforeObj.dependencies.find((d) => d.id.name === 'comp2');
        expect(comp2DepBefore, 'comp1 must have a comp2 dep before snap-updates').to.exist;
        expect(comp2DepBefore.id.version, 'pre-snap-updates comp2 dep should be the main tag').to.equal('0.0.1');

        const bareSnap = helper.scopeHelper.getNewBareScope('-bare-snap-updates');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap.scopePath);
        await helper.snapping.snapFromScope(
          bareSnap.scopePath,
          [{ componentId: `${helper.scopes.remote}/comp2`, message: 'first snap-updates click' }],
          { lane: `${helper.scopes.remote}/dev`, updateDependents: true, push: true }
        );
        const laneAfterSnapUpdates = helper.command.catLane('dev', helper.scopes.remotePath);
        comp2NewHash = laneAfterSnapUpdates.updateDependents[0].split('@')[1];
      });
      after(() => {
        npmCiRegistry.destroy();
        // Destroy this scenario's dot-scope helper before swapping back, so its temp dirs
        // don't outlive the describe block.
        helper.scopeHelper.destroy();
        helper = new Helper();
      });

      it('comp2 (B) enters lane.updateDependents', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        expect(lane.updateDependents).to.have.lengthOf(1);
        expect(lane.updateDependents[0]).to.include('comp2');
      });

      it('comp1 (A) on the lane should be re-snapped with its comp2 dep pointing at the new updateDependent', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp1OnLane = lane.components.find((c) => c.id.name === 'comp1');
        expect(comp1OnLane, 'comp1 must still be in lane.components').to.exist;
        expect(comp1OnLane.head).to.not.equal(comp1InitialLaneSnap);

        const comp1 = helper.command.catComponent(
          `${helper.scopes.remote}/comp1@${comp1OnLane.head}`,
          helper.scopes.remotePath
        );
        const comp2Dep = comp1.dependencies.find((d) => d.id.name === 'comp2');
        expect(comp2Dep, 'comp1 should still declare a comp2 dep').to.exist;
        expect(comp2Dep.id.version).to.equal(comp2NewHash);
      });

      it('comp1 stays in lane.components (it was never a hidden updateDependent)', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp1InUpdDep = (lane.updateDependents || []).find((s) => s.includes('comp1'));
        expect(comp1InUpdDep, 'comp1 must NOT be in updateDependents').to.be.undefined;
      });
    }
  );

  // ---------------------------------------------------------------------------------------------
  // Scenario 5: transitive cascade inside updateDependents. Both comp1 and comp2 live in
  // updateDependents (comp1 depending on comp2, comp2 on comp3). When a local snap changes
  // comp3, the fixed-point expansion must cascade comp2 (direct dependent on comp3) AND comp1
  // (transitive dependent via comp2) — all in one pass, and comp1's comp2 dep must point at the
  // newly-cascaded comp2 hash, not the pre-cascade one.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 5: transitive cascade inside updateDependents', () => {
    let comp2InUpdDepInitial: string;
    let comp1InUpdDepInitial: string;
    let comp3HeadAfterLocalSnap: string;

    before(async () => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild('comp3', '--skip-auto-snap --unmodified');
      helper.command.export();

      // Seed comp2 first so comp1's comp2 dep resolves to the updDep hash (not the main tag).
      const bareSnap1 = helper.scopeHelper.getNewBareScope('-bare-seed-updep-comp2');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap1.scopePath);
      await helper.snapping.snapFromScope(
        bareSnap1.scopePath,
        [{ componentId: `${helper.scopes.remote}/comp2`, message: 'seed comp2' }],
        { lane: `${helper.scopes.remote}/dev`, updateDependents: true, push: true }
      );
      const laneAfterSeedComp2 = helper.command.catLane('dev', helper.scopes.remotePath);
      comp2InUpdDepInitial = laneAfterSeedComp2.updateDependents[0].split('@')[1];

      const bareSnap2 = helper.scopeHelper.getNewBareScope('-bare-seed-updep-comp1');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap2.scopePath);
      await helper.snapping.snapFromScope(
        bareSnap2.scopePath,
        [{ componentId: `${helper.scopes.remote}/comp1`, message: 'seed comp1' }],
        { lane: `${helper.scopes.remote}/dev`, updateDependents: true, push: true }
      );
      const laneAfterSeedComp1 = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp1Entry = laneAfterSeedComp1.updateDependents.find((s) => s.includes('comp1'));
      expect(comp1Entry, 'comp1 must have been seeded into updateDependents').to.exist;
      comp1InUpdDepInitial = (comp1Entry as string).split('@')[1];

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      comp3HeadAfterLocalSnap = helper.command.getHeadOfLane('dev', 'comp3');
    });

    it('both comp1 and comp2 are cascaded to new hashes in updateDependents', () => {
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(lane.updateDependents).to.have.lengthOf(2);
      const comp2New = lane.updateDependents.find((s) => s.includes('comp2'));
      const comp1New = lane.updateDependents.find((s) => s.includes('comp1'));
      expect(comp2New, 'comp2 must still be in updateDependents').to.exist;
      expect(comp1New, 'comp1 must still be in updateDependents').to.exist;
      expect((comp2New as string).split('@')[1]).to.not.equal(comp2InUpdDepInitial);
      expect((comp1New as string).split('@')[1]).to.not.equal(comp1InUpdDepInitial);
    });

    it('cascaded comp2 depends on the new comp3 head', () => {
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp2Str = lane.updateDependents.find((s) => s.includes('comp2')) as string;
      const comp2 = helper.command.catComponent(comp2Str, helper.scopes.remotePath);
      const comp3Dep = comp2.dependencies.find((d) => d.id.name === 'comp3');
      expect(comp3Dep.id.version).to.equal(comp3HeadAfterLocalSnap);
    });

    it('cascaded comp1 depends on the cascaded comp2 (not the old updDep comp2)', () => {
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp1Str = lane.updateDependents.find((s) => s.includes('comp1')) as string;
      const comp2Str = lane.updateDependents.find((s) => s.includes('comp2')) as string;
      const comp2NewHash = comp2Str.split('@')[1];
      const comp1 = helper.command.catComponent(comp1Str, helper.scopes.remotePath);
      const comp2Dep = comp1.dependencies.find((d) => d.id.name === 'comp2');
      expect(comp2Dep.id.version).to.equal(comp2NewHash);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 6: promote-on-import. A component in `updateDependents` is later imported into the
  // workspace and snapped directly. It should transition cleanly to `lane.components` and the
  // stale `updateDependents` entry must be cleared.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 6: promote-on-import — importing an updateDependent then snapping it moves it to lane.components', () => {
    let comp2InUpdDepInitial: string;

    before(async () => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild('comp3', '--skip-auto-snap --unmodified');
      helper.command.export();

      const bareSnap = helper.scopeHelper.getNewBareScope('-bare-seed-updep');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap.scopePath);
      await helper.snapping.snapFromScope(
        bareSnap.scopePath,
        [{ componentId: `${helper.scopes.remote}/comp2`, message: 'seed comp2' }],
        { lane: `${helper.scopes.remote}/dev`, updateDependents: true, push: true }
      );
      const initialLane = helper.command.catLane('dev', helper.scopes.remotePath);
      comp2InUpdDepInitial = initialLane.updateDependents[0].split('@')[1];

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');
      // Explicitly import comp2 — the "promote" step. After this, comp2 is tracked in the
      // workspace bitmap and is a first-class lane component candidate, not a hidden updDep.
      helper.command.importComponent('comp2');

      helper.fs.outputFile(`${helper.scopes.remote}/comp2/index.js`, "module.exports = () => 'comp2-v2';");
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });

    it('comp2 should be in lane.components with a fresh snap', () => {
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp2InComponents = lane.components.find((c) => c.id.name === 'comp2');
      expect(comp2InComponents, 'comp2 must be in lane.components').to.exist;
      expect((comp2InComponents as any).head).to.not.equal(comp2InUpdDepInitial);
    });

    it('comp2 should NOT appear in lane.updateDependents (the stale entry must be cleared)', () => {
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp2InUpdDep = (lane.updateDependents || []).find((s) => s.includes('comp2'));
      expect(comp2InUpdDep, 'comp2 must not be in updateDependents once it has been promoted').to.be.undefined;
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 3: two users diverge on the same lane — both locally snap comp3. The cascade must
  // produce comp2 snaps that diverge alongside comp3, and resolution (reset / merge) must work
  // on both comp3 AND the cascaded comp2.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 3: divergence — two users snap the same lane concurrently', () => {
    let userBPath: string;
    let comp2InUpdDepInitial: string;
    let comp2AfterUserAExport: string;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      // User B — clone of A's pre-snap state. Keep it aside.
      userBPath = helper.scopeHelper.cloneWorkspace();

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2-userA';");
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const laneAfterA = helper.command.catLane('dev', helper.scopes.remotePath);
      comp2AfterUserAExport = laneAfterA.updateDependents[0].split('@')[1];

      helper.scopeHelper.getClonedWorkspace(userBPath);
      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2-userB';");
      helper.command.snapAllComponentsWithoutBuild();
    });

    it('user A`s export should advance the comp2 entry in updateDependents past the initial state', () => {
      expect(comp2AfterUserAExport).to.not.equal(comp2InUpdDepInitial);
    });

    it('user B`s export should be rejected because the lane is diverged', () => {
      const exportCmd = () => helper.command.export();
      expect(exportCmd).to.throw(/diverged|merge|reset|update/i);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 7: import must not clobber a pending local cascade. `bit snap` rewrites
  // `updateDependents` locally and flags the lane with `overrideUpdateDependents=true` to signal
  // "these are pending, don't blow them away". A `bit fetch --lanes` between snap and export
  // must not wipe the cascaded hashes.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 7: local cascade survives a `bit fetch --lanes` before export', () => {
    let comp2InUpdDepInitial: string;
    let comp2AfterLocalSnap: string;
    let comp3HeadAfterLocalSnap: string;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();

      const laneAfterSnap = helper.command.catLane('dev');
      comp2AfterLocalSnap = laneAfterSnap.updateDependents[0].split('@')[1];
      comp3HeadAfterLocalSnap = helper.command.getHeadOfLane('dev', 'comp3');

      expect(comp2AfterLocalSnap).to.not.equal(comp2InUpdDepInitial);

      helper.command.fetchAllLanes();
    });

    it('local lane.updateDependents still points at the cascaded comp2 hash (not reverted to the remote version)', () => {
      const localLane = helper.command.catLane('dev');
      expect(localLane.updateDependents).to.have.lengthOf(1);
      const localComp2 = localLane.updateDependents[0].split('@')[1];
      expect(localComp2).to.equal(comp2AfterLocalSnap);
      expect(localComp2).to.not.equal(comp2InUpdDepInitial);
    });

    it('bit export still publishes the cascade to the remote afterward', () => {
      helper.command.export();
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      const remoteComp2 = remoteLane.updateDependents[0].split('@')[1];
      expect(remoteComp2).to.equal(comp2AfterLocalSnap);
      expect(remoteComp2).to.not.equal(comp2InUpdDepInitial);
    });

    it('cascaded comp2 on the remote points at the new comp3 head', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      const remoteComp2 = helper.command.catComponent(remoteLane.updateDependents[0], helper.scopes.remotePath);
      const comp3Dep = remoteComp2.dependencies.find((d) => d.id.name === 'comp3');
      expect(comp3Dep.id.version).to.equal(comp3HeadAfterLocalSnap);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 8: `bit reset` must revert the cascade, not just the user's direct snap. We capture
  // the pre-cascade `updateDependents` in `Lane.updateDependentsBeforeCascade` at cascade time,
  // and `reset` uses it to restore the lane to its pre-snap state end-to-end.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 8: bit reset reverts the cascade, not just the direct snap', () => {
    let comp2InUpdDepInitial: string;
    let comp3HeadBeforeLocalSnap: string;
    let laneAfterReset: Record<string, any>;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;
      comp3HeadBeforeLocalSnap = base.comp3HeadOnLaneInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();

      const laneAfterSnap = helper.command.catLane('dev');
      expect(laneAfterSnap.updateDependents[0].split('@')[1]).to.not.equal(comp2InUpdDepInitial);
      expect(laneAfterSnap.overrideUpdateDependents).to.equal(true);

      helper.command.resetAll();
      laneAfterReset = helper.command.catLane('dev');
    });

    it('comp3 on the lane should rewind to its pre-snap head', () => {
      const comp3OnLane = laneAfterReset.components.find((c) => c.id.name === 'comp3');
      expect(comp3OnLane.head).to.equal(comp3HeadBeforeLocalSnap);
    });

    it('lane.updateDependents should revert to the pre-cascade comp2 hash', () => {
      expect(laneAfterReset.updateDependents).to.have.lengthOf(1);
      const comp2After = laneAfterReset.updateDependents[0].split('@')[1];
      expect(comp2After).to.equal(comp2InUpdDepInitial);
    });

    it('overrideUpdateDependents should be cleared', () => {
      expect(laneAfterReset.overrideUpdateDependents).to.be.undefined;
    });

    it('a subsequent export should leave the remote lane unchanged from its pre-snap state', () => {
      helper.command.export();
      const remoteLaneAfter = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp3OnRemote = remoteLaneAfter.components.find((c) => c.id.name === 'comp3');
      expect(comp3OnRemote.head).to.equal(comp3HeadBeforeLocalSnap);
      expect(remoteLaneAfter.updateDependents).to.have.lengthOf(1);
      expect(remoteLaneAfter.updateDependents[0].split('@')[1]).to.equal(comp2InUpdDepInitial);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 9: `bit reset --head` after TWO consecutive local snaps must only rewind the LATEST
  // snap's cascade — the first snap's cascade must stay intact. This exercises the per-batch
  // history on the lane: the first snap's cascade entry must survive while the second snap's
  // cascade is rolled back, with `overrideUpdateDependents` still `true` (one cascade pending).
  // ---------------------------------------------------------------------------------------------
  describe('scenario 9: bit reset --head rewinds only the last snap, not both cascades', () => {
    let comp2InUpdDepInitial: string;
    let comp2AfterFirstSnap: string;
    let laneAfterResetHead: Record<string, any>;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();
      const laneAfterFirst = helper.command.catLane('dev');
      comp2AfterFirstSnap = laneAfterFirst.updateDependents[0].split('@')[1];

      expect(comp2AfterFirstSnap).to.not.equal(comp2InUpdDepInitial);

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v3';");
      helper.command.snapAllComponentsWithoutBuild();
      const laneAfterSecond = helper.command.catLane('dev');
      expect(laneAfterSecond.updateDependents[0].split('@')[1]).to.not.equal(comp2AfterFirstSnap);

      helper.command.resetAll('--head');
      laneAfterResetHead = helper.command.catLane('dev');
    });

    it('lane.updateDependents should point at the FIRST-snap cascade comp2 hash (not reverted to pre-cascade)', () => {
      expect(laneAfterResetHead.updateDependents).to.have.lengthOf(1);
      const comp2After = laneAfterResetHead.updateDependents[0].split('@')[1];
      expect(comp2After).to.equal(comp2AfterFirstSnap);
      expect(comp2After).to.not.equal(comp2InUpdDepInitial);
    });

    it('overrideUpdateDependents should remain true — the first cascade is still pending', () => {
      expect(laneAfterResetHead.overrideUpdateDependents).to.equal(true);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 11: `bit import` on a hidden updateDependent (no edit, no snap) must leave the
  // workspace consistent — bitmap presence, `bit status` not erroring, `bit list` reporting the
  // comp, and a clean export round-trip leaving the remote lane unchanged.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 11: bit import on a hidden updateDependent leaves the workspace consistent', () => {
    let comp2InUpdDepInitial: string;
    let comp3HeadOnLaneInitial: string;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;
      comp3HeadOnLaneInitial = base.comp3HeadOnLaneInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');

      helper.command.importComponent('comp2');
    });

    it('comp2 should land in the workspace bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('comp2');
    });

    it('bit status runs cleanly (no thrown errors, no merge-pending)', () => {
      const status = helper.command.statusJson();
      expect(status).to.be.an('object');
      expect(status.invalidComponents || []).to.have.lengthOf(0);
    });

    it('bit list reports comp2 with a resolvable version', () => {
      const list = helper.command.listLocalScopeParsed();
      const comp2 = list.find((c: Record<string, any>) => c.id.includes('/comp2'));
      expect(comp2, 'comp2 should appear in `bit list`').to.exist;
    });

    it('comp2 stays in lane.updateDependents on the remote (import alone does not promote)', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(remoteLane.updateDependents).to.have.lengthOf(1);
      expect(remoteLane.updateDependents[0].split('@')[1]).to.equal(comp2InUpdDepInitial);
    });

    it('the lane`s visible components list still has comp3 only (no leak from the import)', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(remoteLane.components).to.have.lengthOf(1);
      const comp3OnLane = remoteLane.components.find((c) => c.id.name === 'comp3');
      expect(comp3OnLane, 'comp3 must stay on lane.components').to.exist;
      expect(comp3OnLane.head).to.equal(comp3HeadOnLaneInitial);
    });

    it('a no-op export after the import leaves the remote lane untouched', () => {
      try {
        helper.command.export();
      } catch (err: any) {
        if (!String(err?.message || err).match(/nothing to export/i)) throw err;
      }
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(remoteLane.updateDependents).to.have.lengthOf(1);
      expect(remoteLane.updateDependents[0].split('@')[1]).to.equal(comp2InUpdDepInitial);
      expect(remoteLane.components).to.have.lengthOf(1);
      const comp3OnLane = remoteLane.components.find((c) => c.id.name === 'comp3');
      expect(comp3OnLane.head).to.equal(comp3HeadOnLaneInitial);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 12: `bit status` must run cleanly after `bit reset --head` on a lane that has
  // workspace-direct snaps + hidden updateDependent cascades. Locks down the regression where
  // resetting a head'd cascade left the workspace's bitmap entry pointing at the pre-snap version
  // (the imported tag), but the modelComponent's local view of that version had been dropped — so
  // a subsequent `bit status` threw `ComponentsPendingImport (comp3@<old-tag>)`.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 12: bit status is clean after reset --head on lane with cascades', () => {
    before(async () => {
      await buildBaseRemoteState();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      // TWO consecutive workspace snaps — each cascades comp2.
      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();
      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v3';");
      helper.command.snapAllComponentsWithoutBuild();

      helper.command.resetAll('--head');
    });

    it('bit status should not throw ComponentsPendingImport for the visible component', () => {
      const status = helper.command.statusJson();
      expect(status.importPendingComponents || []).to.have.lengthOf(0);
    });

    it('bit status should not list hidden updateDependents under stagedComponents', () => {
      const status = helper.command.statusJson();
      const stagedNames = (status.stagedComponents || []).map((c: any) => {
        const id = typeof c === 'string' ? c : c.id;
        return id.split('/').pop().split('@')[0];
      });
      expect(stagedNames).to.not.include('comp1');
      expect(stagedNames).to.not.include('comp2');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 13: workspace `bit lane merge main` must refresh `lane.updateDependents` so hidden
  // entries stay in sync with main's advanced head.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 13: workspace `bit lane merge main` refreshes updateDependents when main advances', () => {
    let comp2InUpdDepInitial: string;
    let comp2HeadOnMainAfterAdvance: string;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importComponent('*');
      helper.command.tagWithoutBuild('comp2', '--unmodified -m "advance-main"');
      helper.command.export();
      comp2HeadOnMainAfterAdvance = helper.command.getHead(`${helper.scopes.remote}/comp2`);

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.mergeLaneWithoutBuild('main', '--no-squash');
      helper.command.export();
    });

    it('lane.updateDependents[comp2] should point at a NEW hash after the workspace merge', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(remoteLane.updateDependents).to.have.lengthOf(1);
      const comp2HashAfterMerge = remoteLane.updateDependents[0].split('@')[1];
      expect(comp2HashAfterMerge).to.not.equal(comp2InUpdDepInitial);
    });

    it('lane.updateDependents[comp2] should descend from main`s advanced head (proper 3-way merge)', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp2 = helper.command.catComponent(remoteLane.updateDependents[0], helper.scopes.remotePath);
      expect(comp2.parents).to.include(comp2HeadOnMainAfterAdvance);
      expect(comp2.parents).to.have.lengthOf(2);
    });

    it('comp2 must stay in lane.updateDependents, NOT be promoted to lane.components', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp2InComponents = remoteLane.components.find((c) => c.id.name === 'comp2');
      expect(comp2InComponents, 'comp2 must not leak into lane.components').to.be.undefined;
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 14: `bit lane history` on a lane that contains hidden updateDependents must run
  // cleanly and produce a fresh entry whenever the lane changes — including when the only change
  // is a hidden cascade. `Lane.isEqual` covers `skipWorkspace`, so a cascade-only state delta
  // flips `hasChanged` and triggers `updateLaneHistory` in `saveLane`.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 14: bit lane history on a lane with hidden updateDependents', () => {
    let historyBeforeLocalSnap: Array<Record<string, any>>;
    let historyAfterLocalSnap: Array<Record<string, any>>;
    let comp3HeadAfterLocalSnap: string;

    before(async () => {
      await buildBaseRemoteState();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      historyBeforeLocalSnap = helper.command.laneHistoryParsed();

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      comp3HeadAfterLocalSnap = helper.command.getHeadOfLane('dev', 'comp3');

      historyAfterLocalSnap = helper.command.laneHistoryParsed();
    });

    it('bit lane history runs cleanly on a lane that has hidden updateDependents', () => {
      expect(historyBeforeLocalSnap).to.be.an('array').and.not.empty;
      historyBeforeLocalSnap.forEach((entry) => {
        expect(entry).to.have.property('id');
        expect(entry).to.have.property('components').that.is.an('array');
      });
    });

    it('a workspace cascade snap appends a new history entry', () => {
      expect(historyAfterLocalSnap.length).to.be.greaterThan(historyBeforeLocalSnap.length);
    });

    it('the new history entry records the advanced comp3 head among its components', () => {
      const newEntries = historyAfterLocalSnap.filter((e) => !historyBeforeLocalSnap.some((b) => b.id === e.id));
      expect(newEntries, 'expected at least one new history entry after the cascade snap').to.not.be.empty;
      const comp3RefsInNewEntries = newEntries.flatMap((e) =>
        (e.components || []).filter((c: string) => c.includes('/comp3@'))
      );
      expect(comp3RefsInNewEntries.some((ref: string) => ref.endsWith(`@${comp3HeadAfterLocalSnap}`))).to.be.true;
    });
  });
});
