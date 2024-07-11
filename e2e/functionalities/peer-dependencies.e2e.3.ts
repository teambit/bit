import path from 'path';
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-string'));

describe('peer-dependencies functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when a package is a regular dependency and a peer dependency', () => {
    let catComponent;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.workspaceJsonc.addPolicyToDependencyResolver({ peerDependencies: { chai: '>= 2.1.2 < 5' } });
      helper.npm.addFakeNpmPackage('chai', '2.4');
      helper.fixtures.createComponentBarFoo("import chai from 'chai';");
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      catComponent = helper.command.catComponent('bar/foo@latest');
    });
    it('should save the peer dependencies in the model', () => {
      expect(catComponent).to.have.property('peerPackageDependencies');
      expect(catComponent.peerPackageDependencies).to.have.property('chai');
      expect(catComponent.peerPackageDependencies.chai).to.equal('>= 2.1.2 < 5');
    });
    it('should not save the peer-dependency as a package-dependency nor as a dev-package-dependency', () => {
      expect(catComponent.packageDependencies).to.not.have.property('chai');
      expect(catComponent.devPackageDependencies).to.not.have.property('chai');
    });
    it('bit show should display the peer dependencies', () => {
      const output = helper.command.showComponentParsed('bar/foo');
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.have.property('chai');
      expect(output.peerPackageDependencies.chai).to.equal('>= 2.1.2 < 5');
    });
    describe('when the component is imported', () => {
      before(() => {
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.command.export();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        // const output = helper.command.importComponent('bar/foo');
        // expect(output).to.have.string('requires a peer'); // this was probably changed in Harmony
        // helper.npm.addFakeNpmPackage('chai', '2.4'); // it's not automatically installed because it's a peer-dependency
      });
      it('should not be shown as modified', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });

  describe('when a package is only a peer dependency but not required in the code', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.workspaceJsonc.addPolicyToDependencyResolver({ peerDependencies: { chai: '>= 2.1.2 < 5' } });
      helper.npm.addFakeNpmPackage('chai', '2.4');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
    });
    it('should not save the peer dependencies in the model', () => {
      const output = helper.command.catComponent('bar/foo@latest');
      expect(output).to.have.property('peerPackageDependencies');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(output.peerPackageDependencies).to.not.have.property('chai');
    });
    it('bit show should not display the peer dependencies', () => {
      const output = helper.command.showComponentParsed('bar/foo');
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.not.have.property('chai');
    });
  });

  describe('a component is a peer dependency', () => {
    let workspaceCapsulesRootDir: string;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponents(2);
      helper.workspaceJsonc.addPolicyToDependencyResolver({
        peerDependencies: { [`@${helper.scopes.remote}/comp2`]: '*' },
      });
      helper.command.build();
      workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
    });
    it('should save the peer dependency in the model', () => {
      const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
      expect(output.peerDependencies[0]).to.deep.equal({
        id: `${helper.scopes.remote}/comp2`,
        relativePaths: [],
        packageName: `@${helper.scopes.remote}/comp2`,
        versionRange: '*',
      });
      const depResolver = output.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
      const peerDep = depResolver.data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${helper.scopes.remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.version).to.eq('latest');
      expect(peerDep.versionRange).to.eq('*');
    });
    it('adds peer dependency to the generated package.json', () => {
      const pkgJson = fs.readJsonSync(
        path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1/package.json`)
      );
      expect(pkgJson.peerDependencies).to.deep.equal({
        [`@${helper.scopes.remote}/comp2`]: '*',
      });
    });
  });

  // @todo: this test randomly fails, it'll fixed later by Zoltan
  (supportNpmCiRegistryTesting ? describe.skip : describe.skip)(
    'a component is a peer dependency added by an env',
    function () {
      let workspaceCapsulesRootDir: string;
      let peerPkgName: string;
      let npmCiRegistry: NpmCiRegistry;
      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.extensions.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
        helper.command.create('module', 'peer-dep');
        helper.command.tagAllComponents();
        helper.command.export();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('peer-dep');
        peerPkgName = `@ci/${helper.scopes.remoteWithoutOwner}.peer-dep`;
        helper.env.setCustomNewEnv(
          undefined,
          undefined,
          {
            policy: {
              peers: [
                {
                  name: peerPkgName,
                  supportedRange: '*',
                  version: '0.0.1',
                },
              ],
            },
          },
          false,
          'custom-env/env1',
          'custom-env/env1'
        );

        helper.fixtures.populateComponents(1);
        helper.fs.outputFile(`comp1/index.js`, `const peerDep = require("${peerPkgName}"); // eslint-disable-line`);
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
        helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-env/env1`, {});
        helper.extensions.addExtensionToVariant('custom-env', 'teambit.envs/env', {});
        helper.command.install('--add-missing-deps');
        helper.command.build('--skip-tests');
        workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      });
      after(() => {
        helper.scopeHelper.destroy();
        npmCiRegistry.destroy();
      });
      it('should save the peer dependency in the model', () => {
        const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
        expect(output.peerDependencies[0]).to.deep.equal({
          id: `${helper.scopes.remote}/peer-dep@0.0.1`,
          relativePaths: [],
          packageName: peerPkgName,
          versionRange: '*',
        });
        const depResolver = output.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
        const peerDep = depResolver.data.dependencies[0];
        expect(peerDep.packageName).to.eq(peerPkgName);
        expect(peerDep.lifecycle).to.eq('peer');
        expect(peerDep.version).to.eq('0.0.1');
        expect(peerDep.versionRange).to.eq('*');
      });
      it('adds peer dependency to the generated package.json', () => {
        const pkgJson = fs.readJsonSync(
          path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1/package.json`)
        );
        expect(pkgJson.peerDependencies).to.deep.equal({
          [peerPkgName]: '*',
        });
      });
    }
  );

  (supportNpmCiRegistryTesting ? describe.skip : describe.skip)(
    'a component is a peer dependency added by dep set',
    function () {
      let workspaceCapsulesRootDir: string;
      let npmCiRegistry: NpmCiRegistry;
      let peerName: string;
      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.extensions.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
        helper.command.create('module', 'peer-dep');
        helper.command.tagAllComponents('--build --skip-tests');
        helper.command.export();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();

        helper.fixtures.populateComponents(1);
        peerName = `@ci/${helper.scopes.remoteWithoutOwner}.peer-dep`;
        helper.fs.outputFile(`comp1/index.js`, `const peerDep = require("${peerName}"); // eslint-disable-line`);
        helper.command.dependenciesSet('comp1', `${peerName}@*`, '--peer');
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
        helper.command.install('--add-missing-deps');
        helper.command.build('--skip-tests');
        workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      });
      after(() => {
        helper.scopeHelper.destroy();
        npmCiRegistry.destroy();
      });
      it('should save the peer dependency in the model', () => {
        const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
        expect(output.peerDependencies[0]).to.deep.equal({
          id: `${helper.scopes.remote}/peer-dep@0.0.1`,
          relativePaths: [],
          packageName: peerName,
          versionRange: '*',
        });
        const depResolver = output.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
        const peerDep = depResolver.data.dependencies[0];
        expect(peerDep.packageName).to.eq(peerName);
        expect(peerDep.lifecycle).to.eq('peer');
        expect(peerDep.version).to.eq('0.0.1');
        expect(peerDep.versionRange).to.eq('*');
      });
      it('adds peer dependency to the generated package.json', () => {
        const pkgJson = fs.readJsonSync(
          path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1/package.json`)
        );
        expect(pkgJson.peerDependencies).to.deep.equal({
          [peerName]: '*',
        });
      });
    }
  );

  describe('peer dependency is not broken after snap', () => {
    let workspaceCapsulesRootDir: string;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponents(2);
      helper.command.dependenciesSet('comp1', `@${helper.scopes.remote}/comp2@*`, '--peer');
      helper.command.snapAllComponents();
      helper.command.build();
      workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
    });
    it('should save the peer dependency in the model', () => {
      const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
      const peerDepData = output.peerDependencies[0];
      expect(peerDepData.id).to.startWith(`${helper.scopes.remote}/comp2`);
      expect(peerDepData.packageName).to.startWith(`@${helper.scopes.remote}/comp2`);
      expect(peerDepData.versionRange).to.startWith('*');
      const depResolver = output.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
      const peerDep = depResolver.data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${helper.scopes.remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.versionRange).to.eq('*');
    });
    it('should save the peer dependency in the scope data', () => {
      const comp = helper.command.catComponent(`comp1@latest`);
      const depResolver = comp.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
      const peerDep = depResolver.data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${helper.scopes.remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.versionRange).to.eq('*');
    });
    it('adds peer dependency to the generated package.json', () => {
      const { head } = helper.command.catComponent('comp1');
      const pkgJson = fs.readJsonSync(
        path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1@${head}/package.json`)
      );
      expect(pkgJson.peerDependencies).to.deep.equal({
        [`@${helper.scopes.remote}/comp2`]: '*',
      });
    });
  });
});
