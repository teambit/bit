import chai, { expect } from 'chai';
import path from 'path';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import Helper from '../../src/e2e-helper/e2e-helper';
import { generateRandomStr } from '../../src/utils';

chai.use(require('chai-fs'));

(supportNpmCiRegistryTesting ? describe : describe.skip)('deduplication', function () {
  let npmCiRegistry: NpmCiRegistry;
  let helper: Helper;
  let scopeWithoutOwner: string;
  let randomStr: string;
  let remote: string;
  this.timeout(0);
  before(async () => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
    helper.bitJsonc.setupDefault();
    remote = helper.scopes.remote;

    npmCiRegistry = new NpmCiRegistry(helper);
    await npmCiRegistry.init();
  });
  after(() => {
    npmCiRegistry.destroy();
    helper.scopeHelper.destroy();
  });
  describe('simple scenario', () => {
    before(() => {
      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `@ci/${randomStr}.{name}`;
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);

      // comp2 is a dependency of comp1
      helper.fixtures.populateComponents(2);
      helper.fs.outputFile(`comp1/index.js`, `const comp2 = require("@ci/${randomStr}.comp2");`);
      helper.command.tagAllComponents('--patch');
      helper.command.export();

      // A new version of comp2 is created
      helper.scopeHelper.reInitLocalScope();
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      helper.bitJsonc.addKeyValToWorkspace('defaultScope', scopeWithoutOwner);
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent(`comp2`);
      helper.fs.outputFile(`${scopeWithoutOwner}/comp2/foo.js`, '');
      helper.command.tagComponent('comp2', 'tag2', '--ver=0.0.2');
      helper.command.export();

      // comp1 is imported and the newest version of comp2 is installed
      helper.scopeHelper.reInitLocalScope();
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      helper.bitJsonc.addKeyValToWorkspace('defaultScope', scopeWithoutOwner);
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent(`comp1`);
      helper.command.install(`@ci/${randomStr}.comp2@0.0.2`);
    });
    it('should install the dependency from the workspace policy to the root modules directory', () => {
      expect(
        helper.fixtures.fs.readJsonFile(`node_modules/@ci/${randomStr}.comp2/package.json`).componentId.version
      ).to.equal('0.0.2');
    });
    it('should not nest/install the version from the component model to the component node_modules dir', () => {
      expect(
        path.join(helper.fixtures.scopes.localPath, `${remote}/comp1/node_modules/@ci/${randomStr}.comp2`)
      ).to.not.be.a.path();
    });
  });
  describe('complex scenario', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();

      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `@ci/${randomStr}.{name}`;
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);

      // 4 components are created: comp1, comp2, comp3, and comp-dep
      // comp1-comp3 all dependend on lodash.get
      // comp1 has a policy for lodash.get@3.7.0
      // comp2 has a policy for comp-dep@0.0.1
      helper.fixtures.populateComponents(3);
      helper.fs.outputFile('comp-dep/comp-dep.js', '');
      helper.command.addComponent('comp-dep');
      ['1', '2', '3'].forEach((compNumber) =>
        helper.fs.outputFile(
          `comp${compNumber}/index.js`,
          `const compDep = require("@ci/${randomStr}.comp-dep");
const get = require("lodash.get");`
        )
      );
      helper.command.install('lodash.get@4.4.0');
      helper.extensions.addExtensionToVariant('comp1', 'teambit.dependencies/dependency-resolver', {
        policy: {
          dependencies: {
            'lodash.get': '3.7.0',
          },
        },
      });
      helper.command.tagComponent('comp-dep', 'initial', '--ver=0.0.1');
      helper.command.export();
      helper.extensions.addExtensionToVariant('comp2', 'teambit.dependencies/dependency-resolver', {
        policy: {
          dependencies: {
            [`@ci/${randomStr}.comp-dep`]: '0.0.1',
          },
        },
      });
      helper.command.install();
      helper.command.tagAllComponents('--patch');
      helper.command.export();

      // comp4 is created with lodash.get@^4.4.0 in its dependencies
      helper.scopeHelper.reInitLocalScope();
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      helper.bitJsonc.addKeyValToWorkspace('defaultScope', scopeWithoutOwner);
      helper.scopeHelper.addRemoteScope();
      helper.command.install('lodash.get@^4.4.0');
      helper.fs.outputFile('comp4/comp4.js', 'const get = require("lodash.get");');
      helper.command.addComponent('comp4');
      helper.command.tagComponent('comp4', 'initial', '--ver=0.0.1');
      helper.command.export();

      // Releasing 2 new versions of comp-dep
      helper.scopeHelper.reInitLocalScope();
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      helper.bitJsonc.addKeyValToWorkspace('defaultScope', scopeWithoutOwner);
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent(`comp-dep`);
      helper.fs.outputFile(`${scopeWithoutOwner}/comp-dep/foo.js`, '');
      helper.command.tagComponent('comp-dep', 'tag2', '--ver=0.0.2');
      helper.command.export();
      helper.fs.outputFile(`${scopeWithoutOwner}/comp-dep/bar.js`, '');
      helper.command.tagComponent('comp-dep', 'tag3', '--ver=0.0.3');
      helper.command.export();

      // Creating a new component that has comp-dep@0.0.2 in dependencies
      helper.scopeHelper.reInitLocalScope();
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      helper.bitJsonc.addKeyValToWorkspace('defaultScope', scopeWithoutOwner);
      helper.scopeHelper.addRemoteScope();
      helper.fs.outputFile('comp5/comp5.js', `const comp = require("@ci/${randomStr}.comp-dep");`);
      helper.command.addComponent('comp5');
      helper.command.install(`@ci/${randomStr}.comp-dep@0.0.2`);
      helper.command.tagComponent('comp5', 'initial', '--ver=0.0.1');
      helper.command.export();

      // Importing comp1,2,3,4,5 and installing comp-dep@0.0.3 as a dependency
      helper.scopeHelper.reInitLocalScope();
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      helper.bitJsonc.addKeyValToWorkspace('defaultScope', scopeWithoutOwner);
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent(`comp1`);
      helper.command.importComponent(`comp2`);
      helper.command.importComponent(`comp3`);
      helper.command.importComponent(`comp4`);
      helper.command.importComponent(`comp5`);
      helper.command.install(`@ci/${randomStr}.comp-dep@0.0.3 lodash.get@4.4.2`);
    });
    it('should install the package version specified in the root workspace manifest to the root node_modules directory', () => {
      expect(helper.fixtures.fs.readJsonFile('node_modules/lodash.get/package.json').version).to.equal('4.4.2');
    });
    it('should install the component version specified in the root workspace manifest to the root node_modules directory', () => {
      expect(helper.fixtures.fs.readJsonFile(`node_modules/@ci/${randomStr}.comp-dep/package.json`).version).to.equal(
        '0.0.3'
      );
    });
    it("should install the component version specified in the dependent's policy to the dependent's node_modules directory", () => {
      expect(
        helper.fixtures.fs.readJsonFile(`${remote}/comp2/node_modules/@ci/${randomStr}.comp-dep/package.json`).version
      ).to.equal('0.0.1');
    });
    it("should not install a component to the dependent's node_modules directory if the resolved version matches the version from the root manifest", () => {
      expect(
        path.join(helper.fixtures.scopes.localPath, `${remote}/comp1/node_modules/@ci/${randomStr}.comp-dep`)
      ).to.not.be.a.path();
      expect(
        path.join(helper.fixtures.scopes.localPath, `${remote}/comp3/node_modules/@ci/${randomStr}.comp-dep`)
      ).to.not.be.a.path();
      expect(
        path.join(helper.fixtures.scopes.localPath, `${remote}/comp5/node_modules/@ci/${randomStr}.comp-dep`)
      ).to.not.be.a.path();
      const comp5Output = helper.command.showComponentParsed('comp5');
      expect(comp5Output.dependencies[0].id).to.equal(`${remote}/comp-dep@0.0.3`);
    });
    it("should not install a package to the dependent's node_modules directory if the resolved version matches the version from the root manifest", () => {
      expect(path.join(helper.fixtures.scopes.localPath, `${remote}/comp2/node_modules/lodash.get`)).to.not.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, `${remote}/comp3/node_modules/lodash.get`)).to.not.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, `${remote}/comp4/node_modules/lodash.get`)).to.not.be.a.path();
    });
    it("should install the package from the component's policy, even if a different version of the same package is in the root manifest", () => {
      const comp1Output = helper.command.showComponentParsed('comp1');
      expect(comp1Output.packageDependencies['lodash.get']).to.equal('3.7.0');
    });
    it("should install the package from the root manifest when the component doesn't have a policy for it", () => {
      const comp4Output = helper.command.showComponentParsed('comp4');
      expect(comp4Output.packageDependencies['lodash.get']).to.equal('4.4.2');
    });
  });
});
