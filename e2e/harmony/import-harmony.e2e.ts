import chai, { expect } from 'chai';
import path from 'path';
import { Helper, DEFAULT_OWNER, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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
          helper.scopeHelper.reInitWorkspace();
          helper.scopeHelper.addRemoteScope();
          helper.npm.initNpm();
          helper.npm.installNpmPackage(`@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1`, '0.0.1');
          helper.fs.outputFile(
            'bar/app.js',
            `const comp1 = require('@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1').default;\nconsole.log(comp1())`
          );
          helper.command.addComponent('bar');
          // as an intermediate step, make sure the scope is empty.
          const localScope = helper.command.listLocalScopeParsed();
          expect(localScope).to.have.lengthOf(0);

          helper.command.runCmd('bit insights'); // this command happened to run the build-one-graph.
          // importOutput = helper.command.importAllComponents();
        });
        // it('should import the components objects that were installed as packages', () => {
        //   expect(importOutput).to.have.string('successfully imported one component');
        // });
        it('the scope should have the dependencies and the flattened dependencies', () => {
          const localScope = helper.command.listLocalScopeParsed();
          expect(localScope).to.have.lengthOf(3);
        });
      });
      describe('importing the components', () => {
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          npmCiRegistry.setResolver();
          helper.command.importComponent('comp1');
        });
        it('should not save the dependencies as components', () => {
          helper.bitMap.expectToHaveId('comp1', '0.0.1', helper.scopes.remote);
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
          helper.scopeHelper.reInitWorkspace();
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
          helper.scopeHelper.reInitWorkspace();
          const comp1Pkg = `@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1`;
          helper.command.install(comp1Pkg);
          npmCiRegistry.setResolver();

          // as an intermediate step, make sure the package is listed in the workspace config.
          const workspaceConf = helper.workspaceJsonc.getPolicyFromDependencyResolver();
          expect(workspaceConf.dependencies).to.have.property(comp1Pkg);

          helper.command.importComponent('comp1');
        });
        it('should remove the package from workspace.jsonc', () => {
          const workspaceConf = helper.workspaceJsonc.getPolicyFromDependencyResolver();
          expect(workspaceConf.dependencies).to.be.empty;
        });
      });
      describe('importing a component, modify it and then importing its dependent', () => {
        let output;
        before(() => {
          helper.scopeHelper.reInitWorkspace();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.importAllComponents(); // to save all refs.
      afterFirstExport = helper.scopeHelper.cloneWorkspace();
      helper.fixtures.populateComponents(1, undefined, ' v3');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const bitMap = helper.bitMap.read();
      helper.scopeHelper.getClonedWorkspace(afterFirstExport);
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fs.outputFile('foo/index.js');
      helper.fs.outputFile('bar/index.js');
      helper.command.addComponent('foo');
      helper.command.addComponent('bar', { n: 'foo' });
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      scopeBeforeImport = helper.scopeHelper.cloneWorkspace();
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
        helper.scopeHelper.getClonedWorkspace(scopeBeforeImport);
        helper.command.importComponent('foo');
      });
      it('should not throw when importing the child and should increment its base-path and preserve the suffix', () => {
        expect(() => helper.command.importComponent('foo/bar')).to.not.throw();
        expect(path.join(helper.scopes.localPath, helper.scopes.remoteWithoutOwner, 'foo_1/bar')).to.be.a.directory();
      });
    });
    describe('import the child dir first and then the parent', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(scopeBeforeImport);
        helper.command.importComponent('foo/bar');
      });
      it('should not throw when importing the parent and should increment the path', () => {
        expect(() => helper.command.importComponent('foo -O')).to.not.throw('unable to add');
        expect(path.join(helper.scopes.localPath, helper.scopes.remoteWithoutOwner, 'foo_1')).to.be.a.directory();
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'import and install components with pre-release versions',
    () => {
      let scopeWithoutOwner: string;
      before(async () => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
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
          helper.scopeHelper.reInitWorkspace();
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
          helper.scopeHelper.reInitWorkspace();
          npmCiRegistry.setResolver();
          helper.command.importComponent('comp1');
        });
        it('should import the component with the pre-release correctly', () => {
          helper.bitMap.expectToHaveId('comp1', '0.0.1-beta.0', helper.scopes.remote);
        });
        // previously, it threw an error: "error: version 0.0.1.0 is not a valid semantic version. learn more: https://semver.org"
        it('bit status should be clean with no errors', () => {
          helper.command.expectStatusToBeClean();
        });
      });
    }
  );
  describe('changing the component default directory', () => {
    let beforeImport: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      beforeImport = helper.scopeHelper.cloneWorkspace();
    });
    it('should import with no errors when defaultDirectory has "{owner}" placeholder', () => {
      helper.workspaceJsonc.setComponentsDir('{owner}/{name}');
      expect(() => helper.command.importComponent('comp1')).to.not.throw();
    });
    it('should import with no errors when defaultDirectory has "{scope-id}" placeholder', () => {
      helper.scopeHelper.getClonedWorkspace(beforeImport);
      helper.workspaceJsonc.setComponentsDir('{scopeId}/{name}');
      expect(() => helper.command.importComponent('comp1')).to.not.throw();
    });
    it('should throw an error when the placeholder is not supported', () => {
      helper.scopeHelper.getClonedWorkspace(beforeImport);
      helper.workspaceJsonc.setComponentsDir('{hello}/{name}');
      expect(() => helper.command.importComponent('comp1')).to.throw();
    });
  });
  describe('importing a component with @types dependency when current workspace does not have it', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fs.outputFile('bar/foo.ts', `import cors from 'cors'; console.log(cors);`);
      helper.command.add('bar');
      helper.command.install('cors@^2.8.5 @types/cors@^2.8.10');

      // intermediate step, make sure the types are saved in the
      const show = helper.command.showComponentParsed('bar');
      expect(show.devPackageDependencies).to.include({ '@types/cors': '^2.8.10' });

      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar');
    });
    it('bit status should not show it as modified', () => {
      helper.command.expectStatusToBeClean();
    });
    it('bit show should show the typed dependency', () => {
      const show = helper.command.showComponentParsed('bar');
      expect(show.devPackageDependencies).to.include({ '@types/cors': '^2.8.10' });
    });
  });
  describe('with --track-only flag', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      const emptyBitMap = helper.bitMap.read();
      helper.command.importComponent('*');
      helper.fs.writeFile(`${helper.scopes.remote}/comp1/file`, 'hello');
      helper.bitMap.write(emptyBitMap);

      helper.command.importComponent('*', '--track-only');
    });
    it('should only add the entries to the .bitmap without writing files', () => {
      helper.bitMap.expectToHaveId('comp1');
      expect(path.join(helper.scopes.localPath, `${helper.scopes.remote}/comp1/file`)).to.be.a.file();
    });
  });
  describe('import with deps having different versions than workspace.jsonc', () => {
    const initWsWithVer = (ver: string) => {
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.addPolicyToDependencyResolver({
        dependencies: {
          'lodash.get': ver,
        },
      });
      helper.npm.addFakeNpmPackage('lodash.get', ver.replace('^', '').replace('~', ''));
      helper.command.importComponent('comp1', '-x');
    };
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/foo.js', `const get = require('lodash.get'); console.log(get);`);
      helper.workspaceJsonc.addPolicyToDependencyResolver({
        dependencies: {
          'lodash.get': '^4.4.2',
        },
      });
      helper.npm.addFakeNpmPackage('lodash.get', '4.4.2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    it('if the ws has a lower range, it should update workspace.jsonc with the new range', () => {
      initWsWithVer('^4.4.1');
      const policy = helper.workspaceJsonc.getPolicyFromDependencyResolver();
      expect(policy.dependencies['lodash.get']).to.equal('^4.4.2');
    });

    it('if the ws has a higher range, it should not update', () => {
      initWsWithVer('^4.4.3');
      const policy = helper.workspaceJsonc.getPolicyFromDependencyResolver();
      expect(policy.dependencies['lodash.get']).to.equal('^4.4.3');
    });

    it('if the ws has a lower exact version, it should write a conflict', () => {
      initWsWithVer('4.4.1');
      const policy = helper.workspaceJsonc.readRaw();
      expect(policy).to.have.string('<<<<<<< ours');
      expect(policy).to.have.string('"lodash.get": "4.4.1"');
      expect(policy).to.have.string('"lodash.get": "^4.4.2"');
      expect(policy).to.have.string('>>>>>>> theirs');
    });
  });
  describe('import with --dependents', () => {
    // create the following graph:
    // comp1 -> comp2 -> comp3 -> comp4
    // comp1 -> comp-a -> comp4
    // comp1 -> comp-a2 -> comp3 -> comp4
    // comp1 -> comp-b
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(4);
      helper.fs.outputFile('comp-a/index.js', `require('${helper.general.getPackageNameByCompName('comp4', false)}');`);
      helper.fs.outputFile(
        'comp-a2/index.js',
        `require('${helper.general.getPackageNameByCompName('comp3', false)}');`
      );
      helper.fs.outputFile('comp-b/index.js');
      helper.command.addComponent('comp-a');
      helper.command.addComponent('comp-b');
      helper.command.addComponent('comp-a2');
      helper.command.compile();
      helper.fs.appendFile(
        'comp1/index.js',
        `\nrequire('${helper.general.getPackageNameByCompName('comp-a', false)}');
        require('${helper.general.getPackageNameByCompName('comp-a2', false)}')`
      );
      helper.fs.appendFile(
        'comp1/index.js',
        `\nrequire('${helper.general.getPackageNameByCompName('comp-b', false)}');`
      );

      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1', '-x');
    });
    it('without "through" should import all graphs between the given component and the workspace', () => {
      helper.command.importComponent('comp4', '--dependents -x --silent');
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('comp2');
      expect(bitMap).to.have.property('comp3');
      expect(bitMap).to.have.property('comp4');
      expect(bitMap).to.have.property('comp-a');
      expect(bitMap).to.have.property('comp-a2');
      expect(bitMap).to.not.have.property('comp-b');
    });
    it('with --dependents-via should limit to graph traversing through the given id', () => {
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1', '-x');

      helper.command.importComponent('comp4', `--dependents-via ${helper.scopes.remote}/comp2 -x --silent`);
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('comp2');
      expect(bitMap).to.have.property('comp3');
      expect(bitMap).to.have.property('comp4');
      expect(bitMap).to.not.have.property('comp-a');
      expect(bitMap).to.not.have.property('comp-b');
    });
  });
  describe('import when component.json has a local env', () => {
    let envId: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      envId = helper.env.setCustomEnv();
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', 'node-env');
      helper.command.ejectConf('comp1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.importComponent('comp1', '-x');
    });
    it('should not modified the component.json of the other component to add invalid env info', () => {
      const fullEnvId = `${helper.scopes.remote}/${envId}`;
      const componentJson = helper.componentJson.read('comp1');
      expect(componentJson.extensions).to.have.property(fullEnvId);
      expect(componentJson.extensions).to.not.have.property(`${fullEnvId}@0.0.1`);
    });
  });
  describe('import with pattern matching for nested namespaces', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // Create components with nested namespace structure similar to the bug report
      // Create a component directly under examples/
      helper.fs.outputFile('examples/hello-world/index.js', 'console.log("hello from examples");');
      helper.command.addComponent('examples/hello-world', { n: 'examples/hello-world' });

      // Create a component with nested namespace beta/vitest-4/examples/
      helper.fs.outputFile('beta/vitest-4/examples/hello-world/index.js', 'console.log("hello from beta");');
      helper.command.addComponent('beta/vitest-4/examples/hello-world', { n: 'beta/vitest-4/examples/hello-world' });

      // Create another component in beta but not under examples
      helper.fs.outputFile('beta/other/component/index.js', 'console.log("other beta component");');
      helper.command.addComponent('beta/other/component', { n: 'beta/other/component' });

      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
    });

    describe('importing with pattern "examples/**"', () => {
      before(() => {
        helper.command.importComponent('examples/**', '-x');
      });

      it('should only import components directly under examples/, not nested namespaces containing examples', () => {
        const list = helper.command.listParsed();
        const ids = list.map((c) => c.id);
        // First check we have the right number of components
        expect(list).to.have.lengthOf(1);
        // Check we imported the correct component (direct child of examples/)
        expect(ids[0]).to.include('examples/hello-world');
        // Ensure we didn't import the nested namespace component
        const idsStr = ids.join(',');
        expect(idsStr).to.not.include('beta/vitest-4/examples/hello-world');
      });
    });
  });
});
