import { expect } from 'chai';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import { HttpHelper } from '../http-helper';

// @TODO: fix for Windows
(IS_WINDOWS ? describe.skip : describe)('http protocol', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  let httpHelper: HttpHelper;
  describe('export lane', () => {
    before(async () => {
      httpHelper = new HttpHelper(helper);
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      await httpHelper.start();
      helper.scopeHelper.addRemoteHttpScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.exportLane();
    });
    it('lane list -r --json should show the remote lanes', () => {
      const output = helper.command.listRemoteLanesParsed();
      expect(output.lanes).to.have.lengthOf(2);
      expect(output.lanes[0].id.name).to.have.string('dev');
    });
    it('lane list -r should show the remote lanes', () => {
      const cmd = () => helper.command.listRemoteLanes();
      expect(cmd).to.not.throw();
    });
    it('bit import on a local lane tracked to a valid remote scope should not throw an error', () => {
      helper.command.createLane('test');
      const cmd = () => helper.command.install();
      expect(cmd).to.not.throw();
    });
    // previously it was throwing UnexpectedNetworkError without any message.
    it('bit lane remove -r should not remove the remote lane without --force flag as it was not fully merged', () => {
      expect(() => helper.command.removeRemoteLane()).to.throw(
        'unable to remove dev lane, it is not fully merged. to disregard this error, please use --force flag'
      );
    });
    it('bit lane remove -r -f should remove the remote lane', () => {
      helper.command.removeRemoteLane('dev', '--force');
      const output = helper.command.listRemoteLanesParsed();
      expect(output.lanes).to.have.lengthOf(1);
    });
    // previously it was throwing UnexpectedNetworkError without any message.
    it('bit lane remove -r of a non-existing lane should throw a descriptive error', () => {
      expect(() => helper.command.removeRemoteLane('non-exist')).to.throw(
        `lane "${helper.scopes.remote}/non-exist" was not found`
      );
    });
    after(() => {
      httpHelper.killHttp();
    });
  });
  describe('export with deleted components', () => {
    before(async () => {
      httpHelper = new HttpHelper(helper);
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      await httpHelper.start();
      helper.scopeHelper.addRemoteHttpScope();
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.deleteComponent('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('bit list should not show the removed component', () => {
      const list = helper.command.listRemoteScopeParsed();
      expect(list).to.have.lengthOf(1);
      expect(list[0].id).to.not.have.string('comp2');
    });
    it('bit list --include-deleted should show the removed component', () => {
      const list = helper.command.listRemoteScopeParsed('--include-deleted');
      expect(list).to.have.lengthOf(2);
      const ids = list.map((c) => c.id);
      expect(ids).to.include(`${helper.scopes.remote}/comp2`);
    });
    it('bit import of the entire scope should not bring in the deleted components', () => {
      helper.command.importComponent('*', '-x');
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
      expect(list[0].id).to.not.have.string('comp2');
    });
    after(() => {
      httpHelper.killHttp();
    });
  });
  describe('export', () => {
    let exportOutput: string;
    let scopeAfterExport: string;
    before(async () => {
      httpHelper = new HttpHelper(helper);
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.extensions.addExtensionToVariant('*', 'teambit.react/react', {});
      await httpHelper.start();
      helper.scopeHelper.addRemoteHttpScope();
      helper.fixtures.populateComponents();
      helper.command.tagAllComponents();
      exportOutput = helper.command.export();
      scopeAfterExport = helper.scopeHelper.cloneWorkspace();
    });
    after(() => {
      httpHelper.killHttp();
    });
    it('should export successfully', () => {
      expect(exportOutput).to.have.string('exported the following 3 component');
    });
    describe('bit log', () => {
      let logOutput: string;
      before(() => {
        logOutput = helper.command.log(`${helper.scopes.remote}/comp1 --remote`);
      });
      it('should show the log correctly', () => {
        expect(logOutput).to.have.string('tag 0.0.1');
        expect(logOutput).to.have.string('author');
        expect(logOutput).to.have.string('date');
      });
    });
    describe('bit import', () => {
      let importOutput;
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteHttpScope();
        importOutput = helper.command.importComponent('comp1');
      });
      it('should import successfully', () => {
        expect(importOutput).to.have.string('successfully imported one component');
      });
    });
    describe('bit remove --remote', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(scopeAfterExport);
      });
      it('should show descriptive error when removing component that has dependents', () => {
        const output = helper.command.removeComponentFromRemote(`${helper.scopes.remote}/comp2`);
        expect(output).to.have.string(`error: unable to delete ${helper.scopes.remote}/comp2`);
        expect(output).to.have.string(`${helper.scopes.remote}/comp1`);
      });
      it('should remove successfully components that has no dependents', () => {
        const output = helper.command.removeComponentFromRemote(`${helper.scopes.remote}/comp1`);
        expect(output).to.have.string('successfully removed components');
        expect(output).to.have.string('comp1');
      });
    });
  });
  describe('import with pattern matching for nested namespaces', () => {
    before(async () => {
      httpHelper = new HttpHelper(helper);
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      await httpHelper.start();
      helper.scopeHelper.addRemoteHttpScope();

      // Create components with nested namespace structure
      // Component directly under examples/
      helper.fs.outputFile('examples/hello-world/index.js', 'console.log("hello from examples");');
      helper.command.addComponent('examples/hello-world', { n: 'examples/hello-world' });

      // Component with nested namespace beta/vitest-4/examples/
      helper.fs.outputFile('beta/vitest-4/examples/hello-world/index.js', 'console.log("hello from beta");');
      helper.command.addComponent('beta/vitest-4/examples/hello-world', { n: 'beta/vitest-4/examples/hello-world' });

      // Another component in beta but not under examples
      helper.fs.outputFile('beta/other/component/index.js', 'console.log("other beta component");');
      helper.command.addComponent('beta/other/component', { n: 'beta/other/component' });

      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // Reinit workspace to test importing
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteHttpScope();
    });

    it('should only import components directly under examples/ when using "examples/**" pattern', () => {
      helper.command.importComponent('examples/**', '-x');
      const list = helper.command.listParsed();
      const ids = list.map((c) => c.id);

      // Should only import the component directly under examples/, not nested namespaces
      expect(list).to.have.lengthOf(1);
      expect(ids[0]).to.include('examples/hello-world');

      // Should NOT have imported the nested namespace component
      const idsStr = ids.join(',');
      expect(idsStr).to.not.include('beta/vitest-4/examples/hello-world');
    });

    after(() => {
      httpHelper.killHttp();
    });
  });
});
