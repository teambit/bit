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
      expect(() => helper.command.runCmd(`bit lane history-diff ${firstId}`)).to.throw(
        'is the first entry and has no predecessor'
      );
    });
  });

  /**
   * Scenario: snap → reset → snap → export.
   * Before the fix, reset would delete Version objects but leave the lane-history entry,
   * creating an orphaned entry. Now, reset also removes the corresponding lane-history entry
   * (keyed by batchId), so the history stays clean.
   *
   * History timeline after reset cleanup (oldest→newest):
   *   [0] "new lane"        (empty, always available)
   *   [1] "first snap"      (exported, available)
   *   [2] "final snap"      (exported, available)
   *   (the "local snap" entry is removed by reset)
   */
  describe('lane history after snap-reset-snap (no orphaned entries)', () => {
    let historyEntries: any[];
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('-m "first snap"');
      helper.command.exportLane();

      // Snap locally (creates lane-history entry + Version objects)
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild('-m "local snap"');

      // Reset → both Version objects and lane-history entry are removed
      helper.command.resetAll();

      // Snap again and export
      helper.fixtures.populateComponents(2, undefined, 'v3');
      helper.command.snapAllComponentsWithoutBuild('-m "final snap"');
      helper.command.exportLane();

      // Fresh workspace: switch to the lane
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.switchRemoteLane('dev');

      historyEntries = helper.command.laneHistoryParsed();
    });

    it('should not have an orphaned entry in the history', () => {
      // We expect 3 entries: "new lane", "first snap", "final snap".
      // The "local snap" entry should have been removed by reset.
      const messages = historyEntries.map((e: any) => e.message || '');
      expect(messages.some((m: string) => m.includes('local snap'))).to.be.false;
    });

    it('no args: should diff "final snap" against "first snap" without errors', () => {
      const output = helper.command.runCmd('bit lane history-diff');
      expect(output).to.have.string('comp1');
      expect(output).to.have.string('comp2');
      expect(output).to.not.have.string('Diff failed');
    });

    it('with one arg (final snap id): should diff against "first snap" without errors', () => {
      const finalSnapId = historyEntries[historyEntries.length - 1].id;
      const output = helper.command.runCmd(`bit lane history-diff ${finalSnapId}`);
      expect(output).to.have.string('comp1');
      expect(output).to.have.string('comp2');
      expect(output).to.not.have.string('Diff failed');
    });
  });
});
