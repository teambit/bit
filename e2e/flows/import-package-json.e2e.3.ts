import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('component with package.json as a file of the component', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('bit version >= 14.8.0 should ignore package.json files altogether', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.outputFile('bar/package.json');
      helper.fs.outputFile('bar/foo.js');
      helper.command.addComponent('bar');
      helper.command.tagAllWithoutBuild();
    });
    it('should not track the package.json file', () => {
      const bar = helper.command.catComponent('bar@latest');
      expect(bar.files).to.have.lengthOf(1);
    });
  });
});
