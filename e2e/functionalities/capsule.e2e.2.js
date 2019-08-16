import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import * as capsuleCompiler from '../fixtures/compilers/capsule/compiler';
import { AUTO_GENERATED_STAMP } from '../../src/constants';

chai.use(require('chai-fs'));

describe('capsule', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('new components with dependencies (untagged)', () => {
    const capsuleDir = helper.general.generateRandomTmpDirName();
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFooCapsule);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.command.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    it('should not symlink the capsule root to node_modules', () => {
      const symlink = path.join(capsuleDir, 'node_modules', '@bit/bar.foo');
      expect(symlink).to.not.be.a.path();
    });
  });
  describe('new components with package dependencies (untagged)', () => {
    const capsuleDir = helper.general.generateRandomTmpDirName();
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponentsAndPackages();
      helper.command.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFooCapsule);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.command.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('0000got is-type and got is-string and got foo');
    });
  });
  describe('tagged components with dependencies (before export)', () => {
    const capsuleDir = helper.general.generateRandomTmpDirName();
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.tagAllComponents();
      helper.command.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFooCapsule);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.command.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('components with peer packages', () => {
    const capsuleDir = helper.general.generateRandomTmpDirName();
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.npm.installNpmPackage('left-pad', '1.3.0');
      helper.packageJson.create({ peerDependencies: { 'left-pad': '1.3.0' } });
      helper.fs.createFile(
        'utils',
        'is-type.js',
        "module.exports = function isType() { return require('left-pad')('got is-type', 15, 0); };"
      );
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.command.runCmd(`bit isolate utils/is-type --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintIsTypeCapsule);
    });
    it('should have the component installed correctly with the peer dependencies', () => {
      const result = helper.command.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('0000got is-type');
    });
  });
  describe('components with peer packages of the dependencies', () => {
    const capsuleDir = helper.general.generateRandomTmpDirName();
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.npm.installNpmPackage('left-pad', '1.3.0');
      helper.packageJson.create({ peerDependencies: { 'left-pad': '1.3.0' } });
      helper.fs.createFile(
        'utils',
        'is-type.js',
        "module.exports = function isType() { return require('left-pad')('got is-type', 15, 0); };"
      );
      helper.fixtures.addComponentUtilsIsType();
      helper.fixtures.createComponentUtilsIsString();
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.command.runCmd(`bit isolate utils/is-string --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintIsStringCapsule);
    });
    it('should have the component installed correctly with the peer packages of the dependency', () => {
      const result = helper.command.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('0000got is-type and got is-string');
    });
    describe('running "npm install" inside the capsule', () => {
      before(() => {
        helper.command.runCmd('npm install', capsuleDir);
      });
      it('should not remove the peerDependencies from node_modules', () => {
        expect(path.join(capsuleDir, 'node_modules/left-pad')).to.be.a.path();
        const result = helper.command.runCmd('node app.js', capsuleDir);
        expect(result.trim()).to.equal('0000got is-type and got is-string');
      });
    });
  });
  describe('exported components with dependencies', () => {
    const capsuleDir = helper.general.generateRandomTmpDirName();
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.command.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFooCapsule);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.command.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('imported components with dependencies', () => {
    const capsuleDir = helper.general.generateRandomTmpDirName();
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      helper.command.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFooCapsule);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.command.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('build into capsule', () => {
    let afterImportingCompiler;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const strToAdd = capsuleCompiler.stringToRemovedByCompiler;
      helper.fs.createFile('utils', 'is-type.js', strToAdd + fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', strToAdd + fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(strToAdd + fixtures.barFooFixture);
      helper.fixtures.addComponentBarFoo();
      helper.env.importDummyCompiler('capsule');
      afterImportingCompiler = helper.scopeHelper.cloneLocalScope();
      helper.command.build();
    });
    it('should be able to require the component and its dependencies from the dist directory', () => {
      const appJsFixture = "const barFoo = require('./dist/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.scopes.localScopePath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('using the new compiler API', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterImportingCompiler);
        helper.env.changeDummyCompilerCode('isNewAPI = false', 'isNewAPI = true');
        const output = helper.command.build();
        expect(output).to.have.string('using the new compiler API');
      });
      it('should be able to require the component and its dependencies from the dist directory', () => {
        const appJsFixture = "const barFoo = require('./dist/bar/foo'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.scopes.localScopePath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('building with shouldBuildDependencies option enabled', () => {
      let capsuleDir;
      let afterChangingCompiler;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterImportingCompiler);
        helper.env.changeDummyCompilerCode('shouldBuildDependencies: false', 'shouldBuildDependencies: true');
        afterChangingCompiler = helper.scopeHelper.cloneLocalScope();
        const buildOutput = helper.command.build('bar/foo --no-cache');
        capsuleDir = capsuleCompiler.getCapsuleDirByComponentName(buildOutput, 'bar/foo');
      });
      it('should write all dependencies dists into the capsule', () => {
        const isStringDist = path.join(capsuleDir, '.dependencies/utils/is-string/dist/is-string.js');
        const isTypeDist = path.join(capsuleDir, '.dependencies/utils/is-type/dist/is-type.js');
        expect(isStringDist).to.be.a.file();
        expect(isTypeDist).to.be.a.file();
      });
      it('should not write the same paths written to the capsule into the author workspace', () => {
        expect(path.join(helper.scopes.localScopePath, '.dependencies')).to.not.be.a.path();
      });
      it('should be able to require the component and its dependencies from the dist directory', () => {
        helper.command.build();
        const appJsFixture = "const barFoo = require('./dist/bar/foo'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.scopes.localScopePath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('should not build the same component twice', () => {
        const result = helper.command.build('bar/foo');
        // this compiler console.log a message for every component it builds. this makes sure that
        // for utils/is-type there is only one message.
        const regex = new RegExp('generated a capsule for utils/is-type', 'g');
        const count = result.match(regex);
        expect(count).to.have.lengthOf(1);
      });
      describe('tag, export, tag, untag then tag', () => {
        before(() => {
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          helper.command.tagScope('2.0.0');
          helper.command.tagScope('2.0.1');
          helper.command.untag('-a 2.0.1');
        });
        // @see https://github.com/teambit/bit/issues/1817
        it('should not throw an error componentNotFound', () => {
          const tagFunc = () => helper.command.tagComponent('utils/is-string -f');
          expect(tagFunc).to.not.throw();
        });
      });
      describe('when there is a circle dependencies', () => {
        let buildOutput;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(afterChangingCompiler);
          helper.fs.createFile('circle', 'comp-a.js', "require('./comp-b');");
          helper.fs.createFile('circle', 'comp-b.js', "require('./comp-c');");
          helper.fs.createFile('circle', 'comp-c.js', "require('./comp-a');");
          helper.fs.createFile('circle', 'comp-d.js', '');
          helper.command.addComponent('circle/comp-a.js');
          helper.command.addComponent('circle/comp-b.js');
          helper.command.addComponent('circle/comp-c.js');
          helper.command.addComponent('circle/comp-d.js'); // comp-d has no deps, so is not part of the circle
          buildOutput = helper.general.runWithTryCatch('bit build comp-a');
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const strToAdd = capsuleCompiler.stringToRemovedByCompiler;
      helper.fs.createFile('utils', 'is-type.js', strToAdd + fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', strToAdd + fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(strToAdd + fixtures.barFooFixture);
      helper.fixtures.addComponentBarFoo();
      helper.env.importDummyCompiler('capsule-save-links');
      helper.command.tagAllComponents();
    });
    it('should save the link into the dists', () => {
      const barFoo = helper.command.catComponent('bar/foo@latest');
      const distLink = barFoo.dists.find(d => d.relativePath === 'utils/is-string.js');
      expect(distLink).to.not.be.undefined;
      const fileHash = distLink.file;
      const content = helper.command.catObject(fileHash);
      // expect the link file to include only the name, without the scope name.
      // this will be changed once exported
      expect(content).to.have.string('@bit/utils.is-string');
    });
    describe('exporting the component', () => {
      before(() => {
        helper.command.exportAllComponents();
      });
      it('should change the dists', () => {
        const barFoo = helper.command.catComponent('bar/foo@latest');
        const distLink = barFoo.dists.find(d => d.relativePath === 'utils/is-string.js');
        expect(distLink).to.not.be.undefined;
        const fileHash = distLink.file;
        const content = helper.command.catObject(fileHash);
        // expect the link file to include the full name including the scope name
        expect(content).to.have.string(`@bit/${helper.scopes.remoteScope}.utils.is-string`);
        expect(content).to.not.have.string('@bit/utils.is-string');
      });
      describe('importing the component to another workspace', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
        });
        it('should write the dist link file from the scope and not the generated one', () => {
          const fileContent = helper.fs.readFile('components/bar/foo/dist/utils/is-string.js');
          expect(fileContent).to.not.have.string(AUTO_GENERATED_STAMP);
          expect(fileContent).to.have.string(`@bit/${helper.scopes.remoteScope}.utils.is-string`);
        });
      });
    });
  });
  describe('test in capsule', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.env.importDummyTester('capsule');

      helper.npm.installNpmPackage('chai', '4.1.2');
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.command.addComponent('utils/is-type.js -t utils/is-type.spec.js', { i: 'utils/is-type' });
    });
    it('should be able to require the component and its dependencies from the dist directory', () => {
      const output = helper.command.testComponent();
      expect(output).to.have.string('tests passed');
    });
  });
});
