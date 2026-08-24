/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

/**
 * Cascade behavior on a lane that has `updateDependents` — reset/history/checkout side.
 * See update-dependents-cascade.e2e.ts for the full background on how the seed step
 * (`helper.snapping.snapFromScope` with `updateDependents: true`) produces hidden entries.
 *
 * This file covers how workspace state-navigation commands interact with cascades:
 * `bit fetch --lanes` before export, `bit reset` / `bit reset --head`, `bit status` after
 * reset, `bit lane history` and `bit lane checkout`.
 */
describe('updateDependents cascade - reset, history and checkout', function () {
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
  // Scenario 7: import must not clobber a pending local cascade. After cascade-on-snap rewrites
  // a hidden updateDependent locally, a `bit fetch --lanes` between snap and export should keep
  // the local cascade in place — `mergeLaneComponent` sees local-ahead and no-ops on import.
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
  // Scenario 8: `bit reset` must revert the cascade, not just the user's direct snap. The cascade
  // snap shares a `batchId` with the user's direct snap (set in `version-maker.makeVersion`), and
  // `reset` collects every batchId from the versions it removes and walks the lane-history
  // backwards through those entries — including the cascade ones — to restore the lane to its
  // pre-snap state end-to-end.
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
  // cascade is rolled back.
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

    it('bit status should surface the locally-cascaded comp2 under pendingUpdateDependents', () => {
      // After `reset --head`, the lane still has the FIRST-snap cascade entry for comp2 (locally
      // pending export). It must show up in the dedicated `pendingUpdateDependents` field — the
      // same set `bit export` later prints under "exported updates".
      const status = helper.command.statusJson();
      const pending = (status.pendingUpdateDependents || []) as string[];
      const comp2InPending = pending.find((id) => id.split('/').pop() === 'comp2');
      expect(comp2InPending, 'comp2 must appear in pendingUpdateDependents').to.exist;
    });
  });
  // ---------------------------------------------------------------------------------------------
  // Scenario 14: `bit lane history` on a lane that contains hidden updateDependents must run
  // cleanly and produce a fresh entry whenever the lane changes — including when the only change
  // is a hidden cascade. `Lane.isEqual` covers `lane.updateDependents`, so a cascade-only state
  // delta flips `hasChanged` and triggers `updateLaneHistory` in `saveLane`.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 14: bit lane history on a lane with hidden updateDependents', () => {
    let historyBeforeLocalSnap: Array<Record<string, any>>;
    let historyAfterLocalSnap: Array<Record<string, any>>;
    let comp2InUpdDepInitial: string;
    let comp3HeadAfterLocalSnap: string;
    let comp2HeadAfterCascade: string;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      historyBeforeLocalSnap = helper.command.laneHistoryParsed();

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      comp3HeadAfterLocalSnap = helper.command.getHeadOfLane('dev', 'comp3');
      const remoteLane = helper.command.catLane('dev', helper.scopes.remotePath);
      comp2HeadAfterCascade = remoteLane.updateDependents[0].split('@')[1];

      historyAfterLocalSnap = helper.command.laneHistoryParsed();
    });

    it('bit lane history runs cleanly on a lane that has hidden updateDependents', () => {
      expect(historyBeforeLocalSnap).to.be.an('array').and.not.empty;
      historyBeforeLocalSnap.forEach((entry) => {
        expect(entry).to.have.property('id');
        expect(entry).to.have.property('components').that.is.an('array');
      });
    });

    it('history entries created BEFORE the workspace snap include the seeded comp2 hash under updateDependents', () => {
      const seedEntries = historyBeforeLocalSnap.filter((e) =>
        (e.updateDependents || []).some((s: string) => s.endsWith(`@${comp2InUpdDepInitial}`))
      );
      expect(seedEntries, 'expected at least one history entry with the seed comp2 hash').to.not.be.empty;
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

    it('the new history entry records the cascaded comp2 hash under updateDependents (separate from components)', () => {
      const newEntries = historyAfterLocalSnap.filter((e) => !historyBeforeLocalSnap.some((b) => b.id === e.id));
      const comp2RefsInUpdateDependents = newEntries.flatMap((e) =>
        (e.updateDependents || []).filter((c: string) => c.includes('/comp2@'))
      );
      expect(comp2RefsInUpdateDependents.some((ref: string) => ref.endsWith(`@${comp2HeadAfterCascade}`))).to.be.true;
      // and the cascaded comp2 must NOT leak into history.components — that field drives
      // checkout/revert workspace materialization, which would mis-promote a hidden entry.
      const comp2RefsInComponents = newEntries.flatMap((e) =>
        (e.components || []).filter((c: string) => c.includes('/comp2@'))
      );
      expect(comp2RefsInComponents).to.have.lengthOf(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Scenario 15: `bit lane checkout <history-id>` is a workspace-navigation operation. It rewrites
  // the workspace files / bitmap of visible components but never touches the lane object — same
  // for visible heads (which stay put) and for hidden updateDependents (which stay at the
  // post-cascade hash). If the user keeps working on the lane, the next snap re-cascades off the
  // new files; if they fork, the new lane starts fresh.
  // ---------------------------------------------------------------------------------------------
  describe('scenario 15: bit lane checkout leaves hidden updateDependents untouched on the lane', () => {
    let comp2InUpdDepInitial: string;
    let comp3HeadOnLaneInitial: string;
    let comp2HeadAfterCascade: string;
    let comp3HeadAfterLocalSnap: string;
    let preCascadeHistoryId: string;

    before(async () => {
      const base = await buildBaseRemoteState();
      comp2InUpdDepInitial = base.comp2InUpdDepInitial;
      comp3HeadOnLaneInitial = base.comp3HeadOnLaneInitial;

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.command.importLane('dev', '-x');
      helper.command.importComponent('comp3');

      // Snapshot the history-id BEFORE the cascade snap.
      const historyBeforeCascade = helper.command.laneHistoryParsed();
      const matchingEntry = historyBeforeCascade.find((e) =>
        (e.updateDependents || []).some((s: string) => s.endsWith(`@${comp2InUpdDepInitial}`))
      );
      expect(matchingEntry, 'expected a history entry pointing at the pre-cascade comp2 hash').to.exist;
      preCascadeHistoryId = (matchingEntry as Record<string, any>).id;

      // Cascade snap: comp3 advances on lane, comp2 (hidden) cascades to a new hash.
      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, "module.exports = () => 'comp3-v2';");
      helper.command.snapAllComponentsWithoutBuild();
      comp3HeadAfterLocalSnap = helper.command.getHeadOfLane('dev', 'comp3');
      const laneAfterCascade = helper.command.catLane('dev');
      comp2HeadAfterCascade = laneAfterCascade.updateDependents[0].split('@')[1];

      expect(comp3HeadAfterLocalSnap).to.not.equal(comp3HeadOnLaneInitial);
      expect(comp2HeadAfterCascade).to.not.equal(comp2InUpdDepInitial);

      helper.command.runCmd(`bit lane checkout ${preCascadeHistoryId} -x`);
    });

    it('lane.updateDependents should stay at the post-cascade hash (lane is not mutated by checkout)', () => {
      const localLane = helper.command.catLane('dev');
      expect(localLane.updateDependents).to.have.lengthOf(1);
      expect(localLane.updateDependents[0].split('@')[1]).to.equal(comp2HeadAfterCascade);
    });

    it('comp2 must stay hidden (not promoted to lane.components)', () => {
      const localLane = helper.command.catLane('dev');
      const comp2InComponents = localLane.components.find((c) => c.id.name === 'comp2');
      expect(comp2InComponents, 'comp2 must not leak into lane.components').to.be.undefined;
    });

    it('comp2 must NOT appear in the workspace bitmap after the checkout', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp2');
    });
  });
});
