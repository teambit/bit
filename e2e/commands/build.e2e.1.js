import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

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
          helper.deleteFile(distFolder);
          helper.deleteFile(compilerFolder);
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
            helper.deleteFile(compilerFolder);
            const output = helper.buildComponentWithOptions('bar/foo', { '-no-cache': '' });
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
});
