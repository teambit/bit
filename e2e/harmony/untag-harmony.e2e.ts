import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('untag components on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when an old version is missing from the scope', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      const v1Head = helper.command.getHead('comp1');
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.fixtures.populateComponents(1, undefined, 'v3');
      helper.command.tagAllWithoutBuild();
      const hashPath = helper.general.getHashPathOfObject(v1Head);
      helper.fs.deleteObject(hashPath);
    });
    // before, it was throwing: "error: version "0.0.1" of component scope/comp1 was not found"
    it('should untag successfully with no errors', () => {
      expect(() => helper.command.untagAll()).not.to.throw();
    });
  });
  describe('un-tagging a non-head version', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, undefined, 'v3');
      helper.command.tagAllWithoutBuild();
    });
    // before, it was removing the parents from 0.0.3
    it('should block the untag process', () => {
      expect(() => helper.command.untag('comp1', '0.0.2')).to.throw(
        'unable to untag "comp1", the version "0.0.2" is not the head'
      );
    });
  });
});
