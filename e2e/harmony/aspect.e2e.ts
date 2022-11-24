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
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes({ addRemoteScopeAsDefaultScope: false });
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
  describe('bit aspect update command', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.command.create('aspect', 'my-aspect');
      helper.command.compile();
      helper.command.install();
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1);
      helper.command.setAspect('comp1', `${helper.scopes.remote}/my-aspect`);
      helper.command.tagWithoutBuild('comp1');
      helper.command.tagWithoutBuild('my-aspect', '--unmodified --skip-auto-tag');
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1');

      // intermediate step. make sure comp1 has my-aspect with the first version.
      const show = helper.command.showComponent('comp1');
      expect(show).to.have.string(`${helper.scopes.remote}/my-aspect@0.0.1`);
      expect(show).not.to.have.string(`${helper.scopes.remote}/my-aspect@0.0.2`);

      output = helper.command.updateAspect(`${helper.scopes.remote}/my-aspect`);
    });
    it('should output the affected components', () => {
      expect(output).to.have.string(`${helper.scopes.remote}/comp1@0.0.1`);
    });
    it('should not add the previous aspect with minus to .bitmap file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp1.config).to.not.have.property(`${helper.scopes.remote}/my-aspect@0.0.1`);
      expect(bitMap.comp1.config).to.have.property(`${helper.scopes.remote}/my-aspect@0.0.2`);
    });
    it('bit show should show the new aspect', () => {
      const show = helper.command.showComponent('comp1');
      expect(show).to.have.string(`${helper.scopes.remote}/my-aspect@0.0.2`);
      expect(show).not.to.have.string(`${helper.scopes.remote}/my-aspect@0.0.1`);
    });
    it('running the same command again, should not show a message that no component is using this aspect', () => {
      const secondRun = helper.command.updateAspect(`${helper.scopes.remote}/my-aspect`);
      expect(secondRun).to.have.string('are already up to date');
      expect(secondRun).to.not.have.string('unable to find any component');
    });
    it('bit tag should save only the updated aspect and not the old one', () => {
      helper.command.importComponent('my-aspect'); // otherwise, the tag will try to get it as a package
      helper.command.tagAllComponents();
      const cmp = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`, undefined, false);
      expect(cmp).to.have.string(`${helper.scopes.remote}/my-aspect@0.0.2`);
      expect(cmp).not.to.have.string(`${helper.scopes.remote}/my-aspect@0.0.1`);
    });
  });
});
