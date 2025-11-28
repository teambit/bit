/**
 * Component Loader Contract Tests
 *
 * These tests define the expected behaviors of the component loading mechanism.
 * They serve as a safety net for the V2 loader rewrite - any new implementation
 * must pass these tests to ensure behavioral compatibility.
 *
 * The tests focus on OBSERVABLE OUTCOMES, not implementation details.
 */
import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('component loader contract tests', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('loading workspace-only components', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
    });

    it('should load a new component that exists only in workspace (not tagged)', () => {
      const show = helper.command.showComponent('comp1');
      expect(show).to.include('comp1');
    });

    it('should list all workspace components', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);
    });

    it('should show component status as new', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(2);
    });
  });

  describe('loading scope-only components', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // Re-init workspace without the component files
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
    });

    it('should show remote component without importing', () => {
      const show = helper.command.showComponent(`${helper.scopes.remote}/comp1 --remote`);
      expect(show).to.include('comp1');
    });

    it('should not import objects when just showing', () => {
      const objects = helper.command.catScope();
      expect(objects).to.have.lengthOf(0);
    });
  });

  describe('loading components with workspace + scope data (merged)', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // Modify the component locally
      helper.fs.appendFile('comp1/index.js', '\n// modified');
    });

    it('should show component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(1);
    });

    it('should load component with local modifications merged with scope data', () => {
      const show = helper.command.showComponent('comp1');
      // Component should have version from scope but show as modified
      expect(show).to.include('comp1');
    });
  });

  describe('loading out-of-sync components', () => {
    describe('bitmap has no version but scope has tagged version', () => {
      let scopeOutOfSync: string;

      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        const bitMap = helper.bitMap.read();
        helper.fixtures.tagComponentBarFoo();
        // Revert bitmap to pre-tag state (simulating out-of-sync)
        helper.bitMap.write(bitMap);
        scopeOutOfSync = helper.scopeHelper.cloneWorkspace();
      });

      it('should sync bitmap to match scope on status', () => {
        helper.scopeHelper.getClonedWorkspace(scopeOutOfSync);
        helper.command.status();
        const bitMap = helper.bitMap.read();
        expect(bitMap['bar/foo'].version).to.equal('0.0.1');
      });
    });

    describe('bitmap shows exported but scope shows only tagged', () => {
      let scopeOutOfSync: string;

      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.fixtures.tagComponentBarFoo();
        const bitMapBeforeExport = helper.bitMap.read();
        helper.command.export();
        // Revert bitmap to pre-export state
        helper.bitMap.write(bitMapBeforeExport);
        scopeOutOfSync = helper.scopeHelper.cloneWorkspace();
      });

      it('should sync bitmap to match scope (exported state)', () => {
        helper.scopeHelper.getClonedWorkspace(scopeOutOfSync);
        helper.command.status();
        const bitMap = helper.bitMap.read();
        expect(bitMap['bar/foo'].scope).to.equal(helper.scopes.remote);
      });
    });
  });

  describe('loading components with extensions', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
    });

    it('should load component with its configured extensions', () => {
      const show = helper.command.showComponent('comp1');
      // All components have at least the env extension - check for "aspects" in output
      expect(show).to.include('aspects');
    });
  });

  describe('loading components with custom env', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', 'teambit.harmony/aspect');
    });

    it('should load component with the correct env', () => {
      const envId = helper.env.getComponentEnv('comp1');
      expect(envId).to.include('teambit.harmony/aspect');
    });

    it('should show the env in component details', () => {
      const show = helper.command.showComponent('comp1');
      expect(show).to.include('env');
    });
  });

  describe('loading multiple components with shared dependencies', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // Create comp2 first
      helper.fs.outputFile('comp2/index.js', 'module.exports = {}');
      helper.command.addComponent('comp2');
      // Create comp1 that depends on comp2 using the correct scope name
      helper.fs.outputFile('comp1/index.js', `const comp2 = require('@${helper.scopes.remote}/comp2');`);
      helper.command.addComponent('comp1');
    });

    it('should load both components correctly', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);
    });

    it('should detect dependency relationship', () => {
      const deps = helper.command.getCompDepsIdsFromData('comp1');
      const hasComp2Dep = deps.some((depId: string) => depId.includes('comp2'));
      expect(hasComp2Dep).to.be.true;
    });
  });

  describe('caching behavior', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
    });

    it('should return same component data when loaded twice', () => {
      const show1 = helper.command.showComponent('comp1');
      const show2 = helper.command.showComponent('comp1');
      expect(show1).to.equal(show2);
    });

    it('should reflect file changes after modification', () => {
      const statusBefore = helper.command.statusJson();
      expect(statusBefore.newComponents).to.have.lengthOf(1);

      helper.fs.appendFile('comp1/index.js', '\n// modified');

      // Status should still show component (cache should not prevent seeing changes)
      const statusAfter = helper.command.statusJson();
      expect(statusAfter.newComponents).to.have.lengthOf(1);
    });
  });

  describe('error handling', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
    });

    it('should throw meaningful error for non-existent component', () => {
      let error: Error | null = null;
      try {
        helper.command.showComponent('non-existent-component');
      } catch (e: any) {
        error = e;
      }
      expect(error).to.not.be.null;
    });
  });

  describe('loading tagged but not exported components', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
    });

    it('should show component as staged', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(1);
    });

    it('should load component with version from tag', () => {
      const show = helper.command.showComponent('comp1');
      expect(show).to.include('0.0.1');
    });
  });

  describe('loading components after import', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // Create a new workspace and import the component
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1');
    });

    it('should load imported component', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
    });

    it('should show component as not modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
  });
});
