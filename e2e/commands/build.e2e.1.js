import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import { COMPONENT_DIST_PATH_TEMPLATE } from '../../src/constants';

const assertArrays = require('chai-arrays');
chai.use(require('chai-fs'));

chai.use(assertArrays);

describe('bit build', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('as author', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
    });
    it('should not be able to build without importing a build env', () => {
      const output = helper.build();
      expect(output).to.have.string('nothing to build');
    });
    describe('after importing a compiler', () => {
      before(() => {
        const output = helper.importCompiler();
        expect(output).to.have.string(
          `the following component environments were installed\n- ${helper.envScope}/compilers/babel@`
        );
      });
      it('should successfully import and build using the babel compiler', () => {
        const buildOutput = helper.build();
        expect(buildOutput).to.have.string(path.normalize('dist/bar/foo.js.map'));
        expect(buildOutput).to.have.string(path.normalize('dist/bar/foo.js'));
      });
      describe('when an exception is thrown during the build', () => {
        before(() => {
          helper.createComponentBarFoo('non-valid-js-code!');
        });
        after(() => {
          helper.createComponentBarFoo();
        });
        it('should catch them and throw ExternalBuildError with the stack data', () => {
          const buildOutput = helper.runWithTryCatch('bit build');
          expect(buildOutput).to.have.string('bit failed to build');
          expect(buildOutput).to.have.string('SyntaxError'); // error from the stack
        });
      });
      describe('when there is nothing modified', () => {
        const distFolder = path.join('dist');
        const distFolderFullPath = path.join(helper.localScopePath, 'dist');
        const compilerFolder = path.join('.bit', 'components', 'compilers');
        const compilerFolderFullPath = path.join(helper.localScopePath, '.bit', 'components', 'compilers');
        const distFileFullPath = path.join(distFolderFullPath, 'bar', 'foo.js');
        before(() => {
          helper.tagAllComponents();
          const output = helper.status();
          // Make sure there is no modified components
          expect(output).to.not.contain.string('modified');
          expect(output).to.contain.string('staged');
        });
        beforeEach(() => {
          helper.deletePath(distFolder);
          helper.deletePath(compilerFolder);
          expect(distFolderFullPath).to.not.be.a.path();
          expect(compilerFolderFullPath).to.not.be.a.path();
        });
        describe('build specific component', () => {
          it('should take dist files from cache (models)', () => {
            helper.build('bar/foo');
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.not.be.a.path();
          });
          it('should not take dist files from cache with --no-cache', () => {
            helper.deletePath(compilerFolder);
            const output = helper.buildComponentWithOptions('bar/foo', { '-no-cache': '' });
            expect(output).to.have.string(
              `successfully installed the ${helper.envScope}/compilers/babel@0.0.1 compiler`
            );
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.be.a.directory().and.not.empty;
          });
          it('should not take dist files from cache with -c', () => {
            helper.deletePath(compilerFolder);
            const output = helper.buildComponentWithOptions('bar/foo', { c: '' });
            expect(output).to.have.string(
              `successfully installed the ${helper.envScope}/compilers/babel@0.0.1 compiler`
            );
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.be.a.directory().and.not.empty;
          });
        });
        describe('build all components', () => {
          it('should take dist files from cache (models)', () => {
            helper.build('');
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.not.be.a.path();
          });
          it('should not take dist files from cache with --no-cache', () => {
            const output = helper.buildComponentWithOptions('', { '-no-cache': '' });
            expect(output).to.have.string(
              `successfully installed the ${helper.envScope}/compilers/babel@0.0.1 compiler`
            );
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.be.a.directory().and.not.empty;
          });
          it('should not take dist files from cache with -c', () => {
            const output = helper.buildComponentWithOptions('', { c: '' });
            expect(output).to.have.string(
              `successfully installed the ${helper.envScope}/compilers/babel@0.0.1 compiler`
            );
            expect(distFileFullPath).to.be.a.file();
            expect(compilerFolderFullPath).to.be.a.directory().and.not.empty;
          });
        });
      });
    });
  });
  describe('as imported', () => {
    let localScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.addRemoteEnvironment();
      helper.importComponent('bar/foo');
      helper.createFile('components/bar/foo', 'foo.js', 'console.log("got foo")');
      localScope = helper.cloneLocalScope();
    });
    describe('build without --verbose flag', () => {
      let buildOutput;
      before(() => {
        buildOutput = helper.build();
      });
      it('should not show npm output', () => {
        expect(buildOutput).to.not.have.string('npm');
      });
      it('should indicate that compiler was installed', () => {
        expect(buildOutput).to.have.string('successfully installed the');
        expect(buildOutput).to.have.string('compiler');
      });
      it('should not create an index.js file because package.json file already exists', () => {
        const indexJs = path.join(helper.localScopePath, 'components/bar/foo/index.js');
        expect(indexJs).to.not.be.a.path();
      });
      describe('changing dist target', () => {
        let rebuildOutput;
        before(() => {
          helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
          rebuildOutput = helper.build();
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
        helper.getClonedLocalScope(localScope);
        buildOutput = helper.build('--verbose');
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
  });
  /**
   * this test uses the `pkg-json` compiler, which adds `{ foo: 'bar' }` to the package.json
   */
  describe('change package.json values', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.importDummyCompiler('pkg-json');
    });
    describe('as author', () => {
      before(() => {
        helper.initNpm();
        helper.build();
      });
      it('should not change the root package.json', () => {
        const packageJson = helper.readPackageJson();
        expect(packageJson).to.not.have.property('foo');
      });
      describe('tagging the component', () => {
        before(() => {
          helper.tagAllComponents();
        });
        it('should save the additional package.json props into the scope', () => {
          const catComponent = helper.catComponent('bar/foo@latest');
          expect(catComponent).to.have.property('packageJsonChangedProps');
          expect(catComponent.packageJsonChangedProps)
            .to.have.property('foo')
            .that.equal('bar');
        });
        describe('importing the component to a new workspace', () => {
          let packageJson;
          before(() => {
            helper.exportAllComponents();
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.importComponent('bar/foo');
            packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/foo'));
          });
          it('should write the added props into the component package.json', () => {
            expect(packageJson).to.have.property('foo');
            expect(packageJson.foo).equal('bar');
          });
          it(`should search for ${COMPONENT_DIST_PATH_TEMPLATE} template and replace with the path to the dist`, () => {
            expect(packageJson).to.have.property('dynamicValue');
            expect(packageJson.dynamicValue).equal('dist/bar/foo.js');
          });
          describe('importing when the dist is outside the components dir', () => {
            before(() => {
              helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
              helper.importComponent('bar/foo -O');
              packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/foo'));
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
        helper.setNewLocalAndRemoteScopes();
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.tagAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        helper.importDummyCompiler('pkg-json');
        const componentDir = path.join(helper.localScopePath, 'components/bar/foo');
        const packageJson = helper.readPackageJson(componentDir);
        packageJson.bit.env = {
          compiler: `${helper.envScope}/compilers/dummy@0.0.1`
        };
        // an intermediate step, make sure packageJson doesn't have this "foo" property
        expect(packageJson).to.not.have.property('foo');
        helper.writePackageJson(packageJson, componentDir);
        helper.runCmd('bit build --no-cache');
      });
      it('should add the packageJson properties to the component package.json', () => {
        const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/foo'));
        expect(packageJson).to.have.property('foo');
        expect(packageJson.foo).equal('bar');
      });
      describe('tagging the component', () => {
        before(() => {
          helper.tagAllComponents();
        });
        it('should save the additional package.json props into the scope', () => {
          const catComponent = helper.catComponent(`${helper.remoteScope}/bar/foo@latest`);
          expect(catComponent).to.have.property('packageJsonChangedProps');
          expect(catComponent.packageJsonChangedProps)
            .to.have.property('foo')
            .that.equal('bar');
        });
        describe('changing the compiler to generate a different value in the package.json file', () => {
          before(() => {
            const compilerPath = `.bit/components/compilers/dummy/${helper.envScope}/0.0.1/compiler.js`;
            const compiler = helper.readFile(compilerPath);
            const changedCompiler = compiler.replace('bar', 'baz');
            helper.outputFile(compilerPath, changedCompiler);
            helper.runCmd('bit build --no-cache');
          });
          it('status should not show as modified', () => {
            const status = helper.status();
            expect(status).to.not.have.string('modified components');
          });
          it('should add the changed packageJson properties to the component package.json', () => {
            const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/foo'));
            expect(packageJson).to.have.property('foo');
            expect(packageJson.foo).equal('baz');
          });
        });
      });
    });
  });
});
