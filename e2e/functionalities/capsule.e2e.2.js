import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import * as capsuleCompiler from '../fixtures/compilers/capsule/compiler';
import { AUTO_GENERATED_STAMP } from '../../src/constants';

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
  describe('new components with package dependencies (untagged)', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponentsAndPackages();
      helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFooCapsule);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('0000got is-type and got is-string and got foo');
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
    describe('running "npm install" inside the capsule', () => {
      before(() => {
        helper.runCmd('npm install', capsuleDir);
      });
      it('should not remove the peerDependencies from node_modules', () => {
        expect(path.join(capsuleDir, 'node_modules/left-pad')).to.be.a.path();
        const result = helper.runCmd('node app.js', capsuleDir);
        expect(result.trim()).to.equal('0000got is-type and got is-string');
      });
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
      let afterChangingCompiler;
      before(() => {
        helper.deletePath('dist');
        const compilerPath = path.join('.bit/components/compilers/dummy', helper.envScope, '0.0.1/compiler.js');
        const compilerContent = helper.readFile(compilerPath);
        const compilerWithBuildDependenciesEnabled = compilerContent.replace(
          'shouldBuildDependencies: false',
          'shouldBuildDependencies: true'
        );
        helper.outputFile(compilerPath, compilerWithBuildDependenciesEnabled);
        afterChangingCompiler = helper.cloneLocalScope();
        const buildOutput = helper.build('bar/foo --no-cache');
        capsuleDir = capsuleCompiler.getCapsuleDirByComponentName(buildOutput, 'bar/foo');
      });
      it('should write all dependencies dists into the capsule', () => {
        const isStringDist = path.join(capsuleDir, '.dependencies/utils/is-string/dist/is-string.js');
        const isTypeDist = path.join(capsuleDir, '.dependencies/utils/is-type/dist/is-type.js');
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
      it('should not build the same component twice', () => {
        const result = helper.build('bar/foo');
        // this compiler console.log a message for every component it builds. this makes sure that
        // for utils/is-type there is only one message.
        const regex = new RegExp('generated a capsule for utils/is-type', 'g');
        const count = result.match(regex);
        expect(count).to.have.lengthOf(1);
      });
      describe('tag, export, tag, untag then tag', () => {
        before(() => {
          helper.tagAllComponents();
          helper.exportAllComponents();
          helper.tagScope('2.0.0');
          helper.tagScope('2.0.1');
          helper.untag('-a 2.0.1');
        });
        // @see https://github.com/teambit/bit/issues/1817
        it('should not throw an error componentNotFound', () => {
          const tagFunc = () => helper.tagComponent('utils/is-string -f');
          expect(tagFunc).to.not.throw();
        });
      });
      describe('when there is a circle dependencies', () => {
        let buildOutput;
        before(() => {
          helper.getClonedLocalScope(afterChangingCompiler);
          helper.createFile('circle', 'comp-a.js', "require('./comp-b');");
          helper.createFile('circle', 'comp-b.js', "require('./comp-c');");
          helper.createFile('circle', 'comp-c.js', "require('./comp-a');");
          helper.createFile('circle', 'comp-d.js', '');
          helper.addComponent('circle/comp-a.js');
          helper.addComponent('circle/comp-b.js');
          helper.addComponent('circle/comp-c.js');
          helper.addComponent('circle/comp-d.js'); // comp-d has no deps, so is not part of the circle
          buildOutput = helper.runWithTryCatch('bit build comp-a');
        });
        it('should throw an error saying there is cyclic dependencies', () => {
          expect(buildOutput).to.have.string('cyclic dependencies');
        });
        it('should print the components participate in the cyclic dependencies', () => {
          expect(buildOutput).to.have.string('comp-a');
          expect(buildOutput).to.have.string('comp-b');
          expect(buildOutput).to.have.string('comp-c');
        });
        it('should not print the components that are not participate in the cyclic dependencies', () => {
          expect(buildOutput).to.not.have.string('comp-d');
        });
      });
    });
  });
  describe('tag with capsule compiler that saves link files into the dists', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const strToAdd = capsuleCompiler.stringToRemovedByCompiler;
      helper.createFile('utils', 'is-type.js', strToAdd + fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', strToAdd + fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(strToAdd + fixtures.barFooFixture);
      helper.addComponentBarFoo();
      helper.importDummyCompiler('capsule-save-links');
      helper.tagAllComponents();
    });
    it('should save the link into the dists', () => {
      const barFoo = helper.catComponent('bar/foo@latest');
      const distLink = barFoo.dists.find(d => d.relativePath === 'utils/is-string.js');
      expect(distLink).to.not.be.undefined;
      const fileHash = distLink.file;
      const content = helper.catObject(fileHash);
      // expect the link file to include only the name, without the scope name.
      // this will be changed once exported
      expect(content).to.have.string('@bit/utils.is-string');
    });
    describe('exporting the component', () => {
      before(() => {
        helper.exportAllComponents();
      });
      it('should change the dists', () => {
        const barFoo = helper.catComponent('bar/foo@latest');
        const distLink = barFoo.dists.find(d => d.relativePath === 'utils/is-string.js');
        expect(distLink).to.not.be.undefined;
        const fileHash = distLink.file;
        const content = helper.catObject(fileHash);
        // expect the link file to include the full name including the scope name
        expect(content).to.have.string(`@bit/${helper.remoteScope}.utils.is-string`);
        expect(content).to.not.have.string('@bit/utils.is-string');
      });
      describe('importing the component to another workspace', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('should write the dist link file from the scope and not the generated one', () => {
          const fileContent = helper.readFile('components/bar/foo/dist/utils/is-string.js');
          expect(fileContent).to.not.have.string(AUTO_GENERATED_STAMP);
          expect(fileContent).to.have.string(`@bit/${helper.remoteScope}.utils.is-string`);
        });
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
