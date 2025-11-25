import { expect } from 'chai';
import { Extensions } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('bit fork command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
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
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
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
  describe('fork multiple components using pattern', () => {
    let remoteBeforeFork: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      remoteBeforeFork = helper.scopes.remote;
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.scopeHelper.addRemoteScope();
    });
    it('should throw an error when target-component-name is provided with pattern', () => {
      const forkCmd = () => helper.command.fork(`"${remoteBeforeFork}/*" comp2`);
      expect(forkCmd).to.throw('target-component-name is not allowed when using patterns');
    });
    it('should throw an error when no scope is provided and no defaultScope is set', () => {
      const forkCmd = () => helper.command.fork(`"${remoteBeforeFork}/*"`);
      expect(forkCmd).to.throw('no target scope specified');
    });
    describe('fork with --scope flag', () => {
      before(() => {
        helper.command.fork(`"${remoteBeforeFork}/*"`, `--scope ${helper.scopes.env} -x`);
      });
      it('should fork all matching components', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(2);
      });
      it('should fork components with same names to the target scope', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(2);
        list.forEach((comp) => {
          expect(comp.id).to.include(helper.scopes.env);
        });
      });
      it('bit show should show the forked components with reference to original', () => {
        const showFork = helper.command.showAspectConfig('comp1', Extensions.forking);
        expect(showFork.config).to.have.property('forkedFrom');
        expect(showFork.config.forkedFrom.scope).to.equal(remoteBeforeFork);
      });
    });
  });
});
