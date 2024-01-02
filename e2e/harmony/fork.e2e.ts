import { expect } from 'chai';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit fork command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.fixtures.populateComponents(1);
    helper.command.tagAllWithoutBuild();
    helper.command.export();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('fork a local component', () => {
    before(() => {
      helper.command.fork('comp1 comp2');
    });
    it('should create a new component', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
    it('bit show should show the forked component', () => {
      const showFork = helper.command.showAspectConfig('comp2', Extensions.forking);
      expect(showFork.config).to.have.property('forkedFrom');
      expect(showFork.config.forkedFrom.name).to.equal('comp1');
    });
    it('.bitmap should not have internal config fields', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp2.config[Extensions.forking]).to.not.have.property('__specific');
    });
  });
  describe('fork a component with --no-link', () => {
    before(() => {
      helper.command.fork('comp1 comp-no-link', '--no-link');
    });
    it('bit show should not show the forked component', () => {
      const showFork = helper.command.showAspectConfig('comp-no-link', Extensions.forking);
      expect(showFork).to.be.undefined;
    });
  });
  describe('fork a remote component with no --target-id flag', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope({ addRemoteScopeAsDefaultScope: false });
      helper.scopeHelper.addRemoteScope();
      helper.command.fork(`${helper.scopes.remote}/comp1`);
    });
    it('should create a new component', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
    it('should name the new component, same as the old one', () => {
      const list = helper.command.listParsed();
      expect(list[0].id).to.equal('my-scope/comp1');
    });
    it('bit show should show the forked component', () => {
      const showFork = helper.command.showAspectConfig('comp1', Extensions.forking);
      expect(showFork.config).to.have.property('forkedFrom');
      expect(showFork.config.forkedFrom.name).to.equal('comp1');
    });
  });
});
