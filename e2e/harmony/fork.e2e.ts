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
    describe('validation errors', () => {
      let remoteScope: string;
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(2);
        helper.command.tagAllWithoutBuild();
        helper.command.export();
        remoteScope = helper.scopes.remote;
        helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
        helper.scopeHelper.addRemoteScope();
      });
      it('should throw an error when target-component-name is provided with pattern', () => {
        const forkCmd = () => helper.command.fork(`"${remoteScope}/*" comp2`);
        expect(forkCmd).to.throw('target-component-name is not allowed when using patterns');
      });
    });
    describe('fork with --scope flag', () => {
      let remoteScope: string;
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(2);
        helper.command.tagAllWithoutBuild();
        helper.command.export();
        remoteScope = helper.scopes.remote;
        helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
        helper.scopeHelper.addRemoteScope();
        helper.command.fork(`"${remoteScope}/*"`, `--scope ${helper.scopes.env} -x`);
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
        expect(showFork.config.forkedFrom.scope).to.equal(remoteScope);
      });
    });
    describe('fork with comma-separated pattern for specific component IDs', () => {
      let remoteScope: string;
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(3);
        helper.command.tagAllWithoutBuild();
        helper.command.export();
        remoteScope = helper.scopes.remote;
        helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
        helper.scopeHelper.addRemoteScope();
        // Fork using comma-separated pattern with specific component IDs (no wildcards)
        helper.command.fork(`"${remoteScope}/comp1,${remoteScope}/comp3"`, `--scope ${helper.scopes.env} -x`);
      });
      it('should fork the specified components', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(2);
      });
      it('should fork components with same names to the target scope', () => {
        const list = helper.command.listParsed();
        const forkedComps = list.filter((comp) => comp.id.includes(helper.scopes.env));
        expect(forkedComps).to.have.lengthOf(2);
      });
      it('bit show should show the forked components with reference to original', () => {
        const showFork1 = helper.command.showAspectConfig('comp1', Extensions.forking);
        expect(showFork1.config).to.have.property('forkedFrom');
        expect(showFork1.config.forkedFrom.scope).to.equal(remoteScope);

        const showFork3 = helper.command.showAspectConfig('comp3', Extensions.forking);
        expect(showFork3.config).to.have.property('forkedFrom');
        expect(showFork3.config.forkedFrom.scope).to.equal(remoteScope);
      });
    });
  });
});
