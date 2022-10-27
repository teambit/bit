import { expect } from 'chai';

import Helper, { FileStatusWithoutChalk } from '../../src/e2e-helper/e2e-helper';

describe('handling binary files in Bit', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('checkout with a binary file', () => {
    let afterFirstTag: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.fixtures.copyFixtureFile('png/png-fixture1.png', 'comp1/icon.png');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      afterFirstTag = helper.scopeHelper.cloneLocalScope();
      helper.fixtures.copyFixtureFile('png/png-fixture2.png', 'comp1/icon.png');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    describe('when there is a conflict', () => {
      let checkoutOutput: string;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterFirstTag);
        helper.fixtures.copyFixtureFile('png/png-fixture3.png', 'comp1/icon.png');
        helper.command.import();
        checkoutOutput = helper.command.checkoutHead('--all --manual');
      });
      it('should checkout with no errors and leave the file as is indicating there was a conflict', () => {
        expect(checkoutOutput).to.include(FileStatusWithoutChalk.binaryConflict);
      });
    });
    describe('when there is no conflict', () => {
      let checkoutOutput: string;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterFirstTag);
        helper.command.import();
        checkoutOutput = helper.command.checkoutHead('--all');
      });
      it('should checkout with no errors and show the binary file as updated', () => {
        expect(checkoutOutput).to.not.include(FileStatusWithoutChalk.binaryConflict);
        expect(checkoutOutput).to.include(FileStatusWithoutChalk.updated);
      });
    });
  });
});
