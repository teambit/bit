import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import { DEFAULT_OWNER } from '../../src/e2e-helper/e2e-scopes';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('import functionality on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  before(() => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace with TS components', () => {
    let scopeWithoutOwner: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
      helper.fixtures.populateComponentsTS(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('tag and export', () => {
      before(async () => {
        await npmCiRegistry.init();
        helper.command.tagAllComponents();
        helper.command.export();
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      describe('installing dependencies as packages, requiring them and then running build-one-graph', () => {
        // let importOutput;
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.scopeHelper.addRemoteScope();
          helper.npm.initNpm();
          helper.npm.installNpmPackage(`@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1`, '0.0.1');
          helper.fs.outputFile(
            'bar/app.js',
            `const comp1 = require('@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1').default;\nconsole.log(comp1())`
          );
          helper.command.addComponent('bar');
          // as an intermediate step, make sure the scope is empty.
          const localScope = helper.command.listLocalScopeParsed('--scope');
          expect(localScope).to.have.lengthOf(0);

          helper.command.runCmd('bit insights'); // this command happened to run the build-one-graph.
          // importOutput = helper.command.importAllComponents();
        });
        // it('should import the components objects that were installed as packages', () => {
        //   expect(importOutput).to.have.string('successfully imported one component');
        // });
        it('the scope should have the dependencies and the flattened dependencies', () => {
          const localScope = helper.command.listLocalScopeParsed('--scope');
          expect(localScope).to.have.lengthOf(3);
        });
      });
      describe('importing the components', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          npmCiRegistry.setResolver();
          helper.command.importComponent('comp1');
        });
        it('should not save the dependencies as components', () => {
          helper.bitMap.expectToHaveIdHarmony('comp1', '0.0.1', helper.scopes.remote);
          const bitMap = helper.bitMap.readComponentsMapOnly();
          expect(bitMap).not.to.have.property(`comp2`);
          expect(bitMap).not.to.have.property(`comp3`);
        });
        it('bit status should be clean with no errors', () => {
          helper.command.expectStatusToBeClean();
        });
      });
      describe('import with --path flag', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          npmCiRegistry.setResolver();
          helper.command.importComponentWithOptions('comp1', { p: 'src' });
        });
        it('should import to the specified path', () => {
          expect(path.join(helper.scopes.localPath, 'src')).to.be.a.directory();
          const bitMap = helper.bitMap.read();
          const bitMapEntry = bitMap.comp1;
          expect(bitMapEntry.rootDir).to.equal('src');
        });
      });
      describe('installing a component as a package and then importing it directly', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          const comp1Pkg = `@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1`;
          helper.command.install(comp1Pkg);
          npmCiRegistry.setResolver();

          // as an intermediate step, make sure the package is listed in the workspace config.
          const workspaceConf = helper.bitJsonc.getPolicyFromDependencyResolver();
          expect(workspaceConf.dependencies).to.have.property(comp1Pkg);

          helper.command.importComponent('comp1');
        });
        it('should remove the package from workspace.jsonc', () => {
          const workspaceConf = helper.bitJsonc.getPolicyFromDependencyResolver();
          expect(workspaceConf.dependencies).to.be.empty;
        });
      });
      describe('importing a component, modify it and then importing its dependent', () => {
        let output;
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          npmCiRegistry.setResolver();
          helper.command.importComponent('comp2');
          helper.fs.appendFile(`${scopeWithoutOwner}/comp2/index.ts`);
          output = helper.command.importComponent('comp1');
        });
        it('should not throw an error asking to use --override flag', () => {
          expect(output).to.have.string('successfully imported');
        });
      });
    });
  });
  describe('tag, export, clean scope objects, tag and export', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
      helper.command.export();
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importAllComponents();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.command.tagAllComponents();
    });
    it('should export with no errors about missing artifacts (pkg file) from the first tag', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });
  describe('import delta (bit import without ids) when local is behind', () => {
    let afterFirstExport: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.importAllComponents(); // to save all refs.
      afterFirstExport = helper.scopeHelper.cloneLocalScope();
      helper.fixtures.populateComponents(1, undefined, ' v3');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const bitMap = helper.bitMap.read();
      helper.scopeHelper.getClonedLocalScope(afterFirstExport);
      helper.bitMap.write(bitMap);
    });
    it('should not fetch existing versions, only the missing', () => {
      const importOutput = helper.command.import();
      expect(importOutput).to.not.include('3 new version');
      expect(importOutput).to.include('1 new version(s) available, latest 0.0.3');
    });
  });
  describe('multiple components some are directory of others', () => {
    let scopeBeforeImport: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fs.outputFile('foo/index.js');
      helper.fs.outputFile('bar/index.js');
      helper.command.addComponent('foo');
      helper.command.addComponent('bar', { n: 'foo' });
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      scopeBeforeImport = helper.scopeHelper.cloneLocalScope();
    });
    describe('import them all at the same time', () => {
      before(() => {
        helper.command.importComponent('*');
      });
      it('should change the parent directory path and add _1 to the path', () => {
        helper.scopes.remoteWithoutOwner;
        const parentDir = path.join(helper.scopes.localPath, helper.scopes.remoteWithoutOwner, 'foo_1');
        expect(parentDir).to.be.a.directory();
        const originalParentDir = path.join(helper.scopes.localPath, helper.scopes.remoteWithoutOwner, 'foo');
        expect(originalParentDir).to.be.a.directory();
      });
    });
    describe('import the parent dir first and then the child', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeImport);
        helper.command.importComponent('foo');
      });
      it('should throw when importing the child', () => {
        expect(() => helper.command.importComponent('foo/bar')).to.throw('unable to add');
      });
    });
    describe('import the child dir first and then the parent', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeImport);
        helper.command.importComponent('foo/bar');
      });
      it('should throw when importing the child', () => {
        expect(() => helper.command.importComponent('foo -O')).to.throw('unable to add');
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'import and install components with pre-release versions',
    () => {
      let scopeWithoutOwner: string;
      before(async () => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
        scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
        helper.fixtures.populateComponents(3);
        npmCiRegistry = new NpmCiRegistry(helper);
        npmCiRegistry.configureCiInPackageJsonHarmony();
        await npmCiRegistry.init();
        helper.command.tagAllComponents('--increment prerelease --prerelease-id beta');
        helper.command.export();
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      describe('install as packages', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.scopeHelper.addRemoteScope();
          helper.npm.initNpm();
        });
        it('should be able to install the package with no errors', () => {
          const installFunc = () =>
            helper.npm.installNpmPackage(`@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1`, '0.0.1-beta.0');
          expect(installFunc).to.not.throw();
        });
      });
      describe('importing the components', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          npmCiRegistry.setResolver();
          helper.command.importComponent('comp1');
        });
        it('should import the component with the pre-release correctly', () => {
          helper.bitMap.expectToHaveIdHarmony('comp1', '0.0.1-beta.0', helper.scopes.remote);
        });
        // previously, it threw an error: "error: version 0.0.1.0 is not a valid semantic version. learn more: https://semver.org"
        it('bit status should be clean with no errors', () => {
          helper.command.expectStatusToBeClean();
        });
      });
    }
  );
});
