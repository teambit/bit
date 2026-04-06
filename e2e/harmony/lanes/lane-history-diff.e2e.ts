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
   * Verifies that `bit reset` removes lane-history entries for the reset snaps.
   *
   * Flow: snap A → export → snap B → reset → snap C → export.
   * The reset deletes snap B's Version objects AND its lane-history entry (keyed by batchId).
   * After export, a fresh workspace should see only entries for snap A and snap C — no orphans.
   */
  describe('bit reset removes the lane-history entry of the reset snap', () => {
    let historyEntries: any[];
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('-m "snap A"');
      helper.command.exportLane();

      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild('-m "snap B"');

      helper.command.resetAll();

      helper.fixtures.populateComponents(2, undefined, 'v3');
      helper.command.snapAllComponentsWithoutBuild('-m "snap C"');
      helper.command.exportLane();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.switchRemoteLane('dev');

      historyEntries = helper.command.laneHistoryParsed();
    });

    it('should not have a lane-history entry for the reset snap', () => {
      const messages = historyEntries.map((e: any) => e.message || '');
      expect(messages.some((m: string) => m.includes('snap B'))).to.be.false;
    });

    it('no args: should diff latest against its predecessor without errors', () => {
      const output = helper.command.runCmd('bit lane history-diff');
      expect(output).to.have.string('comp1');
      expect(output).to.have.string('comp2');
      expect(output).to.not.have.string('Diff failed');
    });

    it('with one arg (latest id): should diff against predecessor without errors', () => {
      const latestId = historyEntries[historyEntries.length - 1].id;
      const output = helper.command.runCmd(`bit lane history-diff ${latestId}`);
      expect(output).to.have.string('comp1');
      expect(output).to.have.string('comp2');
      expect(output).to.not.have.string('Diff failed');
    });
  });
});
