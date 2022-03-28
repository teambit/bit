import chai, { expect } from 'chai';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('aspect', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('run bit aspect set then generate component.json', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.setAspect('comp1', Extensions.forking, { configKey: 'configVal' });
      helper.command.ejectConf('comp1');
    });
    it('should write the aspect into the component.json file', () => {
      const compJson = helper.componentJson.read('comp1');
      expect(compJson.extensions).to.have.property(Extensions.forking);
    });
    it('should remove the "config" from the .bitmap file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp1).to.not.have.property('config');
    });
    describe('run bit aspect unset', () => {
      before(() => {
        helper.command.unsetAspect('comp1', Extensions.forking);
      });
      it('should remove the aspect from the component.json file', () => {
        const compJson = helper.componentJson.read('comp1');
        expect(compJson.extensions).to.not.have.property(Extensions.forking);
      });
    });
  });
});
