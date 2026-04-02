import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('lane history-diff', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('lane with two history entries', () => {
    let historyEntries: any[];
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('-m "first snap"');
      helper.command.exportLane();

      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild('-m "second snap"');
      helper.command.exportLane();

      historyEntries = helper.command.laneHistoryParsed();
    });

    it('with no args, should diff the latest entry against its predecessor', () => {
      const output = helper.command.runCmd('bit lane history-diff');
      expect(output).to.have.string('comp1');
      expect(output).to.have.string('comp2');
    });

    it('with one arg (latest id), should diff that entry against its predecessor', () => {
      const latestId = historyEntries[historyEntries.length - 1].id;
      const output = helper.command.runCmd(`bit lane history-diff ${latestId}`);
      expect(output).to.have.string('comp1');
      expect(output).to.have.string('comp2');
    });

    it('with one arg (first id), should throw since it has no predecessor', () => {
      const firstId = historyEntries[0].id;
      expect(() => helper.command.runCmd(`bit lane history-diff ${firstId}`)).to.throw('unable to find a predecessor');
    });
  });

  /**
   * Simplest reproduction: snap → reset → snap → export.
   * The reset deletes the Version objects but the lane-history entry from the first snap survives.
   * When a fresh workspace imports this lane, the orphaned entry references versions that
   * don't exist on the remote.
   *
   * History timeline (oldest→newest):
   *   [0] "new lane"        (empty, always available)
   *   [1] "first snap"      (exported, available)
   *   [2] "local snap"      (orphaned - versions deleted by reset)
   *   [3] "final snap"      (exported, available)
   */
  describe('lane history-diff with orphaned versions after snap-reset-snap', () => {
    let orphanedHistoryId: string;
    let finalSnapHistoryId: string;
    let firstSnapHistoryId: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('-m "first snap"');
      helper.command.exportLane();

      // Snap locally (creates lane-history entry + Version objects)
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild('-m "local snap"');

      const historyAfterSnap = helper.command.laneHistoryParsed();
      orphanedHistoryId = historyAfterSnap[historyAfterSnap.length - 1].id;
      firstSnapHistoryId = historyAfterSnap[historyAfterSnap.length - 2].id;

      // Reset → Version objects deleted, but lane-history entry survives
      helper.command.resetAll();

      // Snap again and export
      helper.fixtures.populateComponents(2, undefined, 'v3');
      helper.command.snapAllComponentsWithoutBuild('-m "final snap"');
      helper.command.exportLane();

      const historyAfterExport = helper.command.laneHistoryParsed();
      finalSnapHistoryId = historyAfterExport[historyAfterExport.length - 1].id;

      // Fresh workspace: switch to the lane
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.switchRemoteLane('dev');
    });

    it('no args: should skip the orphaned entry and diff "final snap" against "first snap"', () => {
      // no args diffs latest (final snap) against predecessor.
      // predecessor is the orphaned entry, so it should automatically fall back to "first snap"
      const output = helper.command.runCmd('bit lane history-diff');
      expect(output).to.have.string('comp1');
      expect(output).to.have.string('comp2');
      expect(output).to.not.have.string('skipped');
    });

    it('one arg (final snap): should skip the orphaned predecessor and diff against "first snap"', () => {
      const output = helper.command.runCmd(`bit lane history-diff ${finalSnapHistoryId}`);
      expect(output).to.have.string('comp1');
      expect(output).to.have.string('comp2');
      expect(output).to.not.have.string('skipped');
    });

    it('one arg (orphaned entry): its versions are missing, should skip and diff against "new lane"', () => {
      // The orphaned entry is the "to". Its predecessor is "first snap" (available).
      // But the "to" versions themselves are orphaned, so components get skipped.
      const output = helper.command.runCmd(`bit lane history-diff ${orphanedHistoryId}`);
      expect(output).to.have.string('skipped');
    });

    it('two args (explicit): should show skipped message without fallback', () => {
      const output = helper.command.runCmd(`bit lane history-diff ${firstSnapHistoryId} ${orphanedHistoryId}`);
      expect(output).to.have.string('skipped');
    });
  });
});
