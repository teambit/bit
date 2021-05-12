/* eslint-disable max-lines */

import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import { IssuesClasses } from '@teambit/component-issues';

import { statusFailureMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import Helper, { VERSION_DELIMITER } from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);
chai.use(require('chai-string'));

describe('bit import', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('stand alone component (without dependencies)', () => {
    let importOutput;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      // export a new simple component
      helper.fs.createFile('global', 'simple.js');
      helper.command.addComponent('global/simple.js', { i: 'global/simple' });
      helper.command.tagComponent('global/simple');
      helper.command.exportComponent('global/simple');

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      importOutput = helper.command.importComponent('global/simple');
    });
    it('should display a successful message', () => {
      expect(importOutput).to.have.string('successfully imported one component');
      expect(importOutput).to.have.string('global/simple');
      expect(importOutput).to.have.string('0.0.1');
    });
    it('should indicate that the imported component is new', () => {
      expect(importOutput).to.have.string('added');
      expect(importOutput).to.not.have.string('updated');
    });
    it('should add the component into bit.map file with the full id', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${helper.scopes.remote}/global/simple${VERSION_DELIMITER}0.0.1`);
    });
    // TODO: Validate all files exists in a folder with the component name
    it('should write the component to default path from bit.json', () => {
      // TODO: check few cases with different structure props - namespace, name, version, scope
      const expectedLocation = path.join(helper.scopes.localPath, 'components', 'global', 'simple', 'simple.js');
      expect(fs.existsSync(expectedLocation)).to.be.true;
    });
    it('should not write the component bit.json file (only when --conf flag is set)', () => {
      const bitJsonLocation = path.join(helper.scopes.localPath, 'components', 'global', 'simple', 'bit.json');
      expect(fs.existsSync(bitJsonLocation)).to.be.false;
    });

    describe('with multiple files located in different directories', () => {
      before(() => {
        helper.fs.createFile('src', 'imprel.js');
        helper.fs.createFile('src', 'imprel.spec.js');
        helper.fs.createFile('src/utils', 'myUtil.js');
        helper.command.addComponent('src/imprel.js src/utils/myUtil.js', {
          t: 'src/imprel.spec.js',
          m: 'src/imprel.js',
          i: 'imprel/imprel',
        });
        helper.command.tagComponent('imprel/imprel');
        helper.command.exportComponent('imprel/imprel');
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        const output = helper.command.importComponent('imprel/imprel');
        expect(output.includes('successfully imported one component')).to.be.true;
        expect(output.includes('imprel/imprel')).to.be.true;
      });
      it('should write the internal files according to their relative paths', () => {
        const imprelRoot = path.join(helper.scopes.localPath, 'components', 'imprel', 'imprel');
        const expectedLocationImprel = path.join(imprelRoot, 'imprel.js');
        const expectedLocationImprelSpec = path.join(imprelRoot, 'imprel.spec.js');
        const expectedLocationMyUtil = path.join(imprelRoot, 'utils', 'myUtil.js');
        expect(fs.existsSync(expectedLocationImprel)).to.be.true;
        expect(fs.existsSync(expectedLocationImprelSpec)).to.be.true;
        expect(fs.existsSync(expectedLocationMyUtil)).to.be.true;
      });
    });

    describe('when the default component directory already exist', () => {
      let componentFileLocation;
      let componentDir;
      describe('when the destination is an existing empty directory', () => {
        before(() => {
          componentFileLocation = path.join(helper.scopes.localPath, 'components/global/simple/simple.js');
          componentDir = path.join(helper.scopes.localPath, 'components/global/simple');

          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          fs.ensureDirSync(componentDir);
          helper.command.runCmd(`bit import ${helper.scopes.remote}/global/simple`);
        });
        it('should write the component to the specified path', () => {
          expect(componentFileLocation).to.be.a.file();
        });
      });
      describe('when the destination directory is not empty', () => {
        let output;
        let existingFile;
        before(() => {
          existingFile = path.join(componentDir, 'my-file.js');
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          fs.outputFileSync(existingFile, 'console.log()');
          output = helper.general.runWithTryCatch(`bit import ${helper.scopes.remote}/global/simple`);
        });
        it('should not import the component', () => {
          expect(componentFileLocation).to.not.be.a.path();
        });
        it('should not delete the existing file', () => {
          expect(existingFile).to.be.a.file();
        });
        it('should throw an error', () => {
          expect(output).to.have.string('unable to import');
        });
        it('should import successfully if the --override flag is used', () => {
          output = helper.command.importComponent('global/simple --override');
          expect(componentFileLocation).to.be.a.file();
        });
      });
      describe('when the destination is a file', () => {
        let output;
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          fs.outputFileSync(componentDir, 'console.log()');
          output = helper.general.runWithTryCatch(`bit import ${helper.scopes.remote}/global/simple`);
        });
        it('should not import the component', () => {
          expect(componentFileLocation).to.not.be.a.path();
        });
        it('should not delete the existing file', () => {
          expect(componentDir).to.be.a.file();
        });
        it('should throw an error', () => {
          expect(output).to.have.string('unable to import');
        });
        it('should throw an error also when the --override flag is used', () => {
          output = helper.general.runWithTryCatch(`bit import ${helper.scopes.remote}/global/simple --override`);
          expect(output).to.have.string('unable to import');
        });
      });
    });

    describe('with a specific path, using -p flag', () => {
      describe('as author', () => {
        describe('when there is a track dir', () => {
          before(() => {
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.fs.createFile('bar-author-track', 'foo1.js');
            helper.fs.createFile('bar-author-track', 'foo2.js');
            helper.fs.outputFile('should-not-be-deleted.js');
            helper.command.addComponent('bar-author-track', { m: 'foo1.js' });
            helper.command.tagAllComponents();
            helper.command.exportAllComponents();
            helper.command.importComponentWithOptions('bar-author-track', { p: 'my-new-dir' });
          });
          it('should not delete other files on the workspace', () => {
            expect(path.join(helper.scopes.localPath, 'should-not-be-deleted.js')).to.be.a.file();
          });
          it('should throw an error saying it is not possible to move the component', () => {
            expect(path.join(helper.scopes.localPath, 'my-new-dir')).to.be.a.directory();
          });
        });
        describe('when there is no track dir', () => {
          before(() => {
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.fs.createFile('bar-author', 'foo.js');
            helper.fs.outputFile('should-not-be-deleted.js');
            helper.command.addComponent('bar-author/foo.js');
            helper.command.tagAllComponents();
            helper.command.exportAllComponents();
            const func = () => helper.command.importComponentWithOptions('foo', { p: 'my-new-dir' });
            expect(func).to.throw();
          });
          it('should not delete other files on the workspace', () => {
            expect(path.join(helper.scopes.localPath, 'should-not-be-deleted.js')).to.be.a.file();
          });
          it('should not move the component', () => {
            expect(path.join(helper.scopes.localPath, 'bar-author')).to.be.a.directory();
          });
        });
      });
      describe('as imported', () => {
        let componentFileLocation;
        before(() => {
          componentFileLocation = path.join(helper.scopes.localPath, 'my-custom-location/simple.js');
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
        });
        describe('when the destination is a non-exist directory', () => {
          before(() => {
            helper.command.runCmd(`bit import ${helper.scopes.remote}/global/simple -p my-custom-location`);
          });
          it('should write the component to the specified path', () => {
            expect(componentFileLocation).to.be.a.file();
          });
        });
        describe('when the destination is an existing empty directory', () => {
          before(() => {
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            fs.ensureDirSync(path.join(helper.scopes.localPath, 'my-custom-location'));
            helper.command.runCmd(`bit import ${helper.scopes.remote}/global/simple -p my-custom-location`);
          });
          it('should write the component to the specified path', () => {
            expect(componentFileLocation).to.be.a.file();
          });
        });
        describe('when the destination directory is not empty', () => {
          let output;
          let existingFile;
          before(() => {
            existingFile = path.join(helper.scopes.localPath, 'my-custom-location/my-file.js');
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            fs.ensureDirSync(path.join(helper.scopes.localPath, 'my-custom-location'));
            fs.outputFileSync(existingFile, 'console.log()');
            output = helper.general.runWithTryCatch(
              `bit import ${helper.scopes.remote}/global/simple -p my-custom-location`
            );
          });
          it('should not import the component', () => {
            expect(componentFileLocation).to.not.be.a.path();
          });
          it('should not delete the existing file', () => {
            expect(existingFile).to.be.a.file();
          });
          it('should throw an error', () => {
            expect(output).to.have.string('unable to import');
          });
          it('should import successfully if the --override flag is used', () => {
            helper.command.runCmd(`bit import ${helper.scopes.remote}/global/simple -p my-custom-location --override`);
            expect(componentFileLocation).to.be.a.file();
          });
        });
        describe('when the destination is a file', () => {
          let output;
          before(() => {
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            fs.outputFileSync(path.join(helper.scopes.localPath, 'my-custom-location'), 'console.log()');
            output = helper.general.runWithTryCatch(
              `bit import ${helper.scopes.remote}/global/simple -p my-custom-location`
            );
          });
          it('should not import the component', () => {
            expect(componentFileLocation).to.not.be.a.path();
          });
          it('should not delete the existing file', () => {
            expect(path.join(helper.scopes.localPath, 'my-custom-location')).to.be.a.file();
          });
          it('should throw an error', () => {
            expect(output).to.have.string('unable to import');
          });
          it('should throw an error also when the --override flag is used', () => {
            output = helper.general.runWithTryCatch(
              `bit import ${helper.scopes.remote}/global/simple -p my-custom-location --override`
            );
            expect(output).to.have.string('unable to import');
          });
        });
      });
    });

    describe('re-import after deleting the component physically', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('global/simple');
        fs.removeSync(path.join(helper.scopes.localPath, 'components'));
        output = helper.command.importComponent('global/simple');
      });
      it('should import the component successfully', () => {
        expect(output).to.have.string('successfully imported one component');
      });
    });

    describe('re-import after deleting the bit.map file', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('global/simple');
        fs.removeSync(path.join(helper.scopes.localPath, '.bitmap'));
        output = helper.command.importComponent('global/simple --override');
      });
      it('should import the component successfully', () => {
        expect(output).to.have.string('successfully imported one component');
      });
    });
    describe('import component with custom dsl as destination dir for import', () => {
      describe('when the DSL is valid', () => {
        let output;
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.bitJson.setComponentsDir('{scope}/-{name}-');
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('global/simple');
          output = helper.command.importComponent('global/simple');
        });
        it('should import the component successfully', () => {
          expect(output).to.have.string('successfully imported one component');
        });
        it('should import the component into new dir structure according to dsl', () => {
          expect(path.join(helper.scopes.localPath, helper.scopes.remote, '-global/simple-')).to.be.a.directory(
            'should not be empty'
          ).and.not.empty;
        });
        it('bitmap should contain component with correct rootDir according to dsl', () => {
          const bitMap = helper.bitMap.read();
          const cmponentId = `${helper.scopes.remote}/global/simple@0.0.1`;
          expect(bitMap).to.have.property(cmponentId);
          expect(bitMap[cmponentId].rootDir).to.equal(`${helper.scopes.remote}/-global/simple-`);
        });
      });
      describe('when the DSL has invalid parameters', () => {
        let output;
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.bitJson.setComponentsDir('{non-exist-param}/{name}');
          helper.scopeHelper.addRemoteScope();
          output = helper.general.runWithTryCatch(`bit import ${helper.scopes.remote}/global/simple`);
        });
        it('should throw an error saying it has an invalid parameter', () => {
          expect(output).to.have.string(
            'the "non-exist-param" part of the component structure "{non-exist-param}/{name}" is invalid'
          );
        });
      });
      describe('when the DSL has the obsolete "namespace" parameter', () => {
        let output;
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.bitJson.setComponentsDir('{namespace}/{name}');
          helper.scopeHelper.addRemoteScope();
          output = helper.command.importComponent('global/simple');
        });
        it('should import the component successfully', () => {
          expect(output).to.have.string('successfully imported one component');
        });
        it('should import the component into the given structure without the namespace part', () => {
          expect(path.join(helper.scopes.localPath, 'global/simple')).to.be.a.directory('should not be empty').and.not
            .empty;
        });
        it('bitmap should contain component with correct rootDir according to dsl', () => {
          const bitMap = helper.bitMap.read();
          const componentId = `${helper.scopes.remote}/global/simple@0.0.1`;
          expect(bitMap).to.have.property(componentId);
          expect(bitMap[componentId].rootDir).to.equal('global/simple');
        });
      });
    });
  });

  describe('with compiler and tests', () => {
    describe('with multiple files located in different directories', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.env.importCompiler();
        helper.fs.createFile('src', 'imprel.js');
        helper.fs.createFile('src', 'imprel.spec.js');
        helper.fs.createFile('src/utils', 'myUtil.js');
        helper.command.addComponent('src/imprel.js src/utils/myUtil.js', {
          t: 'src/imprel.spec.js',
          m: 'src/imprel.js',
          i: 'imprel/impreldist',
        });
        helper.command.tagComponent('imprel/impreldist');
        helper.command.exportComponent('imprel/impreldist');
      });
      describe('when a project is cloned somewhere else as AUTHORED', () => {
        let localConsumerFiles;
        before(() => {
          helper.git.mimicGitCloneLocalProject(false);
          helper.scopeHelper.addRemoteScope();
          helper.command.runCmd('bit import --merge');
          localConsumerFiles = helper.fs.getConsumerFiles();
        });
        it('should write the internal files according to their original paths', () => {
          expect(localConsumerFiles).to.include(path.join('src', 'imprel.js'));
          expect(localConsumerFiles).to.include(path.join('src', 'imprel.spec.js'));
          expect(localConsumerFiles).to.include(path.join('src', 'utils', 'myUtil.js'));
        });
        it('should not write the dist files', () => {
          localConsumerFiles.forEach((file) => {
            expect(file.startsWith('components')).to.be.false;
            expect(file.endsWith('.map.js')).to.be.false;
          });
        });
      });
      describe('when imported', () => {
        let localConsumerFiles;
        const imprelDir = path.join('components', 'imprel', 'impreldist');
        const expectedLocationImprel = path.join(imprelDir, 'imprel.js');
        const expectedLocationImprelSpec = path.join(imprelDir, 'imprel.spec.js');
        const expectedLocationMyUtil = path.join(imprelDir, 'utils', 'myUtil.js');
        const expectedLocationImprelDist = path.join(imprelDir, 'dist', 'imprel.js');
        const expectedLocationImprelSpecDist = path.join(imprelDir, 'dist', 'imprel.spec.js');
        const expectedLocationMyUtilDist = path.join(imprelDir, 'dist', 'utils', 'myUtil.js');
        describe('without --ignore-dist flag', () => {
          before(() => {
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('imprel/impreldist');
            localConsumerFiles = helper.fs.getConsumerFiles();
          });
          it('should write the internal files according to their relative paths', () => {
            expect(localConsumerFiles).to.include(expectedLocationImprel);
            expect(localConsumerFiles).to.include(expectedLocationImprelSpec);
            expect(localConsumerFiles).to.include(expectedLocationMyUtil);
          });
          it('should write the dist files in the component root dir', () => {
            expect(localConsumerFiles).to.include(expectedLocationImprelDist);
            expect(localConsumerFiles).to.include(expectedLocationImprelSpecDist);
            expect(localConsumerFiles).to.include(expectedLocationMyUtilDist);
          });
          describe('when a project is cloned somewhere else as IMPORTED', () => {
            before(() => {
              helper.git.mimicGitCloneLocalProject(false);
              helper.scopeHelper.addRemoteScope();
              helper.command.runCmd('bit import --merge');
              localConsumerFiles = helper.fs.getConsumerFiles();
            });
            it('should write the internal files according to their relative paths', () => {
              expect(localConsumerFiles).to.include(expectedLocationImprel);
              expect(localConsumerFiles).to.include(expectedLocationImprelSpec);
              expect(localConsumerFiles).to.include(expectedLocationMyUtil);
            });
            it('should write the dist files in the component root dir', () => {
              expect(localConsumerFiles).to.include(expectedLocationImprelDist);
              expect(localConsumerFiles).to.include(expectedLocationImprelSpecDist);
              expect(localConsumerFiles).to.include(expectedLocationMyUtilDist);
            });
          });
        });
        describe('when dist is set to a non-default directory', () => {
          before(() => {
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            helper.bitJson.modifyField('dist', { target: 'another-dist' });
            helper.command.importComponent('imprel/impreldist');
            localConsumerFiles = helper.fs.getConsumerFiles();
          });
          it('should write the dist files according to the new dist-target set in bit.json', () => {
            const newDistDir = path.join('another-dist', 'components', 'imprel', 'impreldist');
            const newLocationImprelDist = path.join(newDistDir, 'imprel.js');
            const newLocationImprelSpecDist = path.join(newDistDir, 'imprel.spec.js');
            const newLocationMyUtilDist = path.join(newDistDir, 'utils', 'myUtil.js');
            expect(localConsumerFiles).to.include(newLocationImprelDist);
            expect(localConsumerFiles).to.include(newLocationImprelSpecDist);
            expect(localConsumerFiles).to.include(newLocationMyUtilDist);
          });
        });
        describe('with --ignore-dist flag', () => {
          before(() => {
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('imprel/impreldist --ignore-dist');
            localConsumerFiles = helper.fs.getConsumerFiles();
          });
          it('should write the internal files according to their relative paths', () => {
            expect(localConsumerFiles).to.include(expectedLocationImprel);
            expect(localConsumerFiles).to.include(expectedLocationImprelSpec);
            expect(localConsumerFiles).to.include(expectedLocationMyUtil);
          });
          it('should not write the dist files in the component root dir', () => {
            expect(localConsumerFiles).to.not.include(expectedLocationImprelDist);
            expect(localConsumerFiles).to.not.include(expectedLocationImprelSpecDist);
            expect(localConsumerFiles).to.not.include(expectedLocationMyUtilDist);
          });
          describe('when a project is cloned somewhere else as IMPORTED', () => {
            before(() => {
              helper.git.mimicGitCloneLocalProject(false);
              helper.scopeHelper.addRemoteScope();
              helper.command.runCmd('bit import --merge --ignore-dist');
              localConsumerFiles = helper.fs.getConsumerFiles();
            });
            it('should write the internal files according to their relative paths', () => {
              expect(localConsumerFiles).to.include(expectedLocationImprel);
              expect(localConsumerFiles).to.include(expectedLocationImprelSpec);
              expect(localConsumerFiles).to.include(expectedLocationMyUtil);
            });
            it('should not write the dist files in the component root dir', () => {
              expect(localConsumerFiles).to.not.include(expectedLocationImprelDist);
              expect(localConsumerFiles).to.not.include(expectedLocationImprelSpecDist);
              expect(localConsumerFiles).to.not.include(expectedLocationMyUtilDist);
            });
          });
        });
      });
    });
    it.skip('should not install envs when not requested', () => {});
    it.skip('should install envs when requested (-e)', () => {});
    it.skip('should create bit.json file with envs in the folder', () => {});
  });

  describe('import deprecated component', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('src', 'imprel.js');
      helper.fs.createFile('src', 'imprel.spec.js');
      helper.fs.createFile('src/utils', 'myUtil.js');
      helper.command.addComponent('src/imprel.js src/utils/myUtil.js', {
        t: 'src/imprel.spec.js',
        m: 'src/imprel.js',
        i: 'imprel/imprel',
      });
      helper.command.tagComponent('imprel/imprel');
      helper.command.deprecateComponent('imprel/imprel');
      helper.command.exportComponent('imprel/imprel');
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      output = helper.command.importComponent('imprel/imprel');
    });
    it('should import component with deprecated msg', () => {
      expect(output).to.have.string('successfully imported one component');
      expect(output).to.have.string('imprel/imprel');
      // expect(output).to.have.string('Deprecated');
    });
  });

  describe('with an existing component in bit.map (as author)', () => {
    let localConsumerFiles;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportComponent('bar/foo');
      const bitMap = helper.bitMap.read();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.bitMap.write(bitMap);
      helper.command.importComponent('bar/foo');
      localConsumerFiles = helper.fs.getConsumerFiles();
    });
    // Prevent cases when I export a component with few files from different directories
    // and get it in another structure during imports (for example under components folder instead of original folder)
    it('should write the component to the paths specified in bit.map', () => {
      const expectedLocation = path.join('bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should not remove the originallySharedDir (because it is an AUTHORED component)', () => {
      expect(localConsumerFiles).not.to.include('foo.js'); // it shouldn't remove 'bar'.
    });
    it('should not write any file into components directory', () => {
      localConsumerFiles.forEach((fileName) => {
        expect(fileName.startsWith('components')).to.be.false;
      });
    });
    describe('importing the component again', () => {
      before(() => {
        helper.command.importComponent('bar/foo');
        localConsumerFiles = helper.fs.getConsumerFiles();
      });
      it('should not create an "undefined" package on node_modules', () => {
        localConsumerFiles.forEach((fileName) => {
          expect(fileName.startsWith(path.join('node_modules', 'undefined'))).to.be.false;
        });
      });
    });
  });

  describe('import from bit json', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
    });
    describe('components with shared nested deps', () => {
      let localConsumerFiles;
      before(() => {
        helper.fs.createFile('', 'level1.js');
        const level0Fixture = "import a from './level1'";
        helper.fs.createFile('', 'level0.js', level0Fixture);
        helper.command.addComponent('level0.js', { i: 'dep/level0' });
        helper.command.addComponent('level1.js', { i: 'dep/level1' });
        const fileFixture = "import a from './level0'";
        helper.fs.createFile('', 'file1.js', fileFixture);
        helper.fs.createFile('', 'file2.js', fileFixture);
        helper.command.addComponent('file1.js', { i: 'comp/comp1' });
        helper.command.addComponent('file2.js', { i: 'comp/comp2' });
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        output = helper.command.importManyComponents(['comp/comp1', 'comp/comp2']);
        localConsumerFiles = helper.fs.getConsumerFiles();
      });
      it('should print the imported component correctly', () => {
        expect(output).to.have.string(`${helper.scopes.remote}/comp/comp1`);
        expect(output).to.have.string(`${helper.scopes.remote}/comp/comp2`);
      });
      it('should link the level0 dep from the dependencies folder to the first comp', () => {
        const expectedLocation = path.join('components', 'comp', 'comp1', 'level0.js');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should link the level0 dep from the dependencies folder to the second comp', () => {
        const expectedLocation = path.join('components', 'comp', 'comp2', 'level0.js');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should save the direct dependency in the components/.dependencies directory', () => {
        const expectedLocation = path.join(
          'components',
          '.dependencies',
          'dep',
          'level0',
          helper.scopes.remote,
          '0.0.1',
          'level0.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
      });

      it('should save the indirect dependency in the components/.dependencies directory (same as direct dependency)', () => {
        const expectedLocation = path.join(
          'components',
          '.dependencies',
          'dep',
          'level1',
          helper.scopes.remote,
          '0.0.1',
          'level1.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
      });

      it('should link the level1 dep from the level0 dep', () => {
        const expectedLocation = path.join(
          'components',
          '.dependencies',
          'dep',
          'level0',
          helper.scopes.remote,
          '0.0.1',
          'level1.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
      });
    });
  });

  describe("component's with bit.json and packages dependencies", () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();

      // export a new simple component
      helper.npm.addNpmPackage('lodash.isboolean', '3.0.0');
      const simpleFixture = 'import a from "lodash.isboolean"; ';
      helper.fs.createFile('global', 'simple.js', simpleFixture);
      helper.command.addComponent('global/simple.js', { i: 'global/simple' });
      helper.command.tagComponent('global/simple');
      helper.command.exportComponent('global/simple');

      helper.npm.addNpmPackage('lodash.isstring', '4.0.0');
      const withDepsFixture = 'import a from "./global/simple.js"; import c from "lodash.isstring"';
      helper.fs.createFile('', 'with-deps.js', withDepsFixture);
      helper.command.addComponent('with-deps.js', { i: 'comp/with-deps' });
      helper.command.tagAllComponents();
      helper.command.exportComponent('comp/with-deps');
    });

    describe('with one dependency', () => {
      let output;
      let bitMap;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        output = helper.command.importComponent('comp/with-deps');
        bitMap = helper.bitMap.read();
      });

      it('should add all missing components to bit.map file', () => {
        expect(bitMap).to.have.property(`${helper.scopes.remote}/global/simple${VERSION_DELIMITER}0.0.1`);
      });
      it('should mark direct dependencies as "IMPORTED" in bit.map file', () => {
        expect(bitMap[`${helper.scopes.remote}/comp/with-deps${VERSION_DELIMITER}0.0.1`].origin).to.equal('IMPORTED');
      });
      it('should mark indirect dependencies as "NESTED" in bit.map file', () => {
        expect(bitMap[`${helper.scopes.remote}/global/simple${VERSION_DELIMITER}0.0.1`].origin).to.equal('NESTED');
      });
      it('should print a successful message about installed npm packages', () => {
        expect(output).to.have.string('successfully ran npm install');
      });
      it('should write the dependency in the dependencies directory', () => {
        const depDir = path.join(
          helper.scopes.localPath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.scopes.remote,
          '0.0.1',
          'simple.js'
        );
        expect(fs.existsSync(depDir)).to.be.true;
      });
      it('should write a package.json in the component dir', () => {
        const packageJsonPath = path.join(helper.scopes.localPath, 'components', 'comp', 'with-deps', 'package.json');
        expect(fs.existsSync(packageJsonPath)).to.be.true;
        const packageJsonContent = fs.readJsonSync(packageJsonPath);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.scopes.remote}.comp.with-deps`,
          version: '0.0.1',
          main: 'with-deps.js',
        });
        expect(packageJsonContent.dependencies['lodash.isstring']).to.have.string('4.0.0'); // it can be ^4.0.0 or 4.0.0 depends on npm version installed
      });
      it('should write a package.json in the nested dependency component dir', () => {
        const packageJsonPath = path.join(
          helper.scopes.localPath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.scopes.remote,
          '0.0.1',
          'package.json'
        );
        expect(fs.existsSync(packageJsonPath)).to.be.true;
        const packageJsonContent = fs.readJsonSync(packageJsonPath);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.scopes.remote}.global.simple`,
          version: '0.0.1',
          main: 'simple.js',
        });
        expect(packageJsonContent.dependencies['lodash.isboolean']).to.have.string('3.0.0');
      });

      it.skip('should write the dependencies according to their relative paths', () => {});
    });

    describe('with --ignore-package-json flag', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.npm.initNpm();
        helper.command.importComponentWithOptions('comp/with-deps', { '-ignore-package-json': '' });
      });
      it('should not write a package.json in the component dir', () => {
        const packageJsonPath = path.join(helper.scopes.localPath, 'components', 'comp', 'with-deps', 'package.json');
        expect(fs.existsSync(packageJsonPath)).to.be.false;
      });
      it('should not write a package.json in the nested dependency component dir', () => {
        const packageJsonPath = path.join(
          helper.scopes.localPath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.scopes.remote,
          '0.0.1',
          'package.json'
        );
        expect(fs.existsSync(packageJsonPath)).to.be.false;
      });
      it('npm install should not throw an error on the second install', () => {
        // the first one creates the package-lock.json, the error used to be on the second install
        helper.command.runCmd('npm install');
        helper.command.runCmd('npm install'); // if it throws an error this will fail
      });
      it('should not add a record into the workspace package.json file', () => {
        const packageJson = helper.packageJson.read();
        expect(packageJson.dependencies).to.be.undefined;
      });
    });

    describe('with --skip-npm-install flag', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        output = helper.command.importComponentWithOptions('comp/with-deps', { '-skip-npm-install': '' });
      });
      it('should print warning for missing package dependencies', () => {
        expect(output).to.have.string(
          'error - missing the following package dependencies. please install and add to package.json.'
        );
        expect(output).to.have.string('lodash.isboolean: 3.0.0');
        expect(output).to.have.string('lodash.isstring: 4.0.0');
      });
    });
  });

  describe('components with auto-resolve dependencies', () => {
    /**
     * Directory structure of the author
     * bar/foo.js
     * utils/is-string.js
     * utils/is-type.js
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     */
    let localConsumerFiles;
    let clonedLocalScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
      helper.fixtures.addComponentBarFoo();
      helper.command.expectStatusToNotHaveIssues();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      clonedLocalScope = helper.scopeHelper.cloneLocalScope();
      localConsumerFiles = helper.fs.getConsumerFiles();
    });
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should not generate index.js files because package.json main already takes care of finding the entry-point', () => {
      localConsumerFiles.forEach((file) => expect(file).to.not.include('index.js'));
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('bit list', () => {
      it('should show only the components and not the dependencies when --scope is not used', () => {
        const listScope = helper.command.listLocalScope();
        expect(listScope).to.have.string('bar/foo');
        expect(listScope).to.not.have.string('utils/is-string');
        expect(listScope).to.not.have.string('utils/is-type');
      });
      it('should show the components and the dependencies when --scope is used', () => {
        const listScope = helper.command.listLocalScope('--scope');
        expect(listScope).to.have.string('bar/foo');
        expect(listScope).to.have.string('utils/is-string');
        expect(listScope).to.have.string('utils/is-type');
      });
    });
    describe('when cloning the project to somewhere else without component files. (component files are not under git)', () => {
      before(() => {
        helper.git.mimicGitCloneLocalProject(false);
        helper.scopeHelper.addRemoteScope();
      });
      describe('and running bit import without "--merge" flag', () => {
        before(() => {
          helper.command.importAllComponents();
          localConsumerFiles = helper.fs.getConsumerFiles();
        });
        it('should not write the components files', () => {
          localConsumerFiles.forEach((file) => {
            expect(file).to.not.startsWith('components');
          });
        });
      });
      describe('and running bit import with "--merge=manual" flag', () => {
        before(() => {
          helper.command.runCmd('bit import --merge=manual');
        });
        it('should write the components files back', () => {
          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
    });
    describe('when cloning the project to somewhere else with component files (component files are under git)', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(clonedLocalScope);
        helper.fs.createFile('components/bar/foo/bar', 'foo.js', fixtures.barFooFixtureV2);
        helper.git.mimicGitCloneLocalProject();
        helper.scopeHelper.addRemoteScope();
      });
      it('local scope should be empty', () => {
        const output = helper.command.listLocalScope();
        expect(output).to.have.string('found 0 components in local scope');
      });
      describe('after running bit import (without --merge flag)', () => {
        before(() => {
          helper.command.importAllComponents();
        });
        it('local scope should contain all the components', () => {
          const output = helper.command.listLocalScope('--scope');
          expect(output).to.have.string('found 3 components in local scope');
        });
        it('bit status should show missing links because the symlinks from the component node_modules to the dependencies are missing', () => {
          helper.command.expectStatusToHaveIssue(IssuesClasses.MissingLinks.name);
        });
        describe('after running bit link', () => {
          before(() => {
            helper.command.linkAndRewire();
            // first time creates the link file, the second does the rewire. (yes, ideally it'd be one).
            helper.command.linkAndRewire();
          });
          it('bit status should not show issues', () => {
            const status = helper.command.status();
            expect(status).to.not.have.string(statusFailureMsg);
          });
          it('should not override the current files', () => {
            // as opposed to running import with '--merge', the files should remain intact
            const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
            fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
          });
        });
      });
    });
    describe('re-import with a specific path', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(clonedLocalScope);
        helper.command.importComponent('bar/foo -p new-location');
        localConsumerFiles = helper.fs.getConsumerFiles();
      });
      it('should move the component directory to the new location', () => {
        const newLocation = path.join('new-location', 'bar', 'foo.js');
        const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
        expect(localConsumerFiles).to.include(newLocation);
        expect(localConsumerFiles).not.to.include(oldLocation);
      });
      it('should update the rootDir in bit.map to the new location', () => {
        const bitMap = helper.bitMap.read();
        const componentMap = bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`];
        expect(componentMap.rootDir).to.equal('new-location');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./new-location'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('when dist is set to a non-default directory', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        helper.bitJson.modifyField('dist', { target: 'dist' });
        helper.command.importComponent('bar/foo');
        localConsumerFiles = helper.fs.getConsumerFiles();
      });
      it('should copy the components into the dist directory', () => {
        const expectedLocation = path.join('dist', 'components', 'bar', 'foo', 'bar', 'foo.js');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should copy also the dependencies into the dist directory', () => {
        const expectedLocation = path.join(
          'dist/components/.dependencies/utils/is-string',
          helper.scopes.remote,
          '0.0.1/is-string.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
      });
    });
    describe('when imported component has lower dependencies versions than local', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-type');
        helper.command.importComponent('utils/is-string');
        helper.command.tagComponent('utils/is-type --force'); // it tags also is-string to 0.0.2
        output = helper.command.importComponent('bar/foo'); // import bar/foo@0.0.1 with is-string@0.0.1 and is-type@0.0.1 as dependencies
      });
      it('should not show an error saying failed finding in the dependencies array', () => {
        expect(output).to.have.string('successfully imported');
      });
    });
  });

  describe('components with auto-resolve dependencies using css', () => {
    /**
     * Directory structure of the author
     * bar/foo.js
     * style/style.css
     *
     * bar/foo depends on style/style.css.
     *
     * Expected structure after importing bar/foo in another project
     * components/bar/foo/bar/foo.js
     * components/bar/foo/index.js (generated index file)
     * components/bar/foo/style/style.css (generated link file)
     * components/.dependencies/style/style/scope-name/version-number/style/index.css (generated index file - point to is-string.js)
     * components/.dependencies/style/style/scope-name/version-number/style/style.css
     *
     */
    let localConsumerFiles;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('style', 'style.css', '.main {}');
      helper.command.addComponent('style/style.css', { i: 'style/style' });
      const fooBarFixture = "const style = require('../style/style.css');";
      helper.fs.createFile('bar', 'foo.js', fooBarFixture);
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      localConsumerFiles = helper.fs.getConsumerFiles('*.*');
    });
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create an index.css file on the style dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'style',
        'style',
        helper.scopes.remote,
        '0.0.1',
        'index.css'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.scopes.localPath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string("@import './style.css';");
    });
    it('should save the style dependency nested to the main component', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'style',
        'style',
        helper.scopes.remote,
        '0.0.1',
        'style.css'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the style dependency to its original location', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'style', 'style.css');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
  });
});
