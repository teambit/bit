import chai, { expect } from 'chai';
import * as path from 'path';

import { WRAPPER_DIR } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

const fixturePackageJson = { name: 'nice-package' };
const fixturePackageJsonV2 = { name: 'nice-package-v2' }; // name must be valid, otherwise, npm skips it and install from nested dirs

chai.use(require('chai-fs'));

describe('component with package.json as a file of the component', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  // legacy test. (tracking package.json is deprecated)
  describe('a component with package.json', () => {
    let consumerFiles;
    let bitMap;
    let componentMap;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.fs.createJsonFile('package.json', fixturePackageJson);
      const addOutput = helper.command.addComponent('package.json', { i: 'foo/pkg' });
      expect(addOutput).to.have.string('added package.json');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('foo/pkg');
      consumerFiles = helper.fs.getConsumerFiles('*.{js,json}');
      bitMap = helper.bitMap.read();
      componentMap = bitMap[`${helper.scopes.remote}/foo/pkg@0.0.1`];
    });
    it('should wrap the component files in a wrapper dir', () => {
      expect(consumerFiles).to.include(path.join('components/foo/pkg', WRAPPER_DIR, 'package.json'));
    });
    it('should keep Bit generated files outside of that wrapper dir', () => {
      expect(consumerFiles).to.include(path.normalize('components/foo/pkg/package.json'));
    });
    it('rootDir of the componentMap should not include the wrapper dir', () => {
      expect(componentMap.rootDir).to.equal('components/foo/pkg');
    });
    it('file paths on the componentMap should include the wrapper dir', () => {
      expect(componentMap.files[0].relativePath).to.equal('bit_wrapper_dir/package.json');
      expect(componentMap.mainFile).to.equal('bit_wrapper_dir/package.json');
    });
    it('should add wrapDir attribute to the componentMap', () => {
      expect(componentMap).to.have.property('wrapDir');
      expect(componentMap.wrapDir).to.equal(WRAPPER_DIR);
    });
    it('bit status should not show the component as modified', () => {
      helper.command.expectStatusToBeClean();
    });
    describe('having files in the rootDir outside the wrapDir', () => {
      before(() => {
        helper.fs.createFile('components/foo/pkg', 'bar.js');
      });
      it('should not automatically add them to the component', () => {
        helper.command.expectStatusToBeClean();
      });
      it('should prevent users from deliberately adding them', () => {
        const output = helper.command.addComponent('components/foo/pkg/bar.js', { i: 'foo/pkg' });
        expect(output).to.have.string('no files to track');
      });
    });
    describe('importing the component using isolated environment', () => {
      let isolatePath;
      before(() => {
        isolatePath = helper.command.isolateComponent('foo/pkg', '-olw');
      });
      it('should create the package.json file in the wrap dir', () => {
        expect(path.join(isolatePath, WRAPPER_DIR, 'package.json')).to.be.a.file();
      });
    });
  });
  // legacy test. (tracking package.json is deprecated)
  describe('a component with package.json in an shared directory with another file', () => {
    let consumerFiles;
    let bitMap;
    let componentMap;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.fs.createJsonFile('bar/package.json', fixturePackageJson);
      helper.fs.createFile('bar', 'foo.js');
      const addOutput = helper.command.addComponent('bar', { i: 'bar/foo', m: 'foo.js' });
      expect(addOutput).to.have.string('package.json');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      consumerFiles = helper.fs.getConsumerFiles('*.{js,json}');
      bitMap = helper.bitMap.read();
      componentMap = bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`];
    });
    it('should keep the files inside the sharedDir and not strip that dir', () => {
      expect(consumerFiles).to.include(path.join('components/bar/foo/bar/package.json'));
      expect(consumerFiles).to.include(path.join('components/bar/foo/bar/foo.js'));
    });
    it('componentMap to not have originallySharedDir', () => {
      expect(componentMap).to.not.have.property('originallySharedDir');
    });
    it('bit status should not show the component as modified', () => {
      helper.command.expectStatusToBeClean();
    });
    describe('importing the component using isolated environment', () => {
      let isolatePath;
      before(() => {
        isolatePath = helper.command.isolateComponent('bar/foo', '-olw');
      });
      it('should keep the package.json file in the shared dir', () => {
        expect(path.join(isolatePath, 'bar', 'package.json')).to.be.a.file();
      });
    });
  });
  // legacy test. (tracking package.json is deprecated)
  describe('a component requires another component with package.json', () => {
    let consumerFiles;
    let bitMap;
    let componentMapBarFoo;
    let componentMapFooPkg;
    let afterExportScope;
    const fooFixture = 'require("./package.json");';
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.fs.createJsonFile('package.json', fixturePackageJson);
      helper.command.addComponent('package.json', { i: 'foo/pkg' });
      helper.fs.createFile('', 'foo.js', fooFixture);
      helper.command.addComponent('foo.js', { i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      afterExportScope = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      consumerFiles = helper.fs.getConsumerFiles('*.{js,json}');
      bitMap = helper.bitMap.read();
      componentMapBarFoo = bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`];
      componentMapFooPkg = bitMap[`${helper.scopes.remote}/foo/pkg@0.0.1`];
    });
    it('should wrap the nested component (the dependency) with the wrap dir', () => {
      expect(consumerFiles).to.include(
        path.join('components/.dependencies/foo/pkg', helper.scopes.remote, '0.0.1', WRAPPER_DIR, 'package.json')
      );
    });
    it('should wrap the component files in a wrapper dir', () => {
      // even though the component (bar/foo) doesn't require the root package.json, it still needs
      // to be wrapped because its dependency does require the root package.json. to be able to
      // generate the links to the dependency, it must be inside a wrapper dir
      expect(consumerFiles).to.include(path.join('components/bar/foo', WRAPPER_DIR, 'foo.js'));
    });
    it('should generate a link to the correct path of its dependency package.json file', () => {
      const linkPath = path.join('components/bar/foo', WRAPPER_DIR, 'package.json');
      expect(path.join(helper.scopes.localPath, linkPath)).to.be.a.path();
      const linkContent = helper.fs.readJsonFile(linkPath);
      expect(linkContent).to.be.deep.equal(fixturePackageJson);
    });
    it('should save the wrapDir attribute of the dependency', () => {
      expect(componentMapFooPkg).to.have.property('wrapDir');
      expect(componentMapFooPkg.wrapDir).to.equal(WRAPPER_DIR);
    });
    it('should save the wrapDir attribute of the dependent', () => {
      expect(componentMapBarFoo).to.have.property('wrapDir');
      expect(componentMapBarFoo.wrapDir).to.equal(WRAPPER_DIR);
    });
    it('should wrap the files of the dependency', () => {
      expect(componentMapFooPkg.files[0].relativePath).to.equal('bit_wrapper_dir/package.json');
    });
    it('should wrap the files of the dependent', () => {
      expect(componentMapBarFoo.files[0].relativePath).to.equal('bit_wrapper_dir/foo.js');
    });
    describe('importing these two components, changing them and tagging', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterExportScope);
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        helper.command.importComponent('foo/pkg');

        // an intermediate step, make sure the components are not modified
        helper.command.expectStatusToBeClean();

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        helper.fs.createJsonFile(`components/foo/pkg/${WRAPPER_DIR}/package.json`, fixturePackageJsonV2);
        helper.command.tagAllComponents();
      });
      it('should strip the wrap dir when saving the component into the scope', () => {
        const fooPkg = helper.command.catComponent(`${helper.scopes.remote}/foo/pkg@latest`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(fooPkg.mainFile).to.equal('package.json');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(fooPkg.files[0].relativePath).to.equal('package.json');
      });
      it('should strip the wrap dir from the dependent', () => {
        const barFoo = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.mainFile).to.equal('foo.js');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.files[0].relativePath).to.equal('foo.js');
      });
      it('should strip the wrap dir from the dependency relative paths', () => {
        const barFoo = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.dependencies[0].relativePaths[0].sourceRelativePath).to.equal('package.json');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.dependencies[0].relativePaths[0].destinationRelativePath).to.equal('package.json');
      });

      describe('export the updated components and re-import them for author', () => {
        before(() => {
          helper.command.exportAllComponents();
          helper.scopeHelper.getClonedLocalScope(afterExportScope);

          // scenario 1: import bar/foo then foo/pkg. we had a bug here. it imported bar/foo as
          // authored (as expected) but foo/pkg as nested. then, after running the import for
          // foo/pkg it changed the record to imported. Now, it doesn't change it to imported
          // but leave it as authored
          helper.command.importComponent('bar/foo');
          helper.command.importComponent('foo/pkg');

          // scenario 2: import all components from .bitmap, we have a bug as well, for some
          // reason, it imports the objects but doesn't update the file system.
          // helper.command.importAllComponents(true);
        });
        it('should not add wrapDir for the author', () => {
          expect(path.join(helper.scopes.localPath, WRAPPER_DIR)).to.not.have.a.path();
        });
        it('should not override the author package.json', () => {
          const packageJson = helper.packageJson.read();
          expect(packageJson.name).to.equal(fixturePackageJsonV2.name);
        });
        it('should not show the component as modified', () => {
          helper.command.expectStatusToBeClean();
        });
        describe('running bit link', () => {
          before(() => {
            helper.command.runCmd('bit link');
          });
          it('should not override the author package.json', () => {
            const packageJson = helper.packageJson.read();
            expect(packageJson.name).to.equal(fixturePackageJsonV2.name);
          });
          it('should not show the component as modified', () => {
            helper.command.expectStatusToBeClean();
          });
        });
      });
    });
  });
  describe('bit version >= 14.8.0 should ignore package.json files altogether', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.outputFile('bar/package.json');
      helper.fs.outputFile('bar/foo.js');
      helper.command.addComponent('bar');
      helper.command.tagAllWithoutBuild();
    });
    it('should not track the package.json file', () => {
      const bar = helper.command.catComponent('bar@latest');
      expect(bar.files).to.have.lengthOf(1);
    });
  });
});
