/* eslint-disable @typescript-eslint/no-unused-expressions */
import chaiFs from 'chai-fs';
import { use, expect } from 'chai';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

use(chaiFs);

/**
 * These tests cover two sides of the "lane stays internally consistent with `updateDependents`"
 * story:
 *
 *  1. Local `bit snap` on a lane with existing `updateDependents` folds the affected entries
 *     into the same snap pass, producing one Version per cascaded component (scenarios 1, 2,
 *     2b, 5, 6).
 *  2. `bit _snap --update-dependents` (the "snap updates" button) also re-snaps any entries in
 *     `lane.components` that depend on the new updateDependent, so the lane doesn't end up with
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

  function snapFromScopeCmd(cwd: string, data: Record<string, any>, options = '') {
    return helper.command.runCmd(`bit _snap '${JSON.stringify(data)}' ${options}`, cwd);
  }
  function snapFromScopeParsed(cwd: string, data: Record<string, any>, options = '') {
    return JSON.parse(snapFromScopeCmd(cwd, data, `${options} --json`));
  }

  /**
   * Common starting state used by every scenario:
   *   main:  comp1@0.0.1 -> comp2@0.0.1 -> comp3@0.0.1
   *   lane `dev` on remote:
   *     components:        [ comp3@<comp3HeadOnLaneInitial> ]
   *     updateDependents:  [ comp2@<comp2InUpdDepInitial>    ]  // snapped server-side with the lane's comp3
   *
   * Returns the remote-scope snapshot so each scenario can reset to this state cheaply.
   */
  function buildBaseRemoteState(): {
    remoteSnapshot: string;
    comp3HeadOnLaneInitial: string;
    comp2InUpdDepInitial: string;
  } {
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
    snapFromScopeParsed(
      bareSnap.scopePath,
      [{ componentId: `${helper.scopes.remote}/comp2`, message: 'initial update-dependent' }],
      `--lane ${helper.scopes.remote}/dev --update-dependents --push`
    );

    const lane = helper.command.catLane('dev', helper.scopes.remotePath);
    const comp2InUpdDepInitial = lane.updateDependents[0].split('@')[1];
    const remoteSnapshot = helper.scopeHelper.cloneRemoteScope();
    return { remoteSnapshot, comp3HeadOnLaneInitial, comp2InUpdDepInitial };
  }

  // ---------------------------------------------------------------------------------------------
  // Scenario 1: basic cascade — workspace has only comp3, snaps it, comp2 (in updateDependents)
  // should be auto-re-snapped with the new comp3 version, and the parent chain should be intact.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 1: workspace has the lane component only (no workspace dependents)', () => {
    let comp3HeadOnLaneInitial: string;
    let comp2InUpdDepInitial: string;
    let comp3HeadAfterLocalSnap: string;

    before(() => {
      const base = buildBaseRemoteState();
      comp3HeadOnLaneInitial = base.comp3HeadOnLaneInitial;
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      // New workspace: import the lane, then bring comp3 locally so we can edit it.
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      // Modify only comp3's file in-place (can't use populateComponents here — it would recreate
      // comp1/comp2 files in the workspace with relative imports, which fails status checks).
      // Imported components live under `${scopes.remote}/<comp>/`.
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

    it('cascaded comp2 should have comp2 main head as its parent (not the prior updateDependents snap)', () => {
      // Cascaded updateDependents snaps are parented on the component's main head rather than
      // on the previous updateDependents snap. Anchoring the new snap on main keeps the lane a
      // direct descendant of main: if main has moved on since the initial "snap updates" button
      // click, the cascade picks up that progress instead of branching off a stale prior snap.
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp2 = helper.command.catComponent(lane.updateDependents[0], helper.scopes.remotePath);
      expect(comp2.parents).to.have.lengthOf(1);
      const comp2MainHead = helper.command.getHead(`${helper.scopes.remote}/comp2`, helper.scopes.remotePath);
      expect(comp2.parents[0]).to.equal(comp2MainHead);
      expect(comp2.parents[0]).to.not.equal(comp2InUpdDepInitial);
    });

    it('comp2 should NOT appear in the workspace bitmap (still a hidden updateDependent)', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp2');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 2 (the Q2 case): workspace has both comp3 AND comp1 (which depends on comp2).
  // Snapping comp3 must cascade comp2 (updateDependents) and also auto-snap comp1 (components[])
  // with the freshly cascaded comp2 version so the whole chain is consistent.
  //
  // Uses NpmCiRegistry so that comp1's `require('@scope.comp2')` resolves — without a local
  // registry, comp2 isn't linkable in node_modules and comp1's dep on comp2 isn't detected.
  // ---------------------------------------------------------------------------------------------
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'scenario 2: workspace has a dependent (comp1) of the updateDependent (comp2)',
    () => {
      let comp3HeadAfterLocalSnap: string;
      let comp2InUpdDepInitial: string;
      let npmCiRegistry: NpmCiRegistry;

      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.fixtures.populateComponents(3);
        helper.command.tagAllComponents();
        helper.command.export();
        helper.command.createLane();
        // Snap comp3 WITH build so the lane snap is published to Verdaccio; subsequent sign of
        // comp2 (the updateDependents entry) needs comp3's package to be resolvable to build.
        helper.command.snapComponent('comp3', 'lane-init', '--skip-auto-snap --unmodified');
        helper.command.export();

        // Seed comp2 into updateDependents via snap-from-scope (same as the button click).
        const bareSnap = helper.scopeHelper.getNewBareScope('-bare-seed-updep');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap.scopePath);
        snapFromScopeParsed(
          bareSnap.scopePath,
          [{ componentId: `${helper.scopes.remote}/comp2`, message: 'initial update-dependent' }],
          `--lane ${helper.scopes.remote}/dev --update-dependents --push`
        );
        const initialLane = helper.command.catLane('dev', helper.scopes.remotePath);
        comp2InUpdDepInitial = initialLane.updateDependents[0].split('@')[1];

        // Build+publish the new snap to the local registry. In production this happens via the
        // ripple CI job triggered on --push; in the test we run `bit sign` explicitly so the new
        // version is installable from Verdaccio when the workspace later imports comp1.
        // See sign.spec.ts — register the remote to itself so the sign command can resolve it.
        helper.scopeHelper.addRemoteScope(undefined, helper.scopes.remotePath);
        helper.command.runCmd(
          `bit sign ${helper.scopes.remote}/comp2@${comp2InUpdDepInitial} --push --original-scope --lane ${helper.scopes.remote}/dev`,
          helper.scopes.remotePath
        );

        // Fresh workspace, import lane + comp1 + comp3 (leave comp2 as an updateDependent only).
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
        npmCiRegistry.setResolver();
        helper.command.importLane('dev', '-x');
        helper.command.importComponent('comp1');
        helper.command.importComponent('comp3');

        // Modify comp1 minimally (keep its require statement intact so the comp2 dep stays
        // detected), and modify comp3's source so both are snap-candidates. Scope dir uses
        // remoteWithoutOwner because the remote scope has a dot (e.g. ci.foo-remote).
        const comp1Path = `${helper.scopes.remoteWithoutOwner}/comp1/index.js`;
        const comp1Current = helper.fs.readFile(comp1Path);
        helper.fs.outputFile(comp1Path, `${comp1Current}\n// v2`);
        helper.fs.outputFile(
          `${helper.scopes.remoteWithoutOwner}/comp3/index.js`,
          "module.exports = () => 'comp3-v2';"
        );
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
        comp3HeadAfterLocalSnap = helper.command.getHeadOfLane('dev', 'comp3');
      });
      after(() => {
        npmCiRegistry.destroy();
        helper = new Helper();
      });

      it('comp2 in updateDependents should be cascaded to a new version pointing at the new comp3', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        expect(lane.updateDependents).to.have.lengthOf(1);
        const comp2NewVersion = lane.updateDependents[0].split('@')[1];
        expect(comp2NewVersion).to.not.equal(comp2InUpdDepInitial);

        const comp2 = helper.command.catComponent(lane.updateDependents[0], helper.scopes.remotePath);
        const comp3Dep = comp2.dependencies.find((d) => d.id.name === 'comp3');
        expect(comp3Dep.id.version).to.equal(comp3HeadAfterLocalSnap);
      });

      it('comp1 should have been auto-snapped on the lane (components[], not updateDependents)', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp1OnLane = lane.components.find((c) => c.id.name === 'comp1');
        expect(comp1OnLane, 'comp1 must be in lane.components').to.exist;
        // and must NOT be in updateDependents
        const comp1InUpdDep = (lane.updateDependents || []).find((s) => s.includes('comp1'));
        expect(comp1InUpdDep, 'comp1 must not be in updateDependents').to.be.undefined;
      });

      it('comp1 on the lane should depend on the cascaded comp2 version (not main`s 0.0.1)', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp1OnLane = lane.components.find((c) => c.id.name === 'comp1');
        const comp1 = helper.command.catComponent(
          `${helper.scopes.remote}/comp1@${comp1OnLane.head}`,
          helper.scopes.remotePath
        );
        const comp2Dep = comp1.dependencies.find((d) => d.id.name === 'comp2');
        const comp2NewVersionOnLane = lane.updateDependents[0].split('@')[1];
        expect(comp2Dep.id.version).to.equal(comp2NewVersionOnLane);
      });

      it('the whole graph on the lane should be internally consistent (comp1 -> comp2 -> comp3 all new heads)', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp1OnLane = lane.components.find((c) => c.id.name === 'comp1');
        const comp3OnLane = lane.components.find((c) => c.id.name === 'comp3');
        const comp1 = helper.command.catComponent(
          `${helper.scopes.remote}/comp1@${comp1OnLane.head}`,
          helper.scopes.remotePath
        );
        const comp2Str = lane.updateDependents[0];
        const comp2 = helper.command.catComponent(comp2Str, helper.scopes.remotePath);

        // comp1 -> comp2 (cascaded)
        expect(comp1.dependencies.find((d) => d.id.name === 'comp2').id.version).to.equal(comp2Str.split('@')[1]);
        // comp2 -> comp3 (local snap)
        expect(comp2.dependencies.find((d) => d.id.name === 'comp3').id.version).to.equal(comp3OnLane.head);
      });
    }
  );

  // ---------------------------------------------------------------------------------------------
  // Scenario 2b (transitive dependent picked up even when its files weren't touched): workspace
  // has both comp1 and comp3. Only comp3 is edited on disk. comp1 depends on comp2 (in
  // updateDependents), which in turn depends on comp3. Snap must produce a new comp1 on the lane
  // that points at the cascaded comp2.
  //
  // Mechanism (worth noting so this test isn't read as an auto-tag assertion): Bit's
  // dependency-versions-resolver rewrites a workspace comp's dep to the `updateDependents` hash
  // at load time whenever the dep is listed there, which makes the workspace comp look
  // "modified" relative to its stored Version. That drift is what lands comp1 in the snap set —
  // we're verifying that path end-to-end alongside the cascade.
  // ---------------------------------------------------------------------------------------------
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'scenario 2b: workspace dependent of an updateDependent snaps even when only the transitive lane component is edited',
    () => {
      let comp3HeadAfterLocalSnap: string;
      let comp2InUpdDepInitial: string;
      let npmCiRegistry: NpmCiRegistry;

      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.fixtures.populateComponents(3);
        helper.command.tagAllComponents();
        helper.command.export();
        helper.command.createLane();
        helper.command.snapComponent('comp3', 'lane-init', '--skip-auto-snap --unmodified');
        helper.command.export();

        const bareSnap = helper.scopeHelper.getNewBareScope('-bare-seed-updep');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap.scopePath);
        snapFromScopeParsed(
          bareSnap.scopePath,
          [{ componentId: `${helper.scopes.remote}/comp2`, message: 'initial update-dependent' }],
          `--lane ${helper.scopes.remote}/dev --update-dependents --push`
        );
        const initialLane = helper.command.catLane('dev', helper.scopes.remotePath);
        comp2InUpdDepInitial = initialLane.updateDependents[0].split('@')[1];

        helper.scopeHelper.addRemoteScope(undefined, helper.scopes.remotePath);
        helper.command.runCmd(
          `bit sign ${helper.scopes.remote}/comp2@${comp2InUpdDepInitial} --push --original-scope --lane ${helper.scopes.remote}/dev`,
          helper.scopes.remotePath
        );

        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
        npmCiRegistry.setResolver();
        helper.command.importLane('dev', '-x');
        helper.command.importComponent('comp1');
        helper.command.importComponent('comp3');

        // Modify ONLY comp3. comp1 is left untouched on disk — we rely on auto-tag to notice that
        // its transitive lane-dep (comp2) cascaded and produce a new snap for it.
        helper.fs.outputFile(
          `${helper.scopes.remoteWithoutOwner}/comp3/index.js`,
          "module.exports = () => 'comp3-v2';"
        );
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
        comp3HeadAfterLocalSnap = helper.command.getHeadOfLane('dev', 'comp3');
      });
      after(() => {
        npmCiRegistry.destroy();
        helper = new Helper();
      });

      it('comp2 (updateDependents) is cascaded to a new version pointing at the new comp3', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        expect(lane.updateDependents).to.have.lengthOf(1);
        const comp2NewVersion = lane.updateDependents[0].split('@')[1];
        expect(comp2NewVersion).to.not.equal(comp2InUpdDepInitial);
        const comp2 = helper.command.catComponent(lane.updateDependents[0], helper.scopes.remotePath);
        expect(comp2.dependencies.find((d) => d.id.name === 'comp3').id.version).to.equal(comp3HeadAfterLocalSnap);
      });

      it('comp1 lands in lane.components even though its files were not touched', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp1OnLane = lane.components.find((c) => c.id.name === 'comp1');
        expect(comp1OnLane, 'comp1 must be in lane.components').to.exist;
      });

      it('comp1 on the lane depends on the cascaded comp2 version', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp1OnLane = lane.components.find((c) => c.id.name === 'comp1');
        const comp1 = helper.command.catComponent(
          `${helper.scopes.remote}/comp1@${comp1OnLane.head}`,
          helper.scopes.remotePath
        );
        const comp2NewVersionOnLane = lane.updateDependents[0].split('@')[1];
        expect(comp1.dependencies.find((d) => d.id.name === 'comp2').id.version).to.equal(comp2NewVersionOnLane);
      });
    }
  );

  // ---------------------------------------------------------------------------------------------
  // Scenario 4 (first "snap updates" click on a lane with existing lane.components that depend
  // on the new updateDependent): the workspace user has both compA and compC on the lane from the
  // start; compB lives only on main. When compA was snapped on the lane, its recorded dep on
  // compB was still compB@main because compB hadn't entered the lane yet.
  //
  // The first time the user clicks "snap updates" in the UI, compB is introduced into
  // `updateDependents` via `bit _snap --update-dependents`. After that click, compA on the lane
  // should be re-snapped so its compB dep points at the *new* updateDependent snap — otherwise
  // compA keeps pointing at compB@main and the lane's graph isn't internally consistent.
  //
  // The fix lives in `bit _snap --update-dependents` itself (the bare-scope flow): when it
  // creates a new updateDependent snap, it must also re-snap any `lane.components` that depend on
  // that component, updating their dep refs to the new hash.
  // ---------------------------------------------------------------------------------------------
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'scenario 4: first snap-updates click re-snaps lane.components that depend on the new updateDependent',
    () => {
      let comp1InitialLaneSnap: string;
      let comp2NewHash: string;
      let npmCiRegistry: NpmCiRegistry;

      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.fixtures.populateComponents(3);
        helper.command.tagAllComponents();
        helper.command.export();

        // Fresh workspace on a brand-new lane, import compA (comp1) and compC (comp3) only —
        // compB (comp2) stays available only as a main-tag package. Snap A and C with
        // --unmodified so both land on `lane.components`; A's recorded comp2 dep at this point
        // is still comp2@0.0.1 (main) because comp2 has no lane presence yet.
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

        // Simulate the "snap updates" button click: bare scope runs _snap --update-dependents
        // for comp2 and pushes. This is the first time comp2 enters `lane.updateDependents`.
        const bareSnap = helper.scopeHelper.getNewBareScope('-bare-snap-updates');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap.scopePath);
        snapFromScopeParsed(
          bareSnap.scopePath,
          [{ componentId: `${helper.scopes.remote}/comp2`, message: 'first snap-updates click' }],
          `--lane ${helper.scopes.remote}/dev --update-dependents --push`
        );
        const laneAfterSnapUpdates = helper.command.catLane('dev', helper.scopes.remotePath);
        comp2NewHash = laneAfterSnapUpdates.updateDependents[0].split('@')[1];
      });
      after(() => {
        npmCiRegistry.destroy();
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
        // comp1 should have been re-snapped to a new head.
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

    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild('comp3', '--skip-auto-snap --unmodified');
      helper.command.export();

      // Seed comp2 into updateDependents first so that when comp1 is seeded next, the bare-scope
      // dep alignment resolves comp1's comp2 dep to the updDep hash (not the main tag).
      const bareSnap1 = helper.scopeHelper.getNewBareScope('-bare-seed-updep-comp2');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap1.scopePath);
      snapFromScopeParsed(
        bareSnap1.scopePath,
        [{ componentId: `${helper.scopes.remote}/comp2`, message: 'seed comp2' }],
        `--lane ${helper.scopes.remote}/dev --update-dependents --push`
      );
      const laneAfterSeedComp2 = helper.command.catLane('dev', helper.scopes.remotePath);
      comp2InUpdDepInitial = laneAfterSeedComp2.updateDependents[0].split('@')[1];

      const bareSnap2 = helper.scopeHelper.getNewBareScope('-bare-seed-updep-comp1');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap2.scopePath);
      snapFromScopeParsed(
        bareSnap2.scopePath,
        [{ componentId: `${helper.scopes.remote}/comp1`, message: 'seed comp1' }],
        `--lane ${helper.scopes.remote}/dev --update-dependents --push`
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
  // stale `updateDependents` entry must be cleared — otherwise the lane ends up with the same
  // component in both lists, which is an inconsistent state.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 6: promote-on-import — importing an updateDependent then snapping it moves it to lane.components', () => {
    let comp2InUpdDepInitial: string;

    before(() => {
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
      snapFromScopeParsed(
        bareSnap.scopePath,
        [{ componentId: `${helper.scopes.remote}/comp2`, message: 'seed comp2' }],
        `--lane ${helper.scopes.remote}/dev --update-dependents --push`
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
    let _userAPath: string;
    let userBPath: string;
    let comp2InUpdDepInitial: string;
    let comp2AfterUserAExport: string;

    before(() => {
      const base = buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      // User A — fresh workspace, imports lane, edits comp3, exports.
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');
      _userAPath = helper.scopes.localPath;

      // User B — clone of A's pre-snap state (before A touched comp3). Keep it aside.
      userBPath = helper.scopeHelper.cloneWorkspace();

      // A snaps + exports. Use a surgical edit on the imported comp3 (not populateComponents,
      // which would introduce new comp1/comp2 files at the workspace root with relative imports).
      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2-userA';");
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const laneAfterA = helper.command.catLane('dev', helper.scopes.remotePath);
      comp2AfterUserAExport = laneAfterA.updateDependents[0].split('@')[1];

      // Switch to B, make a different edit and try to export (should fail with diverged).
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

    // The "reset → re-import → re-snap → export" resolution path is pending a design decision on
    // how divergence should interact with the "parent = main head" updateDependents design, plus
    // the mechanics of how `bit reset` + `bit import` should clean up orphaned cascade Version
    // objects. Both concerns are out of scope for this PR — the important behaviors validated at
    // the outer level (A's cascade advances updateDependents, B's export is correctly rejected)
    // are already green.
    describe.skip('user B resolves via `bit reset` then re-snaps', () => {
      it('pending: post-reset cascade behavior needs design alignment', () => {
        // re-enable and fill in once the divergence story is designed.
      });
    });

    // TODO: parallel "bit lane merge" resolution variant — fill in once we align on the merge
    // semantics for cascaded updateDependents entries (do we surface conflicts? auto-merge? etc).
    describe.skip('user B resolves via `bit lane merge` instead of reset', () => {
      it('should merge comp3 and the cascaded comp2 without manual intervention when there is no content conflict', () => {
        // pending design decision
      });
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 7: import must not clobber a pending local cascade.
  //
  // Before this PR, `lane.updateDependents` could only be changed server-side (bare-scope
  // `_snap --update-dependents` or a graphql query), so `sources.mergeLane` on the import path
  // unconditionally overrode the local list with the remote's copy. That was safe because the
  // local user had nothing to lose.
  //
  // This PR lets `bit snap` rewrite `updateDependents` locally and flags the lane with
  // `overrideUpdateDependents=true` to signal "these are pending, don't blow them away". If the
  // user runs `bit fetch --lanes` (or any other import-side path) between snap and export, the
  // unguarded merge would wipe the cascaded hashes. This scenario locks in the guard.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 7: local cascade survives a `bit fetch --lanes` before export', () => {
    let comp2InUpdDepInitial: string;
    let comp2AfterLocalSnap: string;
    let comp3HeadAfterLocalSnap: string;

    before(() => {
      const base = buildBaseRemoteState();
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

      // Sanity: the local snap actually produced a cascade we can lose.
      expect(comp2AfterLocalSnap).to.not.equal(comp2InUpdDepInitial);

      // Trigger the import-side `sources.mergeLane`. Without the `shouldOverrideUpdateDependents`
      // guard in sources.ts, this is the call that silently wipes the cascade.
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
  // Scenario 8: `bit reset` must revert the cascade, not just the user's direct snap.
  //
  // A local `bit snap` that cascades `lane.updateDependents` leaves the lane in an "override"
  // state: new Version objects for the cascaded entries, new hashes on `lane.updateDependents`,
  // and `overrideUpdateDependents=true`. Without special handling, `bit reset` only rolls back
  // the user's direct target (the lane.component), leaving the updateDependents pointing at the
  // cascaded hashes — so the lane is stuck in a half-reset state.
  //
  // We capture the pre-cascade `updateDependents` in `Lane.updateDependentsBeforeCascade` at
  // cascade time, and `reset` uses it to restore the lane to its pre-snap state end-to-end.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 8: bit reset reverts the cascade, not just the direct snap', () => {
    let comp2InUpdDepInitial: string;
    let comp3HeadBeforeLocalSnap: string;
    let laneAfterReset: Record<string, any>;

    before(() => {
      const base = buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;
      comp3HeadBeforeLocalSnap = base.comp3HeadOnLaneInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();

      // Sanity: the cascade actually produced a new comp2 hash before we reset.
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
      // The lane is marked `hasChanged` after reset, so export runs and pushes the (reverted)
      // lane object. What matters is that the remote's state matches the pre-snap baseline —
      // comp3 head and the comp2 updateDependents entry must all equal the base values. If the
      // cascade weren't fully reverted, this is where orphaned cascade hashes would surface.
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

    before(() => {
      const base = buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      // Snap #1 — cascades comp2 once.
      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();
      const laneAfterFirst = helper.command.catLane('dev');
      comp2AfterFirstSnap = laneAfterFirst.updateDependents[0].split('@')[1];

      // Sanity: first snap actually cascaded.
      expect(comp2AfterFirstSnap).to.not.equal(comp2InUpdDepInitial);

      // Snap #2 — cascades comp2 AGAIN to a different hash.
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
  // Scenario 10: `_merge-lane main dev` (the UI "update lane from main" flow) must refresh the
  // lane's `updateDependents` when main has advanced past their parent version.
  //
  // Before the per-id updateDependent plumbing in snapFromScope, the bare-scope merge-from-scope
  // set `shouldIncludeUpdateDependents = toLaneId.isDefault()`, so merging main→lane SKIPPED
  // updateDependents entirely — they stayed stuck on the old main-head base until someone ran a
  // local snap to trigger the cascade. This scenario locks in the fix: after the merge, the
  // entry should (a) still be in `lane.updateDependents` (not promoted to `lane.components`), and
  // (b) reference a NEW hash reflecting main's advanced head.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 10: _merge-lane main dev refreshes updateDependents when main advances', () => {
    let comp2InUpdDepInitial: string;
    let comp2HeadOnMainAfterAdvance: string;

    before(() => {
      const base = buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      // Advance main's comp2 past the version the initial updateDependent was cascaded off of.
      // Using `--unmodified` keeps file content stable so the merge doesn't surface a file-level
      // conflict — we're specifically testing that the updateDependent entry gets refreshed,
      // not general conflict resolution.
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importComponent('*');
      helper.command.tagWithoutBuild('comp2', '--unmodified -m "advance-main"');
      helper.command.export();
      comp2HeadOnMainAfterAdvance = helper.command.getHead(`${helper.scopes.remote}/comp2`);

      // Run `_merge-lane main dev` from a bare scope — this is what the UI "update lane" button
      // triggers on the server.
      const bareMerge = helper.scopeHelper.getNewBareScope('-bare-update-lane');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      helper.command.runCmd(`bit _merge-lane main ${helper.scopes.remote}/dev --push`, bareMerge.scopePath);
    });

    it('lane.updateDependents[comp2] should point at a NEW hash (refreshed by the merge)', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(remoteLane.updateDependents).to.have.lengthOf(1);
      const comp2HashAfterMerge = remoteLane.updateDependents[0].split('@')[1];
      expect(comp2HashAfterMerge).to.not.equal(comp2InUpdDepInitial);
    });

    it('lane.updateDependents[comp2] should descend from main`s advanced head (proper 3-way merge snap)', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp2 = helper.command.catComponent(remoteLane.updateDependents[0], helper.scopes.remotePath);
      // Under the unified-lane.components architecture, hidden entries participate in the regular
      // per-component merge engine. When main advances past the cascade's parent and the cascade
      // has its own snap (the dep rewrites), the merge produces a 3-way merge snap with both
      // parents: main's advanced head + the prior cascade hash. The lane is no longer stale and
      // the cascade's dep rewrites are preserved through the merge.
      expect(comp2.parents).to.include(comp2HeadOnMainAfterAdvance);
      expect(comp2.parents).to.have.lengthOf(2);
    });

    it('comp2 must stay in lane.updateDependents, NOT be promoted to lane.components', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp2InComponents = remoteLane.components.find((c) => c.id.name === 'comp2');
      expect(comp2InComponents, 'comp2 must not leak into lane.components').to.be.undefined;
    });
  });

  // Further scenarios that could be added later:
  //  - stale lane — user snaps without fetching; cascade must either fetch or reject.
  //  - ripple is triggered on the remote for cascaded snaps (lane stays buildable).
  //  - dependency removed from the lane — cascade must no-op (or evict) gracefully.
});
