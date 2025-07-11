import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane command part 5', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('multiple scopes when the components are new', () => {
    let anotherRemote: string;
    let anotherRemotePath: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      anotherRemotePath = scopePath;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.fs.outputFile('bar1/index.js', 'const bar2 = require("../bar2"); console.log(bar2);');
      helper.fs.outputFile('bar2/index.js', 'console.log("v1");');
      helper.command.add('bar1');
      helper.command.add('bar2', `--scope ${anotherRemote}`);
      helper.command.linkAndRewire();

      helper.command.compile();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
    });
    describe('exporting the lane to the remote', () => {
      before(() => {
        helper.command.export();
      });
      // previously, it was changing the scope-name of bar2 to the first remote.
      it('should not change the scope of the components in .bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.bar2.scope).to.equal(anotherRemote);
      });
      // previously, it was changing the scope-name of bar2 to the first remote.
      it('should not change the scope-name in the lane object', () => {
        const lane = helper.command.catLane('dev');
        const bar2 = lane.components.find((c) => c.id.name === 'bar2');
        expect(bar2.id.scope).to.equal(anotherRemote);
      });
      describe('importing the lane', () => {
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.scopeHelper.addRemoteScope();
          helper.scopeHelper.addRemoteScope(anotherRemotePath); // needed to fetch the head from the original scope.
          helper.command.switchRemoteLane('dev');
        });
        it('should not show the component as staged', () => {
          helper.command.expectStatusToBeClean();
        });
      });
    });
  });
  describe('multiple scopes when main is ahead', () => {
    let anotherRemote: string;
    let localScope: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fs.outputFile('bar1/foo1.js', 'console.log("v1");');
      helper.fs.outputFile('bar2/foo2.js', 'console.log("v1");');
      helper.command.addComponent('bar1');
      helper.command.addComponent('bar2');
      helper.command.setScope(anotherRemote, 'bar2');
      helper.command.compile();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      localScope = helper.scopeHelper.cloneWorkspace();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.import(`${scopeName}/bar2`);
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(localScope);
      helper.command.import();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    // previously, it used to error with "error: version "0.0.2" of component jozc1y79-remote2/bar2 was not found."
    it('should be able to export', () => {
      expect(() => helper.command.export()).to.not.throw();
      // import used to throw as well
      expect(() => helper.command.import()).to.not.throw();
    });
  });
  describe('multiple scopes when a component in the origin is different than on the lane', () => {
    let anotherRemote: string;
    let beforeExport: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(1);
      helper.command.setScope(anotherRemote, 'comp1');
      beforeExport = helper.scopeHelper.cloneWorkspace();

      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(beforeExport);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit export should throw an error', () => {
      expect(() => helper.command.export()).to.throw('unable to export a lane with a new component');
    });
  });
  describe('multiple scopes when a scope of the component does not exist', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.setScope('non-exist-scope', 'comp1');
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit export should throw an error saying the scope does not exist', () => {
      expect(() => helper.command.export()).to.throw('cannot find scope');
    });
  });
  describe('multiple scopes when the origin-scope exits but does not have the component. only lane-scope has it', () => {
    let anotherRemote: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(1);
      helper.command.setScope(anotherRemote, 'comp1');
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
    });
    // should not throw an error "the component {component-name} has no versions and the head is empty."
    it('bit import should not throw an error', () => {
      expect(() => helper.command.import()).to.not.throw();
    });
  });
});
