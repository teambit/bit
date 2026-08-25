/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

/**
 * Cascade behavior on a lane that has `updateDependents` — import/fetch/promotion side.
 * See update-dependents-cascade.e2e.ts for the full background on how the seed step
 * (`helper.snapping.snapFromScope` with `updateDependents: true`) produces hidden entries.
 *
 * This file covers how hidden entries flow between scopes and workspaces: `bit import` of a
 * hidden updateDependent, workspace `bit lane merge main`, fetch picking up producer cascades
 * and origin-side removals, promote-on-snap, cross-scope updateDependents, and the install
 * error for an unpublished updateDependent.
 */
describe('updateDependents cascade - import, fetch and promotion', function () {
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
  // Scenario 13: workspace `bit lane merge main` must refresh `lane.updateDependents` so hidden
  // entries stay in sync with main's advanced head.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 13: workspace `bit lane merge main` refreshes updateDependents when main advances', () => {
    let comp2InUpdDepInitial: string;
    let comp2HeadOnMainAfterAdvance: string;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      // Advance comp2 on main with a REAL file change. The cascade snap on the lane (comp2 is
      // hidden) must absorb this content via 3-way merge — `snapHiddenForMerge` has to use the
      // merged ConsumerComponent produced by `applyVersion`, not just reload the lane-head
      // version, otherwise main-side content drift is silently lost.
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importComponent('*');
      helper.fs.outputFile(`${helper.scopes.remote}/comp2/index.js`, "module.exports = () => 'comp2-main-v2';");
      helper.command.tagAllWithoutBuild('-m "advance-main"');
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

    it('cascaded comp2 must absorb main-side content (file ref equals main`s)', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      const cascaded = helper.command.catComponent(remoteLane.updateDependents[0], helper.scopes.remotePath);
      const mainAdvanced = helper.command.catComponent(
        `${helper.scopes.remote}/comp2@${comp2HeadOnMainAfterAdvance}`,
        helper.scopes.remotePath
      );
      // Same blob ref means the merge result took main-side content, not lane-head content.
      expect(cascaded.files[0].file).to.equal(mainAdvanced.files[0].file);
    });

    it('comp2 must stay in lane.updateDependents, NOT be promoted to lane.components', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp2InComponents = remoteLane.components.find((c) => c.id.name === 'comp2');
      expect(comp2InComponents, 'comp2 must not leak into lane.components').to.be.undefined;
    });
  });
  // ---------------------------------------------------------------------------------------------
  // Scenario 16: a workspace `bit fetch --lanes` picks up a producer's hidden cascade that
  // landed on the remote. After unifying hidden entries into mergeLaneComponent's diverge check,
  // there's no override-flag-governed import guard — the workspace's local lane simply
  // fast-forwards to the producer's hash on fetch.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 16: workspace fetch picks up a producer hidden cascade', () => {
    let comp2AfterProducerPush: string;
    let comp2InUpdDepInitial: string;
    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      // Workspace imports the lane but does NOT cascade-snap yet — its local lane sits on the
      // initial seeded comp2. The override flag is undefined locally.
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');
      const localLaneBefore = helper.command.catLane('dev');
      expect(localLaneBefore.updateDependents[0].split('@')[1]).to.equal(comp2InUpdDepInitial);

      // Producer pushes a fresh hidden cascade for comp2. This is non-divergent — the lane on
      // remote moves from the seed to the producer's hash; workspace just hasn't seen it yet.
      const bareProducer = helper.scopeHelper.getNewBareScope('-bare-cascade-ahead');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareProducer.scopePath);
      helper.command.runCmd(`bit fetch ${helper.scopes.remote}/dev --lanes`, bareProducer.scopePath);
      await helper.snapping.snapFromScope(
        bareProducer.scopePath,
        [{ componentId: `${helper.scopes.remote}/comp2`, message: 'producer cascade before workspace cascade' }],
        { lane: `${helper.scopes.remote}/dev`, updateDependents: true, push: true }
      );
      const laneAfterProducer = helper.command.catLane('dev', helper.scopes.remotePath);
      comp2AfterProducerPush = laneAfterProducer.updateDependents[0].split('@')[1];
      expect(comp2AfterProducerPush).to.not.equal(comp2InUpdDepInitial);

      helper.command.fetchAllLanes();
    });

    it('the workspace`s local lane reflects the producer`s cascade after fetch', () => {
      const localLane = helper.command.catLane('dev');
      expect(localLane.updateDependents[0].split('@')[1]).to.equal(comp2AfterProducerPush);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 17: a Cloud-UI-driven `removeUpdateDependents` (GraphQL mutation against the origin
  // scope) must propagate to consumers. After the origin lane drops a hidden entry, the next
  // `bit fetch --lanes` / `bit import` from a workspace that previously imported the lane has to
  // reflect that removal locally — leaving stale `updateDependents` would silently let the entry
  // get resurrected on the next export or surface in downstream cascades.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 17: fetch reflects origin-side removeUpdateDependents (Cloud UI mutation)', () => {
    before(async () => {
      const base = await buildBaseRemoteState();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      const localLaneBefore = helper.command.catLane('dev');
      expect(localLaneBefore.updateDependents).to.have.lengthOf(1);
      expect(localLaneBefore.updateDependents[0].split('@')[1]).to.equal(base.comp2InUpdDepInitial);

      // Origin-side removal: simulates the Cloud UI clicking "remove" on the lane's hidden entry.
      await helper.snapping.removeUpdateDependents(helper.scopes.remotePath, `${helper.scopes.remote}/dev`);
      const remoteLaneAfterRemove = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(remoteLaneAfterRemove.updateDependents || []).to.have.lengthOf(0);

      helper.command.fetchAllLanes();
    });

    it('local lane.updateDependents should be cleared after fetch', () => {
      const localLane = helper.command.catLane('dev');
      expect(localLane.updateDependents || []).to.have.lengthOf(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 18: a workspace that hasn't refreshed since the Cloud UI dropped a hidden entry must
  // not resurrect that entry on its next export. Workspace cascade snaps only update existing
  // hidden entries — so the origin's `mergeLane` skips incoming hidden adds when the
  // `overrideUpdateDependents` flag isn't set (which only `_snap --update-dependents` sets).
  // ---------------------------------------------------------------------------------------------
  describe('scenario 18: export does not resurrect entries the origin dropped via UI', () => {
    let comp2InUpdDepInitial: string;
    let comp3HeadAfterSnap: string;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      // Cloud UI drops the hidden entry on the origin while the workspace is offline. The
      // workspace's local lane still carries the stale comp2 reference.
      await helper.snapping.removeUpdateDependents(helper.scopes.remotePath, `${helper.scopes.remote}/dev`);
      const remoteLaneAfterRemove = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(remoteLaneAfterRemove.updateDependents || []).to.have.lengthOf(0);

      // Workspace snaps comp3 — the cascade re-snaps the stale comp2 in lane.updateDependents.
      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();
      comp3HeadAfterSnap = helper.command.getHeadOfLane('dev', 'comp3');

      const localLaneAfterSnap = helper.command.catLane('dev');
      expect(localLaneAfterSnap.updateDependents).to.have.lengthOf(1);
      expect(localLaneAfterSnap.updateDependents[0].split('@')[1]).to.not.equal(comp2InUpdDepInitial);

      helper.command.export();
    });

    it('origin lane.updateDependents stays empty (stale workspace entry not resurrected)', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(remoteLane.updateDependents || []).to.have.lengthOf(0);
    });

    it('origin lane.components still receives the cascaded comp3 head (visible export unaffected)', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      const comp3OnRemote = remoteLane.components.find((c) => c.id.name === 'comp3');
      expect(comp3OnRemote.head).to.equal(comp3HeadAfterSnap);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 19: explicit `bit import <id>` of a hidden updateDependent must land main's tagged
  // version in the workspace bitmap — not the lane's cascade snap. A subsequent snap then
  // promotes the component cleanly into `lane.components` and clears the hidden entry, so it
  // never lives in both buckets at once. Also locks down the snap's parent chain: it descends
  // from main's head, not the cascade hash, so promote-on-import doesn't silently graft the
  // cascade history into the lane component graph.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly', () => {
    let comp2InUpdDepInitial: string;
    let comp2HashOnMain: string;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp2');

      comp2HashOnMain = helper.command.getHead(`${helper.scopes.remote}/comp2`);
      // sanity — the cascade snap on the lane and main's head are distinct hashes
      expect(comp2InUpdDepInitial).to.not.equal(comp2HashOnMain);
    });

    it("bitmap.comp2 should land at main's tag (0.0.1), not the lane's cascade snap", () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('comp2');
      expect(bitMap.comp2.version).to.equal('0.0.1');
      expect(bitMap.comp2.version).to.not.equal(comp2InUpdDepInitial);
    });

    it('comp2 stays hidden on the remote (import alone does not promote)', () => {
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(remoteLane.updateDependents).to.have.lengthOf(1);
      expect(remoteLane.updateDependents[0].split('@')[1]).to.equal(comp2InUpdDepInitial);
    });

    describe('after editing and snapping the imported comp2', () => {
      before(() => {
        helper.fs.outputFile(`${helper.scopes.remote}/comp2/index.js`, "module.exports = () => 'comp2-v2';");
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
      });

      it('comp2 lands in lane.components on the remote (promoted from hidden)', () => {
        const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp2InComp = remoteLane.components.find((c) => c.id.name === 'comp2');
        expect(comp2InComp, 'comp2 should be in lane.components after promotion').to.exist;
      });

      it('comp2 is removed from lane.updateDependents (no duplicate across both buckets)', () => {
        const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp2InUpdDep = (remoteLane.updateDependents || []).find((s) => s.includes('comp2'));
        expect(comp2InUpdDep, 'comp2 must not remain in updateDependents after promotion').to.be.undefined;
      });

      it("the promoted snap descends from main's head, not the prior cascade snap", () => {
        const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp2OnLane = remoteLane.components.find((c) => c.id.name === 'comp2') as { head: string };
        const promotedSnap = helper.command.catComponent(
          `${helper.scopes.remote}/comp2@${comp2OnLane.head}`,
          helper.scopes.remotePath
        );
        expect(promotedSnap.parents).to.have.lengthOf(1);
        expect(promotedSnap.parents).to.include(comp2HashOnMain);
        expect(promotedSnap.parents).to.not.include(comp2InUpdDepInitial);
      });

      // -------------------------------------------------------------------------------------
      // After the export, a second consumer who imports the lane from scratch must see comp2
      // as a real lane component — both on the lane object and in the workspace bitmap. This
      // confirms the promotion is observable to consumers, not just a workspace-local rewrite.
      // -------------------------------------------------------------------------------------
      describe('a fresh workspace then imports the exported lane', () => {
        let comp2HeadAfterPromote: string;
        before(() => {
          const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
          const comp2OnRemoteLane = remoteLane.components.find((c) => c.id.name === 'comp2') as { head: string };
          comp2HeadAfterPromote = comp2OnRemoteLane.head;

          helper.scopeHelper.reInitWorkspace();
          helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
          helper.command.importLane('dev', '-x');
        });

        it('the imported lane object lists comp2 under components (visible, not hidden)', () => {
          const localLane = helper.command.catLane('dev');
          const comp2InComp = localLane.components.find((c) => c.id.name === 'comp2') as { head: string };
          expect(comp2InComp, 'comp2 should be visible on the imported lane').to.exist;
          expect(comp2InComp.head).to.equal(comp2HeadAfterPromote);
        });

        it('the imported lane does NOT carry comp2 in updateDependents', () => {
          const localLane = helper.command.catLane('dev');
          const comp2InUpdDep = (localLane.updateDependents || []).find((s) => s.includes('comp2'));
          expect(comp2InUpdDep, 'comp2 must not appear in updateDependents on the imported lane').to.be.undefined;
        });

        it('comp2 lands in the fresh workspace bitmap at the promoted lane head', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('comp2');
          expect(bitMap.comp2.version).to.equal(comp2HeadAfterPromote);
        });
      });
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 20: importing a lane whose hidden updateDependent originates from a DIFFERENT scope
  // than the lane. The cascade snap of that updateDependent lives in the lane's scope (where the
  // bare-scope producer pushed it), NOT on the component's origin-scope main. The fetcher's
  // `groupByLanes` routing must therefore send updateDependents to the lane's scope — otherwise it
  // asks the origin scope for a lane-only hash it never had and the import dies with
  // "component <updateDependent> was not found". Single-scope scenarios above can't catch this
  // because lane.scope === the component's origin scope, so the misroute resolves to the same place.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 20: import a lane with a cross-scope updateDependent', () => {
    let anotherRemote: string;
    let anotherRemotePath: string;
    let comp2InUpdDep: string;
    // the whole flow (incl. the fresh-workspace import) runs in `before` so any one `it` can be
    // run in isolation with `.only`. Without the fix the import throws ComponentNotFound for the
    // cross-scope updateDependent, failing this hook and surfacing the regression for every `it`.
    before(async () => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const newScope = helper.scopeHelper.getNewBareScope();
      anotherRemote = newScope.scopeName;
      anotherRemotePath = newScope.scopePath;
      // wire every scope to know every other scope.
      helper.scopeHelper.addRemoteScope(anotherRemotePath);
      helper.scopeHelper.addRemoteScope(anotherRemotePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, anotherRemotePath);

      // comp2 -> comp3. comp3 stays on the lane's scope (remote); comp2 lives on anotherRemote and
      // is the cross-scope updateDependent.
      helper.fixtures.populateComponents(3, false, '', false);
      helper.command.setScope(anotherRemote, 'comp2');
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane();
      helper.command.snapComponentWithoutBuild('comp3', '--skip-auto-snap --unmodified');
      helper.command.export();

      // seed comp2 (from anotherRemote) into lane.updateDependents and push it to the lane's scope.
      const bareSnap = helper.scopeHelper.getNewBareScope('-bare-seed-updep');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap.scopePath);
      helper.scopeHelper.addRemoteScope(anotherRemotePath, bareSnap.scopePath);
      await helper.snapping.snapFromScope(
        bareSnap.scopePath,
        [{ componentId: `${anotherRemote}/comp2`, message: 'cross-scope update-dependent' }],
        { lane: `${helper.scopes.remote}/dev`, updateDependents: true, push: true }
      );
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      comp2InUpdDep = lane.updateDependents[0] || '';

      // fresh workspace: import the lane. This is the line that regressed.
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(anotherRemotePath);
      helper.command.importLane('dev', '-x');
    });

    it('seeds comp2 from the other scope as a hidden updateDependent (precondition)', () => {
      expect(comp2InUpdDep).to.include(`${anotherRemote}/comp2`);
    });

    it('the cross-scope updateDependent`s lane-only cascade snap is fetched into the local scope', () => {
      const hash = comp2InUpdDep.split('@')[1];
      expect(() => helper.command.catObject(hash)).to.not.throw();
    });

    it('the updateDependent stays hidden — only comp3 is in the workspace bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('comp3');
      expect(bitMap).to.not.have.property('comp2');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 21: a visible workspace component depends on a hidden updateDependent whose build never
  // succeeded (e.g. Ripple failed after "snap updates"), so it was never published to the registry.
  // The updateDependent is not checked out, so the package manager must fetch it from the registry —
  // but there is no package, so it fails with the cryptic "No matching version found". `bit install`
  // should instead surface an actionable error pointing at the `bit import` remediation.
  //
  // Uses the npm CI registry so the unpublished `0.0.0-<hash>` genuinely 404s (with a local file
  // remote the dep is filtered out of the install manifest and never fetched, so it can't reproduce).
  // ---------------------------------------------------------------------------------------------
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'scenario 21: install errors clearly when a workspace component depends on an unpublished updateDependent',
    () => {
      let npmCiRegistry: NpmCiRegistry;
      before(async () => {
        helper.scopeHelper.destroy();
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.fixtures.populateComponents(2); // comp1 -> comp2
        helper.command.tagAllComponents(); // tag + publish comp1@0.0.1, comp2@0.0.1 to the registry
        helper.command.export();

        // comp1 becomes a visible lane component (it depends on comp2).
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
        npmCiRegistry.setResolver();
        helper.command.createLane();
        helper.command.importComponent('comp1');
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.export();

        // "snap updates": comp2 enters lane.updateDependents via the bare-scope cascade. build:false
        // means the cascade snap is never built/published — the state Ripple leaves on a build failure.
        // The cascade also re-snaps comp1 so its comp2 dep points at the new (unpublished) updateDependent.
        const bareSnap = helper.scopeHelper.getNewBareScope('-bare-snap-updates');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap.scopePath);
        await helper.snapping.snapFromScope(
          bareSnap.scopePath,
          [{ componentId: `${helper.scopes.remote}/comp2`, message: 'snap updates' }],
          { lane: `${helper.scopes.remote}/dev`, updateDependents: true, push: true }
        );

        // fresh workspace: importing the lane checks out the visible comp1 (comp2 stays hidden).
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
        npmCiRegistry.setResolver();
        helper.command.importLane('dev', '-x');
      });
      after(() => {
        npmCiRegistry.destroy();
        helper.scopeHelper.destroy();
        helper = new Helper();
      });

      it('comp2 stays a hidden updateDependent — only comp1 is in the bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('comp1');
        expect(bitMap).to.not.have.property('comp2');
      });

      it('bit install fails with an actionable error naming the component and the bit import remediation', () => {
        let output = '';
        try {
          helper.command.install();
        } catch (err: any) {
          output = `${err.message || ''}${err.stdout?.toString() || ''}${err.stderr?.toString() || ''}`;
        }
        expect(output, 'bit install should have failed').to.have.string('never published');
        expect(output, 'error should name the problematic component').to.have.string('comp2');
        expect(output, 'error should suggest the bit import remediation').to.have.string('bit import');
      });
    }
  );
});
