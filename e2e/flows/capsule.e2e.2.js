import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import * as capsuleCompiler from '../fixtures/compilers/capsule/compiler';

chai.use(require('chai-fs'));

describe('capsule', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('new components with dependencies (untagged)', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFooCapsule);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    it('should not symlink the capsule root to node_modules', () => {
      const symlink = path.join(capsuleDir, 'node_modules', '@bit/bar.foo');
      expect(symlink).to.not.be.a.path();
    });
  });
  describe('tagged components with dependencies (before export)', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.tagAllComponents();
      helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFooCapsule);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('components with peer packages', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.installNpmPackage('left-pad', '1.3.0');
      helper.createPackageJson({ peerDependencies: { 'left-pad': '1.3.0' } });
      helper.createFile(
        'utils',
        'is-type.js',
        "module.exports = function isType() { return require('left-pad')('got is-type', 15, 0); };"
      );
      helper.addComponentUtilsIsType();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.runCmd(`bit isolate utils/is-type --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintIsTypeCapsule);
    });
    it('should have the component installed correctly with the peer dependencies', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('0000got is-type');
    });
  });
  describe('components with peer packages of the dependencies', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.installNpmPackage('left-pad', '1.3.0');
      helper.createPackageJson({ peerDependencies: { 'left-pad': '1.3.0' } });
      helper.createFile(
        'utils',
        'is-type.js',
        "module.exports = function isType() { return require('left-pad')('got is-type', 15, 0); };"
      );
      helper.addComponentUtilsIsType();
      helper.createComponentUtilsIsString();
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.runCmd(`bit isolate utils/is-string --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintIsStringCapsule);
    });
    it('should have the component installed correctly with the peer packages of the dependency', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('0000got is-type and got is-string');
    });
  });
  describe('exported components with dependencies', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFooCapsule);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('imported components with dependencies', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFooCapsule);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('build into capsule', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const strToAdd = capsuleCompiler.stringToRemovedByCompiler;
      helper.createFile('utils', 'is-type.js', strToAdd + fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', strToAdd + fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(strToAdd + fixtures.barFooFixture);
      helper.addComponentBarFoo();
      helper.importDummyCompiler('capsule');

      helper.build();
    });
    it('should be able to require the component and its dependencies from the dist directory', () => {
      const appJsFixture = "const barFoo = require('./dist/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('building with shouldBuildDependencies option enabled', () => {
      let capsuleDir;
      before(() => {
        helper.deleteFile('dist');
        const compilerPath = path.join('.bit/components/compilers/dummy', helper.envScope, '0.0.1/compiler.js');
        const compilerContent = helper.readFile(compilerPath);
        capsuleDir = helper.generateRandomTmpDirName();
        const compilerWithBuildDependenciesEnabled = compilerContent
          .replace('shouldBuildDependencies: false', 'shouldBuildDependencies: true')
          .replace('targetDir,', `targetDir: '${capsuleDir}',`);
        helper.outputFile(compilerPath, compilerWithBuildDependenciesEnabled);
        helper.build('bar/foo --no-cache');
      });
      it('should write all dependencies dists into the capsule', () => {
        const isStringDist = path.join(capsuleDir, '.dependencies/utils/is-string/dist/utils/is-string.js');
        const isTypeDist = path.join(capsuleDir, '.dependencies/utils/is-type/dist/utils/is-type.js');
        expect(isStringDist).to.be.a.file();
        expect(isTypeDist).to.be.a.file();
      });
      it('should not write the same paths written to the capsule into the author workspace', () => {
        expect(path.join(helper.localScopePath, '.dependencies')).to.not.be.a.path();
      });
      it('should be able to require the component and its dependencies from the dist directory', () => {
        helper.build();
        const appJsFixture = "const barFoo = require('./dist/bar/foo'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });
  describe('test in capsule', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.importDummyTester('capsule');

      helper.installNpmPackage('chai', '4.1.2');
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.addComponent('utils/is-type.js -t utils/is-type.spec.js', { i: 'utils/is-type' });
    });
    it('should be able to require the component and its dependencies from the dist directory', () => {
      const output = helper.testComponent();
      expect(output).to.have.string('tests passed');
    });
  });
});
