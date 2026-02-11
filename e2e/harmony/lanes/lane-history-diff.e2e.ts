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
});
