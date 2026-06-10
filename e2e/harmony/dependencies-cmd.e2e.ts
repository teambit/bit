import { IssuesClasses } from '@teambit/component-issues';
import { expect } from 'chai';
import { Extensions } from '@teambit/legacy.constants';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

describe('bit dependencies command', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('bit deps get', () => {
    describe('running the command on a new component', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.populateComponents(1);
      });
      it('should not throw an error saying the id is missing from the graph', () => {
        expect(() => helper.command.dependenciesGet('comp1')).to.not.throw();
      });
    });
  });
  describe('bit deps set', () => {
    describe('adding prod dep', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(3);
        helper.command.dependenciesSet('comp1', 'lodash@3.3.1');
      });
      it('bit show should show the newly added dep', () => {
        const show = helper.command.showComponent('comp1');
        expect(show).to.have.string('lodash@3.3.1');
      });
      describe('adding another dep as a devDep', () => {
        let showConfig: Record<string, any>;
        before(() => {
          helper.command.dependenciesSet('comp1', 'some-pkg@1.1.1', '--dev');
          showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        });
        it('should save the dev in the devDependencies', () => {
          const dep = showConfig.data.dependencies.find((d) => d.id === 'some-pkg');
          expect(dep).to.not.be.undefined;
          expect(dep.lifecycle).to.equal('dev');
        });
        it('should not remove the dep that was added before', () => {
          const dep = showConfig.data.dependencies.find((d) => d.id === 'lodash');
          expect(dep).to.not.be.undefined;
        });
        describe('ejecting config and changing a dependency', () => {
          before(() => {
            helper.command.ejectConf('comp1');
            helper.command.dependenciesSet('comp1', 'some-pkg@1.1.2', '--dev');
          });
          it('should not remove the dep that was added before', () => {
            const dep = showConfig.data.dependencies.find((d) => d.id === 'lodash');
            expect(dep).to.not.be.undefined;
          });
        });
      });
    });
    describe('adding multiple deps', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.populateComponents(1);
        helper.command.dependenciesSet('comp1', 'lodash@3.3.1 ramda@0.0.27');
      });
      it('should set them all', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
        expect(ramdaDep.version).to.equal('0.0.27');
        const lodashDep = showConfig.data.dependencies.find((d) => d.id === 'lodash');
        expect(lodashDep.version).to.equal('3.3.1');
      });
      describe('removing them with and without version', () => {
        before(() => {
          helper.command.dependenciesRemove('comp1', 'lodash@3.3.1 ramda');
        });
        it('should remove them all', () => {
          const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
          const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
          expect(ramdaDep).to.be.undefined;
          const lodashDep = showConfig.data.dependencies.find((d) => d.id === 'lodash');
          expect(lodashDep).to.be.undefined;
        });
      });
    });
    describe('adding scoped package', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.populateComponents(1);
        helper.command.dependenciesSet('comp1', '@scoped/button@3.3.1');
      });
      it('should set it correctly', () => {
        const show = helper.command.showComponent('comp1');
        expect(show).to.have.string('@scoped/button@3.3.1');
      });
    });
    describe('adding prod dep, tagging then adding devDep', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.dependenciesSet('comp1', 'lodash@3.3.1');
        helper.command.tagAllWithoutBuild();
        helper.command.dependenciesSet('comp1', 'ramda@0.0.20', '--dev');
      });
      it('should not remove the previously added dependencies', () => {
        const show = helper.command.showComponent('comp1');
        expect(show).to.have.string('lodash');
      });
    });
    describe('adding itself as a dep', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.populateComponents(1);
        helper.command.tagAllWithoutBuild();
        const pkgName = helper.general.getPackageNameByCompName('comp1', false);
        helper.command.dependenciesSet('comp1', `${pkgName}@0.0.1`);
      });
      it('should ignore it and not consider it as a dependency', () => {
        const deps = helper.command.getCompDepsIdsFromData('comp1');
        expect(deps).to.not.include(`${helper.scopes.remote}/comp1@0.0.1`);
      });
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('adding component dependency', () => {
      let npmCiRegistry: NpmCiRegistry;
      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.workspaceJsonc.setupDefault();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.fixtures.populateComponents(1, false);
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.compile();
        helper.command.install();
        helper.command.tagAllComponents();
        helper.command.export();
      });
      after(() => {
        npmCiRegistry.destroy();
        helper = new Helper();
      });
      describe('adding a component dependency when it is not installed locally', () => {
        before(() => {
          helper.scopeHelper.reInitWorkspace({ disableMissingManuallyConfiguredPackagesIssue: false });
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('comp1');
          helper.command.dependenciesSet('comp1', `${helper.general.getPackageNameByCompName('bar/foo')}@0.0.1`);
        });
        it('bit status should show it as missing', () => {
          helper.command.expectStatusToHaveIssue(IssuesClasses.MissingManuallyConfiguredPackages.name);
        });
        it('bit install should fix it', () => {
          helper.command.install();
          helper.command.expectStatusToNotHaveIssues();
        });
        it('should recognize it as a component after the installation', () => {
          const deps = helper.command.dependenciesGet('comp1');
          expect(deps).to.include('bar/foo@0.0.1');
        });
      });
    });
  });
  describe('bit deps remove - removing components', () => {
    describe('removing a component', () => {
      let beforeRemove: string;
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope({ addRemoteScopeAsDefaultScope: false });
        helper.fixtures.populateComponents(2);
        beforeRemove = helper.scopeHelper.cloneWorkspace();
      });
      it('should support component-id syntax', () => {
        const output = helper.command.dependenciesRemove('comp1', 'comp2');
        expect(output).to.not.include('nothing to remove');
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        expect(showConfig.config.policy.dependencies).to.deep.equal({ '@my-scope/comp2': '-' });
      });
      it('should support package-name syntax', () => {
        helper.scopeHelper.getClonedWorkspace(beforeRemove);
        helper.command.dependenciesRemove('comp1', '@my-scope/comp2');
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        expect(showConfig.config.policy.dependencies).to.deep.equal({ '@my-scope/comp2': '-' });
      });
    });
  });
  describe('bit deps remove - when other deps were set previously before tag', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.dependenciesSet('comp1', 'ramda@0.20.0 lodash@3.3.1');
      helper.command.tagWithoutBuild();
    });
    it('should remove only the dependency specified and leave the rest', () => {
      helper.command.dependenciesRemove('comp1', 'ramda');
      const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
      expect(showConfig.config.policy.dependencies).to.deep.equal({ lodash: '3.3.1' });
    });
  });
  describe('bit deps unset', () => {
    describe('one dep was specifically set and one dep was auto-detected', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.fs.writeFile('comp1/index.js', `import lodash from 'lodash';`);
        helper.npm.addFakeNpmPackage('lodash', '3.3.1');
        helper.command.dependenciesSet('comp1', 'ramda@0.20.0');
        helper.command.tagWithoutBuild();
      });
      describe('unset the auto-detected', () => {
        before(() => {
          helper.command.dependenciesUnset('comp1', 'lodash');
        });
        it('should not remove the dependency', () => {
          const deps = helper.command.showComponentParsedHarmonyByTitle('comp1', 'dependencies');
          const ids = deps.map((d) => d.id);
          expect(ids).to.include('lodash');
          expect(ids).to.include('ramda'); // just to make sure it didn't touch this as well.
        });
      });
      describe('unset the previously deps-set', () => {
        before(() => {
          helper.command.dependenciesUnset('comp1', 'ramda');
        });
        it('should remove the dependency', () => {
          const deps = helper.command.showComponentParsedHarmonyByTitle('comp1', 'dependencies');
          const ids = deps.map((d) => d.id);
          expect(ids).to.not.include('ramda');
          expect(ids).to.include('lodash'); // just to make sure it didn't change this
        });
      });
    });
  });
  describe('bit deps usage', () => {
    describe('finding a dependnecy', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.command.install('is-odd@3.0.1');
      });
      it('should return paths to subdependency', () => {
        expect(helper.command.dependenciesUsage('is-number')).to.contain('is-number@6.0.0');
      });
    });
  });
});
