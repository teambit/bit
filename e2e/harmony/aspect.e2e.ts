import { UNABLE_TO_LOAD_EXTENSION } from '@teambit/aspect-loader/constants';
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
  describe('aspect loading failures', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.command.create('aspect', 'my-aspect');
      helper.bitJsonc.addKeyVal('my-scope/my-aspect', {});
    });
    it('commands with loaders should show a descriptive error', () => {
      const output = helper.command.status();
      expect(output).to.have.string(
        UNABLE_TO_LOAD_EXTENSION('my-scope/my-aspect', "Cannot find module '@teambit/harmony'")
      );
    });
    it('commands without loaders should not show the entire stacktrace', () => {
      const output = helper.command.list();
      expect(output).to.not.have.string('Require stack');
    });
    it('using --log=error it should show the stacktrace', () => {
      const output = helper.command.list('--log=error');
      expect(output).to.have.string('Require stack');
    });
  });
});
