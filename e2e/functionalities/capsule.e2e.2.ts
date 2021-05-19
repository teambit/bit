import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { LEGACY_SHARED_DIR_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { AUTO_GENERATED_STAMP } from '../../src/constants';
import { SCHEMA_FIELD } from '../../src/consumer/bit-map/bit-map';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import * as capsuleCompiler from '../fixtures/compilers/capsule/compiler';

chai.use(require('chai-fs'));

describe('capsule', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('new components with dependencies (untagged)', () => {
    let capsuleDir;
    before(() => {
      capsuleDir = helper.general.generateRandomTmpDirName();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
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
    let capsuleDir;
    before(() => {
      capsuleDir = helper.general.generateRandomTmpDirName();
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
    let capsuleDir;
    before(() => {
      capsuleDir = helper.general.generateRandomTmpDirName();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
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
    let capsuleDir;
    before(() => {
      capsuleDir = helper.general.generateRandomTmpDirName();
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
    let capsuleDir;
    before(() => {
      capsuleDir = helper.general.generateRandomTmpDirName();
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
    let capsuleDir;
    before(() => {
      capsuleDir = helper.general.generateRandomTmpDirName();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
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
    let capsuleDir;
    before(() => {
      capsuleDir = helper.general.generateRandomTmpDirName();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
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
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    // Skip for now, until talking with @david about it, the add files to envs are deleted so this test
    // need to be changed or deleted.
    describe.skip('using the new compiler API', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterImportingCompiler);
        const babelrcFixture = path.join('compilers', 'new-babel', '.babelrc');
        helper.fixtures.copyFixtureFile(babelrcFixture);
        // helper.bitJson.addFileToEnv(undefined, '.babelrc', './.babelrc', COMPILER_ENV_TYPE);
        helper.env.changeDummyCompilerCode('isNewAPI = false', 'isNewAPI = true');
        const output = helper.command.build();
        expect(output).to.have.string('using the new compiler API');
      });
      it('should be able to require the component and its dependencies from the dist directory', () => {
        const appJsFixture = "const barFoo = require('./dist/bar/foo'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
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
        expect(path.join(helper.scopes.localPath, '.dependencies')).to.not.be.a.path();
      });
      it('should be able to require the component and its dependencies from the dist directory', () => {
        helper.command.build();
        const appJsFixture = "const barFoo = require('./dist/bar/foo'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
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
      /**
       * the idea here is that is-type is first built as a dependency of is-string, so its dists are set.
       * then, it is written as an individual, so then "writeDistsFile" prop is set to true.
       * then, it is written as a dependency as a result of bar/foo, where we do need its dists to be written
       */
      describe('changing the order of the components in .bitmap so then is-type is built after is-string and before bar-foo', () => {
        let newCapsuleDir;
        before(() => {
          const bitMap = helper.bitMap.read();
          const newBitMap = {
            'utils/is-string': bitMap['utils/is-string'],
            'utils/is-type': bitMap['utils/is-type'],
            'bar/foo': bitMap['bar/foo'],
            [SCHEMA_FIELD]: bitMap[SCHEMA_FIELD],
          };
          helper.bitMap.write(newBitMap);
          const buildOutput = helper.command.build();
          newCapsuleDir = capsuleCompiler.getCapsuleDirByComponentName(buildOutput, 'bar/foo');
        });
        it('should write all dependencies dists into the capsule', () => {
          const isStringDist = path.join(newCapsuleDir, '.dependencies/utils/is-string/dist/is-string.js');
          const isTypeDist = path.join(newCapsuleDir, '.dependencies/utils/is-type/dist/is-type.js');
          expect(isStringDist).to.be.a.file();
          expect(isTypeDist).to.be.a.file();
        });
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
      describe('tag, change a dependency then build the dependent', () => {
        // change it-type and expect is-string to re-build although it was not modified itself
        before(() => {
          helper.scopeHelper.getClonedLocalScope(afterChangingCompiler);
          helper.command.tagAllComponents();
          const strToAdd = capsuleCompiler.stringToRemovedByCompiler;
          helper.fs.createFile('utils', 'is-type.js', strToAdd + fixtures.isTypeV2);
        });
        it('should rebuild the component and not use the dists from cache', () => {
          const buildResult = helper.command.build('utils/is-string');
          expect(buildResult).to.have.string('generated a capsule for utils/is-string');
        });
      });
      describe('tag, change a dependency then tag the dependency (test the auto-tag)', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(afterChangingCompiler);
          helper.command.tagAllComponents();
          const strToAdd = capsuleCompiler.stringToRemovedByCompiler;
          helper.fs.createFile('utils', 'is-type.js', strToAdd + fixtures.isTypeV2);
        });
        it('should rebuild the dependent that tagged as a result of auto-tag', () => {
          const buildResult = helper.command.tagComponent('utils/is-type');
          expect(buildResult).to.have.string('generated a capsule for utils/is-string');
        });
        describe('remove the compiler from the dependency', () => {
          let isStringCapsuleDir;
          before(() => {
            const overrides = {
              'utils/is-type': {
                env: {
                  compiler: '-',
                },
              },
            };
            helper.bitJson.addOverrides(overrides);
            const buildResult = helper.command.tagComponent('utils/is-type');
            expect(buildResult).to.have.string('generated a capsule for utils/is-string');
            isStringCapsuleDir = capsuleCompiler.getCapsuleDirByComponentName(buildResult, 'utils/is-string');
          });
          // tests https://github.com/teambit/bit/issues/2182
          it('should not save the dists of the dependency in the capsule of the dependent', () => {
            const distPath = path.join(isStringCapsuleDir, '.dependencies/utils/is-type/dist');
            expect(distPath).to.not.be.a.path();
            // just to make sure the original path of the component is there
            expect(path.join(isStringCapsuleDir, '.dependencies/utils/is-type')).to.be.a.path();
          });
        });
      });
      describe('tag, then build a component', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(afterChangingCompiler);
          helper.command.tagAllComponents();
        });
        it('should use the dists from cache and not rebuild the component', () => {
          const buildResult = helper.command.build('utils/is-string');
          expect(buildResult).to.not.have.string('generated a capsule');
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
          buildOutput = helper.general.runWithTryCatch('bit build comp-a', undefined, LEGACY_SHARED_DIR_FEATURE);
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
    describe('build imported component', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterImportingCompiler);
        helper.scopeHelper.reInitRemoteScope();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
      });
      it('should be able to require the component and its dependencies from the dist directory', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo/dist/bar/foo'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
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
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const distLink = barFoo.dists.find((d) => d.relativePath === 'utils/is-string.js');
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
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const distLink = barFoo.dists.find((d) => d.relativePath === 'utils/is-string.js');
        expect(distLink).to.not.be.undefined;
        const fileHash = distLink.file;
        const content = helper.command.catObject(fileHash);
        // expect the link file to include the full name including the scope name
        expect(content).to.have.string(`@bit/${helper.scopes.remote}.utils.is-string`);
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
          expect(fileContent).to.have.string(`@bit/${helper.scopes.remote}.utils.is-string`);
        });
      });
    });
  });
  describe('test in capsule', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.env.importDummyTester('capsule');

      helper.npm.installNpmPackage('chai', '4.1.2');
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.command.addComponent('utils/is-type.js', { i: 'utils/is-type', t: 'utils/is-type.spec.js' });
    });
    it('should be able to require the component and its dependencies from the dist directory', () => {
      const output = helper.command.testComponent();
      expect(output).to.have.string('tests passed');
    });
  });
  // validates https://github.com/teambit/bit/issues/2264
  describe('component with a dependency that has the same file name', () => {
    let capsuleDir;
    before(() => {
      capsuleDir = helper.general.generateRandomTmpDirName();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.outputFile('foo.js', 'require("./utils/foo");');
      helper.fs.outputFile('utils/foo.js', '');
      helper.command.addComponent('foo.js');
      helper.command.addComponent('utils/foo.js');
      // notice how both components have the same filename: "foo.js".
      helper.command.runCmd(`bit isolate foo --use-capsule --directory ${capsuleDir}`);
    });
    it('should generate the link file to the dependency', () => {
      const link = path.join(capsuleDir, 'utils/foo.js');
      expect(link).to.be.a.file();
    });
  });
});
