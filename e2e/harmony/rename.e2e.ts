import { expect } from 'chai';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit rename command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('rename an exported component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.rename('comp1', 'comp2');
    });
    it('should create a new component', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
    it('should deprecate the original component', () => {
      const showDeprecation = helper.command.showAspectConfig('comp1', Extensions.deprecation);
      expect(showDeprecation.config.deprecate).to.be.true;
      expect(showDeprecation.config).to.have.property('newId');
      expect(showDeprecation.config.newId.name).to.equal('comp2');
    });
    it('should reference the original component in the new component', () => {
      const showDeprecation = helper.command.showAspectConfig('comp2', Extensions.renaming);
      expect(showDeprecation.config).to.have.property('renamedFrom');
      expect(showDeprecation.config.renamedFrom.name).to.equal('comp1');
    });
    it('should list both components', () => {
      const list = helper.command.listParsed();
      const ids = list.map((_) => _.id);
      expect(ids).to.include(`${helper.scopes.remote}/comp1`);
      expect(ids).to.include('comp2');
    });
  });
});
