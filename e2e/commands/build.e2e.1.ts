import chai, { expect } from 'chai';
import * as path from 'path';

import { COMPONENT_DIST_PATH_TEMPLATE } from '../../src/constants';
import ComponentsPendingImport from '../../src/consumer/component-ops/exceptions/components-pending-import';
import Helper from '../../src/e2e-helper/e2e-helper';

const assertArrays = require('chai-arrays');
chai.use(require('chai-fs'));

chai.use(assertArrays);

describe('bit build', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('without any component in the workspace', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.build();
    });
    it('should indicate that there is nothing to build', () => {
      const output = helper.command.build();
      expect(output).to.have.string('nothing to build');
    });
  });
  describe('as author', () => {
    let scopeBeforeTagging;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      scopeBeforeTagging = helper.scopeHelper.cloneLocalScope();
    });
    it('should not be able to build without importing a build env', () => {
      const output = helper.command.build();
      expect(output).to.have.string('nothing to build');
    });
    describe('build after importing a compiler', () => {
      let buildOutput;
      before(() => {
        const output = helper.env.importCompiler();
        expect(output).to.have.string(
          `the following component environments were installed\n- ${helper.scopes.env}/compilers/babel@`
        );
        buildOutput = helper.command.build();
      });
      it('should successfully import and build using the babel compiler', () => {
        expect(buildOutput).to.have.string(path.normalize('dist/bar/foo.js.map'));
        expect(buildOutput).to.have.string(path.normalize('dist/bar/foo.js'));
      });
      it('should create links to node_modules with partial-ids (id without scope)', () => {
        const nodeModuleDir = path.join(helper.scopes.localPath, 'node_modules/@bit/bar.foo');
        expect(nodeModuleDir).to.be.a.directory();
        expect(path.join(nodeModuleDir, 'package.json')).to.be.a.file();
        expect(path.join(nodeModuleDir, 'bar/foo.js')).to.be.a.file();
      });
      describe('when an exception is thrown during the build', () => {
        before(() => {
          helper.fixtures.createComponentBarFoo('non-valid-js-code!');
        });
        after(() => {
          helper.fixtures.createComponentBarFoo();
        });
        it('should catch them and throw ExternalBuildError with the stack data', () => {
          buildOutput = helper.general.runWithTryCatch('bit build');
          expect(buildOutput).to.have.string('bit failed to build');
          expect(buildOutput).to.have.string('SyntaxError'); // error from the stack
        });
      });
      describe('when there is nothing modified', () => {
        let distFolder;
        let distFolderFullPath;
        let compilerFolder;
        let compilerFolderFullPath;
        let distFileFullPath;
        before(() => {
          distFolder = path.join('dist');
          distFolderFullPath = path.join(helper.scopes.localPath, 'dist');
          compilerFolder = path.join('.bit', 'components', 'compilers');
          compilerFolderFullPath = path.join(helper.scopes.localPath, '.bit', 'components', 'compilers');
          distFileFullPath = path.join(distFolderFullPath, 'bar', 'foo.js');

          helper.command.tagAllComponents();
          const output = helper.command.status();
          // Make sure there is no modified components
          expect(output).to.not.have.string('modified');
          expect(output).to.have.string('staged');
        });
        beforeEach(() => {
          helper.fs.deletePath(distFolder);
          helper.fs.deletePath(compilerFolder);
          expect(distFolderFullPath).to.not.be.a.path();
          expect(compilerFolderFullPath).to.not.be.a.path();
        });
        describe('build specific component', () => {
          it('should take dist files from cache (models)', () => {
            helper.command.build('bar/foo');
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.not.be.a.path();
          });
          it('should not take dist files from cache with --no-cache', () => {
            helper.fs.deletePath(compilerFolder);
            const output = helper.command.buildComponentWithOptions('bar/foo', { '-no-cache': '' });
            expect(output).to.have.string(
              `successfully installed the ${helper.scopes.env}/compilers/babel@0.0.1 compiler`
            );
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.be.a.directory().and.not.empty;
          });
          it('should not take dist files from cache with -c', () => {
            helper.fs.deletePath(compilerFolder);
            const output = helper.command.buildComponentWithOptions('bar/foo', { c: '' });
            expect(output).to.have.string(
              `successfully installed the ${helper.scopes.env}/compilers/babel@0.0.1 compiler`
            );
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.be.a.directory().and.not.empty;
          });
        });
        describe('build all components', () => {
          it('should take dist files from cache (models)', () => {
            helper.command.build('');
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.not.be.a.path();
          });
          it('should not take dist files from cache with --no-cache', () => {
            const output = helper.command.buildComponentWithOptions('', { '-no-cache': '' });
            expect(output).to.have.string(
              `successfully installed the ${helper.scopes.env}/compilers/babel@0.0.1 compiler`
            );
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.be.a.directory().and.not.empty;
          });
          it('should not take dist files from cache with -c', () => {
            const output = helper.command.buildComponentWithOptions('', { c: '' });
            expect(output).to.have.string(
              `successfully installed the ${helper.scopes.env}/compilers/babel@0.0.1 compiler`
            );
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.be.a.directory().and.not.empty;
          });
        });
      });
      describe('after exporting the component', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeBeforeTagging);
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
        });
        it('should delete the generated links on node-modules', () => {
          const nodeModuleDir = path.join(helper.scopes.localPath, 'node_modules/@bit/bar.foo');
          expect(nodeModuleDir).to.not.be.a.path();
        });
        it('should generate new links on node-modules with full-id (include scope name)', () => {
          const nodeModuleDir = path.join(helper.scopes.localPath, `node_modules/@bit/${helper.scopes.remote}.bar.foo`);
          expect(nodeModuleDir).to.be.a.directory();
          expect(path.join(nodeModuleDir, 'package.json')).to.be.a.file();
          expect(path.join(nodeModuleDir, 'bar/foo.js')).to.be.a.file();
        });
      });
    });
  });
  describe('as imported', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addRemoteEnvironment();
      helper.command.importComponent('bar/foo');
      helper.fs.createFile('components/bar/foo', 'foo.js', 'console.log("got foo")');
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('build without --verbose flag', () => {
      let buildOutput;
      before(() => {
        buildOutput = helper.command.build();
      });
      it('should not show npm output', () => {
        expect(buildOutput).to.not.have.string('npm');
      });
      it('should indicate that compiler was installed', () => {
        expect(buildOutput).to.have.string('successfully installed the');
        expect(buildOutput).to.have.string('compiler');
      });
      it('should not create an index.js file because package.json file already exists', () => {
        const indexJs = path.join(helper.scopes.localPath, 'components/bar/foo/index.js');
        expect(indexJs).to.not.be.a.path();
      });
      describe('changing dist target', () => {
        let rebuildOutput;
        before(() => {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
          rebuildOutput = helper.command.build();
        });
        it('should rebuild the component and save it on the specified target', () => {
          expect(rebuildOutput).to.have.string(path.normalize('dist/components/bar/foo/foo.js'));
        });
        it('should build only src files not dist files (in other words, should always ignore dist directory, regardless the dist.target value)', () => {
          expect(rebuildOutput).to.not.have.string(path.normalize('dist/components/bar/foo/dist/foo.js'));
        });
        it('should not save the dists on the dist directory of the component', () => {
          expect(rebuildOutput).to.not.have.string(path.normalize('components/bar/foo/dist'));
        });
      });
    });
    describe('build with --verbose flag', () => {
      let buildOutput;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        buildOutput = helper.command.build('--verbose');
      });
      it('should show npm output', () => {
        expect(buildOutput).to.have.string('npm WARN');
        expect(buildOutput).to.have.string('successfully ran npm install at');
      });
      it('should indicate that compiler was installed', () => {
        expect(buildOutput).to.have.string('successfully installed the');
        expect(buildOutput).to.have.string('compiler');
      });
    });
    describe('build when the objects are missing', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.deletePath('.bit');
      });
      it('should throw ComponentsPendingImport error', () => {
        // before, it used to throw "Cannot read property 'flattenedDependencies' of null" error.
        const func = () => helper.command.build();
        const error = new ComponentsPendingImport();
        helper.general.expectToThrow(func, error);
      });
    });
  });
  /**
   * this test uses the `pkg-json` compiler, which adds `{ foo: 'bar' }` to the package.json
   */
  describe('change package.json values', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.env.importDummyCompiler('pkg-json');
    });
    describe('as author', () => {
      before(() => {
        helper.npm.initNpm();
        helper.command.build();
      });
      it('should not change the root package.json', () => {
        const packageJson = helper.packageJson.read();
        expect(packageJson).to.not.have.property('foo');
      });
      describe('tagging the component', () => {
        before(() => {
          helper.command.tagAllComponents();
        });
        it('should save the additional package.json props into the scope', () => {
          const catComponent = helper.command.catComponent('bar/foo@latest');
          expect(catComponent).to.have.property('packageJsonChangedProps');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.packageJsonChangedProps).to.have.property('foo').that.equal('bar');
        });
        describe('importing the component to a new workspace', () => {
          let packageJson;
          before(() => {
            helper.command.exportAllComponents();
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('bar/foo');
            packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/foo'));
          });
          it('should write the added props into the component package.json', () => {
            expect(packageJson).to.have.property('foo');
            expect(packageJson.foo).equal('bar');
          });
          it(`should search for ${COMPONENT_DIST_PATH_TEMPLATE} template and replace with the path to the dist`, () => {
            expect(packageJson).to.have.property('dynamicValue');
            expect(packageJson.dynamicValue).equal('dist/bar/foo.js');
          });
          describe('isolating into a capsule', () => {
            let capsuleDir;
            before(() => {
              capsuleDir = helper.general.generateRandomTmpDirName();
              helper.command.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
            });
            it('should update the package.json in the capsule', () => {
              const capsulePackageJson = helper.packageJson.read(capsuleDir);
              expect(capsulePackageJson).to.have.property('dynamicValue');
              expect(capsulePackageJson.dynamicValue).equal('dist/bar/foo.js');
            });
          });
          describe('importing when the dist is outside the components dir', () => {
            before(() => {
              // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
              helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
              helper.command.importComponent('bar/foo -O');
              packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/foo'));
            });
            it(`should search for ${COMPONENT_DIST_PATH_TEMPLATE} template and replace with the correct path of the dist`, () => {
              expect(packageJson).to.have.property('dynamicValue');
              expect(packageJson.dynamicValue).equal('../../../dist/components/bar/foo/bar/foo.js');
            });
          });
        });
      });
    });
    describe('as imported', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        helper.env.importDummyCompiler('pkg-json');
        const componentDir = path.join(helper.scopes.localPath, 'components/bar/foo');
        const packageJson = helper.packageJson.read(componentDir);
        packageJson.bit.env = {
          compiler: `${helper.scopes.env}/compilers/dummy@0.0.1`,
        };
        // an intermediate step, make sure packageJson doesn't have this "foo" property
        expect(packageJson).to.not.have.property('foo');
        helper.packageJson.write(packageJson, componentDir);
        helper.command.runCmd('bit build --no-cache');
      });
      it('should add the packageJson properties to the component package.json', () => {
        const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/foo'));
        expect(packageJson).to.have.property('foo');
        expect(packageJson.foo).equal('bar');
      });
      describe('tagging the component', () => {
        before(() => {
          helper.command.tagAllComponents();
        });
        it('should save the additional package.json props into the scope', () => {
          const catComponent = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
          expect(catComponent).to.have.property('packageJsonChangedProps');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.packageJsonChangedProps).to.have.property('foo').that.equal('bar');
        });
        describe('changing the compiler to generate a different value in the package.json file', () => {
          before(() => {
            const compilerPath = `.bit/components/compilers/dummy/${helper.scopes.env}/0.0.1/compiler.js`;
            const compiler = helper.fs.readFile(compilerPath);
            const changedCompiler = compiler.replace('bar', 'baz');
            helper.fs.outputFile(compilerPath, changedCompiler);
            helper.command.runCmd('bit build --no-cache');
          });
          it('status should not show as modified', () => {
            const status = helper.command.status();
            expect(status).to.not.have.string('modified components');
          });
          it('should add the changed packageJson properties to the component package.json', () => {
            const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/foo'));
            expect(packageJson).to.have.property('foo');
            expect(packageJson.foo).equal('baz');
          });
        });
      });
    });
  });
});
