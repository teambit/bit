import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('lane history with merge operations', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('merging a lane when the target lane is behind (fast-forward merge, no snap)', () => {
    let historyBeforeMerge: any[];
    let historyAfterMerge: any[];
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);

      // Create lane-a with initial components
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('-m "initial snap on lane-a"');
      helper.command.exportLane();

      // Record history before creating lane-b
      historyBeforeMerge = helper.command.laneHistoryParsed();

      // Create lane-b from lane-a (fork)
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild('-m "changes on lane-b"');
      helper.command.exportLane();

      // Switch back to lane-a
      helper.command.switchLocalLane('lane-a', '-x');

      // Merge lane-b into lane-a (fast-forward since lane-a hasn't changed)
      helper.command.mergeLane('lane-b', '-x');

      // Get history after merge
      historyAfterMerge = helper.command.laneHistoryParsed();
    });

    it('should have added a history entry for the merge operation', () => {
      // The history should have one more entry than before
      expect(historyAfterMerge.length).to.be.greaterThan(historyBeforeMerge.length);
    });

    it('should have a history entry with "merge" message', () => {
      const mergeEntry = historyAfterMerge.find((entry) => entry.message && entry.message.includes('merge'));
      expect(mergeEntry).to.not.be.undefined;
    });

    it('should include the full source lane identifier in the merge history message', () => {
      const mergeEntry = historyAfterMerge.find((entry) => entry.message && entry.message.includes('merge'));
      expect(mergeEntry?.message).to.include(`${helper.scopes.remote}/lane-b`);
    });
  });
});
