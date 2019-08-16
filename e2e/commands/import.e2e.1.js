/* eslint-disable max-lines */
import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import Helper, { VERSION_DELIMITER } from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { ComponentNotFound } from '../../src/scope/exceptions';
import InvalidConfigPropPath from '../../src/consumer/config/exceptions/invalid-config-prop-path';
import { componentIssuesLabels } from '../../src/cli/templates/component-issues-template';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);
chai.use(require('chai-string'));

describe('bit import', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  describe('stand alone component (without dependencies)', () => {
    let importOutput;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      // export a new simple component
      helper.createFile('global', 'simple.js');
      helper.addComponent('global/simple.js', { i: 'global/simple' });
      helper.tagComponent('global/simple');
      helper.exportComponent('global/simple');

      helper.reInitLocalScope();
      helper.addRemoteScope();
      importOutput = helper.importComponent('global/simple');
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
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple${VERSION_DELIMITER}0.0.1`);
    });
    // TODO: Validate all files exists in a folder with the component name
    it('should write the component to default path from bit.json', () => {
      // TODO: check few cases with different structure props - namespace, name, version, scope
      const expectedLocation = path.join(helper.localScopePath, 'components', 'global', 'simple', 'simple.js');
      expect(fs.existsSync(expectedLocation)).to.be.true;
    });
    it('should not write the component bit.json file (only when --conf flag is set)', () => {
      const bitJsonLocation = path.join(helper.localScopePath, 'components', 'global', 'simple', 'bit.json');
      expect(fs.existsSync(bitJsonLocation)).to.be.false;
    });

    describe('with multiple files located in different directories', () => {
      before(() => {
        helper.createFile('src', 'imprel.js');
        helper.createFile('src', 'imprel.spec.js');
        helper.createFile('src/utils', 'myUtil.js');
        helper.runCmd(
          'bit add src/imprel.js src/utils/myUtil.js -t src/imprel.spec.js -m src/imprel.js -i imprel/imprel'
        );
        helper.tagComponent('imprel/imprel');
        helper.exportComponent('imprel/imprel');
        helper.reInitLocalScope();
        helper.addRemoteScope();
        const output = helper.importComponent('imprel/imprel');
        expect(output.includes('successfully imported one component')).to.be.true;
        expect(output.includes('imprel/imprel')).to.be.true;
      });
      it('should write the internal files according to their relative paths', () => {
        const imprelRoot = path.join(helper.localScopePath, 'components', 'imprel', 'imprel');
        const expectedLocationImprel = path.join(imprelRoot, 'imprel.js');
        const expectedLocationImprelSpec = path.join(imprelRoot, 'imprel.spec.js');
        const expectedLocationMyUtil = path.join(imprelRoot, 'utils', 'myUtil.js');
        expect(fs.existsSync(expectedLocationImprel)).to.be.true;
        expect(fs.existsSync(expectedLocationImprelSpec)).to.be.true;
        expect(fs.existsSync(expectedLocationMyUtil)).to.be.true;
      });
    });

    describe('with --conf flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('global/simple --conf');
      });
      it('should write the bit.json file of the component', () => {
        const expectedLocation = path.join(helper.localScopePath, 'components', 'global', 'simple', 'bit.json');
        expect(fs.existsSync(expectedLocation)).to.be.true;
      });
    });

    describe('when the default component directory already exist', () => {
      const componentFileLocation = path.join(helper.localScopePath, 'components/global/simple/simple.js');
      const componentDir = path.join(helper.localScopePath, 'components/global/simple');
      describe('when the destination is an existing empty directory', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.addRemoteScope();
          fs.ensureDirSync(componentDir);
          helper.runCmd(`bit import ${helper.remoteScope}/global/simple`);
        });
        it('should write the component to the specified path', () => {
          expect(componentFileLocation).to.be.a.file();
        });
      });
      describe('when the destination directory is not empty', () => {
        let output;
        const existingFile = path.join(componentDir, 'my-file.js');
        before(() => {
          helper.reInitLocalScope();
          helper.addRemoteScope();
          fs.outputFileSync(existingFile, 'console.log()');
          output = helper.runWithTryCatch(`bit import ${helper.remoteScope}/global/simple`);
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
          output = helper.importComponent('global/simple --override');
          expect(componentFileLocation).to.be.a.file();
        });
      });
      describe('when the destination is a file', () => {
        let output;
        before(() => {
          helper.reInitLocalScope();
          helper.addRemoteScope();
          fs.outputFileSync(componentDir, 'console.log()');
          output = helper.runWithTryCatch(`bit import ${helper.remoteScope}/global/simple`);
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
          output = helper.runWithTryCatch(`bit import ${helper.remoteScope}/global/simple --override`);
          expect(output).to.have.string('unable to import');
        });
      });
    });

    describe('with a specific path, using -p flag', () => {
      describe('as author', () => {
        describe('when there is a track dir', () => {
          before(() => {
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.createFile('bar-author-track', 'foo1.js');
            helper.createFile('bar-author-track', 'foo2.js');
            helper.outputFile('should-not-be-deleted.js');
            helper.addComponent('bar-author-track', { m: 'foo1.js' });
            helper.tagAllComponents();
            helper.exportAllComponents();
            helper.importComponentWithOptions('bar-author-track', { p: 'my-new-dir' });
          });
          it('should not delete other files on the workspace', () => {
            expect(path.join(helper.localScopePath, 'should-not-be-deleted.js')).to.be.a.file();
          });
          it('should throw an error saying it is not possible to move the component', () => {
            expect(path.join(helper.localScopePath, 'my-new-dir')).to.be.a.directory();
          });
        });
        describe('when there is no track dir', () => {
          before(() => {
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.createFile('bar-author', 'foo.js');
            helper.outputFile('should-not-be-deleted.js');
            helper.addComponent('bar-author/foo.js');
            helper.tagAllComponents();
            helper.exportAllComponents();
            const func = () => helper.importComponentWithOptions('foo', { p: 'my-new-dir' });
            expect(func).to.throw();
          });
          it('should not delete other files on the workspace', () => {
            expect(path.join(helper.localScopePath, 'should-not-be-deleted.js')).to.be.a.file();
          });
          it('should not move the component', () => {
            expect(path.join(helper.localScopePath, 'bar-author')).to.be.a.directory();
          });
        });
      });
      describe('as imported', () => {
        const componentFileLocation = path.join(helper.localScopePath, 'my-custom-location/simple.js');
        before(() => {
          helper.reInitLocalScope();
          helper.addRemoteScope();
        });
        describe('when the destination is a non-exist directory', () => {
          before(() => {
            helper.runCmd(`bit import ${helper.remoteScope}/global/simple -p my-custom-location`);
          });
          it('should write the component to the specified path', () => {
            expect(componentFileLocation).to.be.a.file();
          });
        });
        describe('when the destination is an existing empty directory', () => {
          before(() => {
            helper.reInitLocalScope();
            helper.addRemoteScope();
            fs.ensureDirSync(path.join(helper.localScopePath, 'my-custom-location'));
            helper.runCmd(`bit import ${helper.remoteScope}/global/simple -p my-custom-location`);
          });
          it('should write the component to the specified path', () => {
            expect(componentFileLocation).to.be.a.file();
          });
        });
        describe('when the destination directory is not empty', () => {
          let output;
          const existingFile = path.join(helper.localScopePath, 'my-custom-location/my-file.js');
          before(() => {
            helper.reInitLocalScope();
            helper.addRemoteScope();
            fs.ensureDirSync(path.join(helper.localScopePath, 'my-custom-location'));
            fs.outputFileSync(existingFile, 'console.log()');
            output = helper.runWithTryCatch(`bit import ${helper.remoteScope}/global/simple -p my-custom-location`);
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
            helper.runCmd(`bit import ${helper.remoteScope}/global/simple -p my-custom-location --override`);
            expect(componentFileLocation).to.be.a.file();
          });
        });
        describe('when the destination is a file', () => {
          let output;
          before(() => {
            helper.reInitLocalScope();
            helper.addRemoteScope();
            fs.outputFileSync(path.join(helper.localScopePath, 'my-custom-location'), 'console.log()');
            output = helper.runWithTryCatch(`bit import ${helper.remoteScope}/global/simple -p my-custom-location`);
          });
          it('should not import the component', () => {
            expect(componentFileLocation).to.not.be.a.path();
          });
          it('should not delete the existing file', () => {
            expect(path.join(helper.localScopePath, 'my-custom-location')).to.be.a.file();
          });
          it('should throw an error', () => {
            expect(output).to.have.string('unable to import');
          });
          it('should throw an error also when the --override flag is used', () => {
            output = helper.runWithTryCatch(
              `bit import ${helper.remoteScope}/global/simple -p my-custom-location --override`
            );
            expect(output).to.have.string('unable to import');
          });
        });
      });
    });

    describe('re-import after deleting the component physically', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('global/simple');
        fs.removeSync(path.join(helper.localScopePath, 'components'));
        output = helper.importComponent('global/simple');
      });
      it('should import the component successfully', () => {
        expect(output).to.have.string('successfully imported one component');
      });
    });

    describe('re-import after deleting the bit.map file', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('global/simple');
        fs.removeSync(path.join(helper.localScopePath, '.bitmap'));
        output = helper.importComponent('global/simple --override');
      });
      it('should import the component successfully', () => {
        expect(output).to.have.string('successfully imported one component');
      });
    });
    describe('import component with custom dsl as destination dir for import', () => {
      describe('when the DSL is valid', () => {
        let output;
        before(() => {
          helper.reInitLocalScope();
          helper.bitJson.setComponentsDirInBitJson('{scope}/-{name}-');
          helper.addRemoteScope();
          helper.importComponent('global/simple');
          output = helper.importComponent('global/simple');
        });
        it('should import the component successfully', () => {
          expect(output).to.have.string('successfully imported one component');
        });
        it('should import the component into new dir structure according to dsl', () => {
          expect(path.join(helper.localScopePath, helper.remoteScope, '-global/simple-')).to.be.a.directory(
            'should not be empty'
          ).and.not.empty;
        });
        it('bitmap should contain component with correct rootDir according to dsl', () => {
          const bitMap = helper.readBitMap();
          const cmponentId = `${helper.remoteScope}/global/simple@0.0.1`;
          expect(bitMap).to.have.property(cmponentId);
          expect(bitMap[cmponentId].rootDir).to.equal(`${helper.remoteScope}/-global/simple-`);
        });
      });
      describe('when the DSL has invalid parameters', () => {
        let output;
        before(() => {
          helper.reInitLocalScope();
          helper.bitJson.setComponentsDirInBitJson('{non-exist-param}/{name}');
          helper.addRemoteScope();
          output = helper.runWithTryCatch(`bit import ${helper.remoteScope}/global/simple`);
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
          helper.reInitLocalScope();
          helper.bitJson.setComponentsDirInBitJson('{namespace}/{name}');
          helper.addRemoteScope();
          output = helper.importComponent('global/simple');
        });
        it('should import the component successfully', () => {
          expect(output).to.have.string('successfully imported one component');
        });
        it('should import the component into the given structure without the namespace part', () => {
          expect(path.join(helper.localScopePath, 'global/simple')).to.be.a.directory('should not be empty').and.not
            .empty;
        });
        it('bitmap should contain component with correct rootDir according to dsl', () => {
          const bitMap = helper.readBitMap();
          const componentId = `${helper.remoteScope}/global/simple@0.0.1`;
          expect(bitMap).to.have.property(componentId);
          expect(bitMap[componentId].rootDir).to.equal('global/simple');
        });
      });
    });
  });

  describe('with compiler and tests', () => {
    describe('with multiple files located in different directories', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.importCompiler();
        helper.createFile('src', 'imprel.js');
        helper.createFile('src', 'imprel.spec.js');
        helper.createFile('src/utils', 'myUtil.js');
        helper.runCmd(
          'bit add src/imprel.js src/utils/myUtil.js -t src/imprel.spec.js -m src/imprel.js -i imprel/impreldist'
        );
        helper.tagComponent('imprel/impreldist');
        helper.exportComponent('imprel/impreldist');
      });
      describe('when a project is cloned somewhere else as AUTHORED', () => {
        let localConsumerFiles;
        before(() => {
          helper.mimicGitCloneLocalProject(false);
          helper.addRemoteScope();
          helper.runCmd('bit import --merge');
          localConsumerFiles = helper.getConsumerFiles();
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
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.importComponent('imprel/impreldist');
            localConsumerFiles = helper.getConsumerFiles();
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
              helper.mimicGitCloneLocalProject(false);
              helper.addRemoteScope();
              helper.runCmd('bit import --merge');
              localConsumerFiles = helper.getConsumerFiles();
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
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.bitJson.modifyFieldInBitJson('dist', { target: 'another-dist' });
            helper.importComponent('imprel/impreldist');
            localConsumerFiles = helper.getConsumerFiles();
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
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.importComponent('imprel/impreldist --ignore-dist');
            localConsumerFiles = helper.getConsumerFiles();
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
              helper.mimicGitCloneLocalProject(false);
              helper.addRemoteScope();
              helper.runCmd('bit import --merge --ignore-dist');
              localConsumerFiles = helper.getConsumerFiles();
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
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('src', 'imprel.js');
      helper.createFile('src', 'imprel.spec.js');
      helper.createFile('src/utils', 'myUtil.js');
      helper.runCmd(
        'bit add src/imprel.js src/utils/myUtil.js -t src/imprel.spec.js -m src/imprel.js -i imprel/imprel'
      );
      helper.tagComponent('imprel/imprel');
      helper.deprecateComponent('imprel/imprel');
      helper.exportComponent('imprel/imprel');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      output = helper.importComponent('imprel/imprel');
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
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.exportComponent('bar/foo');
      const bitMap = helper.readBitMap();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.writeBitMap(bitMap);
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles();
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
        helper.importComponent('bar/foo');
        localConsumerFiles = helper.getConsumerFiles();
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
      helper.setNewLocalAndRemoteScopes();
    });
    describe('components with shared nested deps', () => {
      let localConsumerFiles;
      before(() => {
        helper.createFile('', 'level1.js');
        const level0Fixture = "import a from './level1'";
        helper.createFile('', 'level0.js', level0Fixture);
        helper.addComponent('level0.js', { i: 'dep/level0' });
        helper.addComponent('level1.js', { i: 'dep/level1' });
        const fileFixture = "import a from './level0'";
        helper.createFile('', 'file1.js', fileFixture);
        helper.createFile('', 'file2.js', fileFixture);
        helper.addComponent('file1.js', { i: 'comp/comp1' });
        helper.addComponent('file2.js', { i: 'comp/comp2' });
        helper.tagAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        output = helper.importManyComponents(['comp/comp1', 'comp/comp2']);
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should print the imported component correctly', () => {
        expect(output).to.have.string(`${helper.remoteScope}/comp/comp1`);
        expect(output).to.have.string(`${helper.remoteScope}/comp/comp2`);
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
          helper.remoteScope,
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
          helper.remoteScope,
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
          helper.remoteScope,
          '0.0.1',
          'level1.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
      });
    });
  });

  describe("component's with bit.json and packages dependencies", () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();

      // export a new simple component
      helper.addNpmPackage('lodash.isboolean', '3.0.0');
      const simpleFixture = 'import a from "lodash.isboolean"; ';
      helper.createFile('global', 'simple.js', simpleFixture);
      helper.addComponent('global/simple.js', { i: 'global/simple' });
      helper.tagComponent('global/simple');
      helper.exportComponent('global/simple');

      helper.addNpmPackage('lodash.isstring', '4.0.0');
      const withDepsFixture = 'import a from "./global/simple.js"; import c from "lodash.isstring"';
      helper.createFile('', 'with-deps.js', withDepsFixture);
      helper.addComponent('with-deps.js', { i: 'comp/with-deps' });
      helper.tagAllComponents();
      helper.exportComponent('comp/with-deps');
    });

    describe('with one dependency', () => {
      let output;
      let bitMap;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        output = helper.importComponent('comp/with-deps');
        bitMap = helper.readBitMap();
      });

      it('should add all missing components to bit.map file', () => {
        expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple${VERSION_DELIMITER}0.0.1`);
      });
      it('should mark direct dependencies as "IMPORTED" in bit.map file', () => {
        expect(bitMap[`${helper.remoteScope}/comp/with-deps${VERSION_DELIMITER}0.0.1`].origin).to.equal('IMPORTED');
      });
      it('should mark indirect dependencies as "NESTED" in bit.map file', () => {
        expect(bitMap[`${helper.remoteScope}/global/simple${VERSION_DELIMITER}0.0.1`].origin).to.equal('NESTED');
      });
      it('should print a successful message about installed npm packages', () => {
        expect(output).to.have.string('successfully ran npm install');
      });
      it('should write the dependency in the dependencies directory', () => {
        const depDir = path.join(
          helper.localScopePath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.remoteScope,
          '0.0.1',
          'simple.js'
        );
        expect(fs.existsSync(depDir)).to.be.true;
      });
      it('should write a package.json in the component dir', () => {
        const packageJsonPath = path.join(helper.localScopePath, 'components', 'comp', 'with-deps', 'package.json');
        expect(fs.existsSync(packageJsonPath)).to.be.true;
        const packageJsonContent = fs.readJsonSync(packageJsonPath);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.remoteScope}.comp.with-deps`,
          version: '0.0.1',
          main: 'with-deps.js'
        });
        expect(packageJsonContent.dependencies['lodash.isstring']).to.have.string('4.0.0'); // it can be ^4.0.0 or 4.0.0 depends on npm version installed
      });
      it('should write a package.json in the nested dependency component dir', () => {
        const packageJsonPath = path.join(
          helper.localScopePath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.remoteScope,
          '0.0.1',
          'package.json'
        );
        expect(fs.existsSync(packageJsonPath)).to.be.true;
        const packageJsonContent = fs.readJsonSync(packageJsonPath);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.remoteScope}.global.simple`,
          version: '0.0.1',
          main: 'simple.js'
        });
        expect(packageJsonContent.dependencies['lodash.isboolean']).to.have.string('3.0.0');
      });

      it.skip('should write the dependencies according to their relative paths', () => {});
    });

    describe('with --ignore-package-json flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponentWithOptions('comp/with-deps', { '-ignore-package-json': '' });
      });
      it('should not write a package.json in the component dir', () => {
        const packageJsonPath = path.join(helper.localScopePath, 'components', 'comp', 'with-deps', 'package.json');
        expect(fs.existsSync(packageJsonPath)).to.be.false;
      });
      it('should not write a package.json in the nested dependency component dir', () => {
        const packageJsonPath = path.join(
          helper.localScopePath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.remoteScope,
          '0.0.1',
          'package.json'
        );
        expect(fs.existsSync(packageJsonPath)).to.be.false;
      });
    });

    describe('with --skip-npm-install flag', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        output = helper.importComponentWithOptions('comp/with-deps', { '-skip-npm-install': '' });
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
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(fixtures.barFooFixture);
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      clonedLocalScope = helper.cloneLocalScope();
      localConsumerFiles = helper.getConsumerFiles();
    });
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should not generate index.js files because package.json main already takes care of finding the entry-point', () => {
      localConsumerFiles.forEach(file => expect(file).to.not.include('index.js'));
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('bit list', () => {
      it('should show only the components and not the dependencies when --scope is not used', () => {
        const listScope = helper.listLocalScope();
        expect(listScope).to.have.string('bar/foo');
        expect(listScope).to.not.have.string('utils/is-string');
        expect(listScope).to.not.have.string('utils/is-type');
      });
      it('should show the components and the dependencies when --scope is used', () => {
        const listScope = helper.listLocalScope('--scope');
        expect(listScope).to.have.string('bar/foo');
        expect(listScope).to.have.string('utils/is-string');
        expect(listScope).to.have.string('utils/is-type');
      });
    });
    describe('when cloning the project to somewhere else without component files. (component files are not under git)', () => {
      before(() => {
        helper.mimicGitCloneLocalProject(false);
        helper.addRemoteScope();
      });
      describe('and running bit import without "--merge" flag', () => {
        before(() => {
          helper.importAllComponents();
          localConsumerFiles = helper.getConsumerFiles();
        });
        it('should not write the components files', () => {
          localConsumerFiles.forEach((file) => {
            expect(file).to.not.startsWith('components');
          });
        });
      });
      describe('and running bit import with "--merge=manual" flag', () => {
        before(() => {
          helper.runCmd('bit import --merge=manual');
        });
        it('should write the components files back', () => {
          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
    });
    describe('when cloning the project to somewhere else with component files (component files are under git)', () => {
      before(() => {
        helper.getClonedLocalScope(clonedLocalScope);
        helper.createFile('components/bar/foo/bar', 'foo.js', fixtures.barFooFixtureV2);
        helper.mimicGitCloneLocalProject();
        helper.addRemoteScope();
      });
      it('local scope should be empty', () => {
        const output = helper.listLocalScope();
        expect(output).to.have.string('found 0 components in local scope');
      });
      describe('after running bit import (without --merge flag)', () => {
        before(() => {
          helper.importAllComponents();
        });
        it('local scope should contain all the components', () => {
          const output = helper.listLocalScope('--scope');
          expect(output).to.have.string('found 3 components in local scope');
        });
        it('bit status should show missing links because the symlinks from the component node_modules to the dependencies are missing', () => {
          const status = helper.status();
          expect(status).to.have.string(componentIssuesLabels.missingLinks);
        });
        describe('after running bit link', () => {
          before(() => {
            helper.runCmd('bit link');
          });
          it('bit status should not show issues', () => {
            const status = helper.status();
            expect(status).to.not.have.string(componentIssuesLabels);
          });
          it('should not override the current files', () => {
            // as opposed to running import with '--merge', the files should remain intact
            const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
            fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
          });
        });
      });
    });
    describe('re-import with a specific path', () => {
      before(() => {
        helper.getClonedLocalScope(clonedLocalScope);
        helper.importComponent('bar/foo -p new-location');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should move the component directory to the new location', () => {
        const newLocation = path.join('new-location', 'bar', 'foo.js');
        const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
        expect(localConsumerFiles).to.include(newLocation);
        expect(localConsumerFiles).not.to.include(oldLocation);
      });
      it('should update the rootDir in bit.map to the new location', () => {
        const bitMap = helper.readBitMap();
        const componentMap = bitMap[`${helper.remoteScope}/bar/foo@0.0.1`];
        expect(componentMap.rootDir).to.equal('new-location');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./new-location'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('when dist is set to a non-default directory', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.bitJson.modifyFieldInBitJson('dist', { target: 'dist' });
        helper.importComponent('bar/foo');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should copy the components into the dist directory', () => {
        const expectedLocation = path.join('dist', 'components', 'bar', 'foo', 'bar', 'foo.js');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should copy also the dependencies into the dist directory', () => {
        const expectedLocation = path.join(
          'dist/components/.dependencies/utils/is-string',
          helper.remoteScope,
          '0.0.1/is-string.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
      });
    });
    describe('when imported component has lower dependencies versions than local', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-type');
        helper.importComponent('utils/is-string');
        helper.tagComponent('utils/is-type --force'); // it tags also is-string to 0.0.2
        output = helper.importComponent('bar/foo'); // import bar/foo@0.0.1 with is-string@0.0.1 and is-type@0.0.1 as dependencies
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
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('style', 'style.css', '.main {}');
      helper.addComponent('style/style.css', { i: 'style/style' });
      const fooBarFixture = "const style = require('../style/style.css');";
      helper.createFile('bar', 'foo.js', fooBarFixture);
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles('*.*');
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
        helper.remoteScope,
        '0.0.1',
        'index.css'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string("@import './style.css';");
    });
    it('should save the style dependency nested to the main component', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'style',
        'style',
        helper.remoteScope,
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

  // This is one of the most important cases, because it involve a lot of working pieces from the base flow:
  // Add, build, tag, export, import, dependency resolution, index file generation
  describe('components with auto-resolve dependencies - with compiler', () => {
    /**
     * Directory structure of the author
     * bar/foo.js
     * utils/is-string.js
     * utils/is-type.js
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * There is babel compiler defined
     *
     * Expected structure after importing bar/foo in another project
     * components/bar/foo/bar/foo.js
     * components/bar/foo/dist/bar/foo.js
     * components/bar/foo/index.js (generated index file - point to dist/bar/foo.js)
     * components/bar/foo/utils/is-string.js (generated link file - point to index file of is-string component)
     * components/bar/foo/dist/utils/is-string.js (generated link file - point to index file of is-string component)
     * components/.dependencies/utils/is-string/scope-name/version-number/index.js (generated index file - point to dist/is-string.js)
     * components/.dependencies/utils/is-string/scope-name/version-number/utils/is-string.js
     * components/.dependencies/utils/is-string/scope-name/version-number/utils/is-type.js (generated link file which enable is-string to use is-type)
     * components/.dependencies/utils/is-string/scope-name/version-number/dist/utils/is-type.js (link file which enable is-string to use is-type)
     * components/.dependencies/utils/is-string/scope-name/version-number/dist/utils/is-string.js (compiled version)
     * components/.dependencies/utils/is-type/scope-name/version-number/index.js (generated index file - point to dist/is-type.js)
     * components/.dependencies/utils/is-type/scope-name/version-number/utils/is-type.js
     * components/.dependencies/utils/is-type/scope-name/version-number/dist/utils/is-type.js (compiled version)
     */
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      helper.createFile('utils', 'is-type.js', fixtures.isTypeES6);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isStringES6);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(fixtures.barFooES6);
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles();
    });
    const isStringLocation = path.join(
      'components',
      '.dependencies',
      'utils',
      'is-string',
      helper.remoteScope,
      '0.0.1'
    );
    const isTypeLocation = path.join('components', '.dependencies', 'utils', 'is-type', helper.remoteScope, '0.0.1');
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create the dist files of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should not create an index.js file on the is-string dependency', () => {
      const expectedLocation = path.join(isStringLocation, 'index.js');
      expect(localConsumerFiles).not.to.include(expectedLocation);
    });
    it('should not create an index.js file on the is-type dependency', () => {
      const expectedLocation = path.join(isTypeLocation, 'index.js');
      expect(localConsumerFiles).not.to.include(expectedLocation);
    });
    it('should save the direct dependency nested to the main component', () => {
      const expectedLocation = path.join(isStringLocation, 'is-string.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should save the indirect dependency nested to the main component (as opposed to nested of nested)', () => {
      const expectedLocation = path.join(isTypeLocation, 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should add dependencies dists files to file system', () => {
      const expectedIsTypeDistLocation = path.join(isTypeLocation, 'dist', 'is-type.js');
      const expectedIsStringDistLocation = path.join(isStringLocation, 'dist', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedIsTypeDistLocation);
      expect(localConsumerFiles).to.include(expectedIsStringDistLocation);
    });
    it('should link the direct dependency to its index file from main component source folder', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'utils', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the direct dependency to its index file from main component dist folder', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'utils', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the indirect dependency from dependent component source folder to its index file in the dependency directory', () => {
      const expectedLocation = path.join(isStringLocation, 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the indirect dependency from dependent component dist folder to its index file in the dependency directory', () => {
      const expectedLocation = path.join(isStringLocation, 'dist', 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFooES6);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('importing with --ignore-dist flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo --ignore-dist');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should not write anything to the dist folder of the main component', () => {
        const distFolder = path.join('components', 'bar', 'foo', 'dist');
        localConsumerFiles.forEach(file => expect(file).to.not.have.string(distFolder));
      });
      it('main property of package.json file should point to the source and not to the dist', () => {
        const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components', 'bar', 'foo'));
        expect(packageJson.main).to.equal('bar/foo.js');
      });
      describe('bit build after importing without --ignore-dist flag', () => {
        before(() => {
          helper.addRemoteEnvironment();
          helper.build('bar/foo');

          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        });
        it('package.json main attribute should point to the main dist file', () => {
          const packageJsonFile = path.join(helper.localScopePath, 'components', 'bar', 'foo');
          const packageJson = helper.readPackageJson(packageJsonFile);
          expect(packageJson.main).to.equal('dist/bar/foo.js');
        });
        it('should not create an index file because it uses the package.json main property', () => {
          const indexFile = path.join(helper.localScopePath, 'components', 'bar', 'foo', 'index.js');
          expect(indexFile).to.not.be.a.path();
        });
        it('should generate all the links in the dists directory and be able to require its direct dependency', () => {
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        describe('bit build all', () => {
          before(() => {
            fs.removeSync(path.join(helper.localScopePath, 'components', 'bar', 'foo', 'dist'));
            helper.build();
          });
          it('should build the imported component although it was not modified', () => {
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
        });
      });
    });
    describe('re-import with a specific path', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        helper.importComponent('bar/foo -p new-location');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should move the component directory to the new location', () => {
        const newLocation = path.join('new-location', 'bar', 'foo.js');
        const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
        expect(localConsumerFiles).to.include(newLocation);
        expect(localConsumerFiles).not.to.include(oldLocation);
      });
      it('should update the rootDir in bit.map to the new location', () => {
        const bitMap = helper.readBitMap();
        const componentMap = bitMap[`${helper.remoteScope}/bar/foo@0.0.1`];
        expect(componentMap.rootDir).to.equal('new-location');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = `const barFoo = require('${helper.getRequireBitPath('bar', 'foo')}');
console.log(barFoo.default());`;
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('bit diff should not show any diff', () => {
        const outputAll = helper.runWithTryCatch('bit diff');
        expect(outputAll).to.have.string('no modified components');
        const outputBarFoo = helper.runWithTryCatch('bit diff bar/foo');
        expect(outputBarFoo).to.have.string('no diff for');
      });
    });
    describe('import with --conf', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo --conf');
      });
      it('should save the compiler with id only without files and config because it does not use them', () => {
        const bitJson = helper.bitJson.readBitJson(path.join(helper.localScopePath, 'components/bar/foo'));
        expect(bitJson).to.have.property('env');
        expect(bitJson.env).to.have.property('compiler');
        expect(bitJson.env.compiler).to.equal(`${helper.envScope}/compilers/babel@0.0.1`);
      });
    });
  });

  describe('modifying a dependent and a dependency at the same time', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();

      const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
      const isStringFixtureV2 =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
      helper.createFile('utils', 'is-string.js', isStringFixtureV2); // modify is-string

      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
    });
    it('the dependent should have the updated version of the dependency', () => {
      const output = helper.showComponentParsed('utils/is-string');
      expect(output.dependencies[0].id).to.have.string('is-type@0.0.2');
    });
    it('should use the updated dependent and dependencies and print the results from the latest versions', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v2 and got is-string v2');
    });
  });

  describe('to an inner directory (not consumer root)', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();

      const pathToRunImportFrom = path.join(helper.localScopePath, 'utils');
      fs.ensureDirSync(pathToRunImportFrom);
      helper.runCmd(`bit import ${helper.remoteScope}/bar/foo`, pathToRunImportFrom);
    });
    it('should import to the consumer root directory as if the command was running from the root', () => {
      const expectedLocation = path.join(helper.localScopePath, 'components', 'bar', 'foo', 'foo.js');
      expect(fs.existsSync(expectedLocation)).to.be.true;
    });
  });

  describe('importing v1 of a component when a component has v2', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.importCompiler();

      const isTypeFixtureV1 = "module.exports = function isType() { return 'got is-type v1'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV1);
      helper.addComponentUtilsIsType();
      helper.tagComponent('utils/is-type');
      const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
      helper.tagComponent('utils/is-type');
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type@0.0.1');
    });
    it('should show the component as pending updates', () => {
      const statusOutput = helper.runCmd('bit status');
      expect(statusOutput).to.have.string('pending updates');
      expect(statusOutput).to.have.string('current: 0.0.1');
      expect(statusOutput).to.have.string('latest: 0.0.2');
    });
    describe('then importing v2', () => {
      before(() => {
        helper.importComponent('utils/is-type@0.0.2');
      });
      it('should imported v2 successfully and print the result from the latest version', () => {
        const appJsFixture = "const isType = require('./components/utils/is-type'); console.log(isType());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2'); // notice the "v2"
      });
      it('should update the existing record in bit.map', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.2`);
      });
      it('should not create a new record in bit.map', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
      });
    });
  });

  describe('after adding dependencies to an imported component with relative syntax', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isStringWithNoDepsFixture = "module.exports = function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringWithNoDepsFixture);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');

      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      const isStringWithDepsFixture =
        "const isType = require('../../../utils/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('components/utils/is-string', 'is-string.js', isStringWithDepsFixture); // modify utils/is-string
      try {
        output = helper.tagAllComponents();
      } catch (err) {
        output = err.toString();
      }
    });
    it('should not allow tagging the component', () => {
      expect(output).to.have.string(
        `error: issues found with the following component dependencies\n\n${
          helper.remoteScope
        }/utils/is-string@0.0.1\ncomponents with relative import statements (please use absolute paths for imported components): \n     is-string.js -> utils/is-type\n\n`
      );
    });
  });

  /**
   * requiring an imported component with relative paths may lead to bigger and bigger dependencies
   * paths. It's better to avoid them and use absolute path instead
   */
  describe('after adding another component requiring the imported component with relative syntax', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type');
      const isStringWithDepsFixture =
        "const isType = require('../components/utils/is-type/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringWithDepsFixture);
      helper.addComponentUtilsIsString();
      try {
        output = helper.tagAllComponents();
      } catch (err) {
        output = err.toString();
      }
    });
    it('should not allow tagging the component', () => {
      expect(output).to.have.string(
        'components with relative import statements (please use absolute paths for imported components)'
      );
    });
  });

  describe('import the same component ("is-type") as an indirect dependency (of "is-string") and as a direct dependency', () => {
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importManyComponents(['utils/is-type', 'utils/is-string']);
      localConsumerFiles = helper.getConsumerFiles();
    });
    it('should write is-type directly in components directory', () => {
      const expectedLocation = path.join('components', 'utils', 'is-type', 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should not write is-type in the dependencies directory', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-type',
        helper.remoteScope,
        '0.0.1',
        'utils',
        'is-type.js'
      );
      expect(localConsumerFiles).to.not.include(expectedLocation);
    });
    it('should successfully require is-type dependency and print the results from both components', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string');
    });
  });

  describe('import the same component ("is-type") as an indirect dependency (of "is-string") and as a direct dependency with a newer version', () => {
    // in other words, is-type@0.0.1 is a direct dependency of is-string, and the bit.json have these two components:
    // is-string@0.0.1 and is-type@0.0.2. After the import we expect to have both is-type versions (1 and 2), and is-string to
    // work with the v1 of is-type.
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixtureV1 = "module.exports = function isType() { return 'got is-type v1'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV1);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();

      const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // update component
      helper.tagAllComponents();

      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();

      helper.importManyComponents(['utils/is-string@0.0.1', ['utils/is-type@0.0.2']]);
    });
    it('should successfully print results of is-type@0.0.1 when requiring it indirectly by is-string', () => {
      const requirePath = helper.getRequireBitPath('utils', 'is-string');
      const appJsFixture = `const isString = require('${requirePath}'); console.log(isString());`;
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v1 and got is-string');
    });
    it('should successfully print results of is-type@0.0.2 when requiring it directly', () => {
      const requirePath = helper.getRequireBitPath('utils', 'is-type');
      const appJsFixture = `const isType = require('${requirePath}'); console.log(isType());`;
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v2');
    });
  });

  describe('creating two components: "is-type" and "is-string" while "is-string" depends on "is-type"', () => {
    let scopeAfterExport;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.exportAllComponents();
      scopeAfterExport = helper.cloneLocalScope();
    });
    describe('import is-type as a dependency and then import it directly', () => {
      let localConsumerFiles;
      let localScope;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string'); // imports is-type as a dependency
        helper.importComponent('utils/is-type');
        localConsumerFiles = helper.getConsumerFiles();

        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        localScope = helper.cloneLocalScope();
      });
      it('should rewrite is-type directly into "components" directory', () => {
        const expectedLocation = path.join('components', 'utils', 'is-type', 'is-type.js');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should update the existing record of is-type in bit.map from NESTED to IMPORTED', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
        expect(bitMap[`${helper.remoteScope}/utils/is-type@0.0.1`].origin).to.equal('IMPORTED');
      });
      it('should not show any component in bit status', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.a.string('utils/is-string');
        expect(output).to.not.have.a.string('utils/is-type');
        expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
      });
      it('should not break the is-string component', () => {
        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2);

        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
      describe('moving is-type', () => {
        before(() => {
          helper.move('components/utils/is-type', 'another-dir');
        });
        it('should not break is-string component', () => {
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.have.string('got is-string');
        });
      });
      describe('removing is-string', () => {
        before(() => {
          helper.getClonedLocalScope(localScope);
          helper.removeComponent(`${helper.remoteScope}/utils/is-string`, '-f -d -s');
        });
        it('should not delete is-type from the filesystem', () => {
          localConsumerFiles = helper.getConsumerFiles();
          const expectedLocation = path.join('components', 'utils', 'is-type', 'is-type.js');
          expect(localConsumerFiles).to.include(expectedLocation);
        });
        it('should not delete is-type from bitMap', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
        });
      });
    });
    describe('import is-type directly and then as a dependency', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-type');
        helper.importComponent('utils/is-string'); // imports is-type as a dependency
      });
      it('should keep the existing record of is-type in bit.map as IMPORTED', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
        expect(bitMap[`${helper.remoteScope}/utils/is-type@0.0.1`].origin).to.equal('IMPORTED');
      });
      it('changes of is-type in components directory should affect is-string', () => {
        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2);

        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
    });
    describe('import is-type directly, changing it then import it as a dependency', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-type');
        helper.createFile('components/utils/is-type', 'is-type.js', fixtures.isTypeV2);
        output = helper.runWithTryCatch(`bit import ${helper.remoteScope}/utils/is-string`); // imports is-type as a dependency
      });
      it('should throw an error saying is-type is modified, suggesting to override or merge', () => {
        expect(output).to.have.string('unable to import');
        expect(output).to.have.string('--override');
        expect(output).to.have.string('--merge');
      });
    });
    describe('import is-type as a dependency and then import it directly with a newer version', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterExport);
        helper.createFile('utils', 'is-type.js', fixtures.isTypeV2);
        helper.createFile('utils', 'is-string.js', fixtures.isStringV2);
        helper.tagAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string@0.0.1'); // imports is-type@0.0.1 as a dependency
        helper.importComponent('utils/is-type@0.0.2');
      });
      it('should show the component as modified', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.have.a.string('modified');
      });
      it('bit diff should show that the modification is about version bump of is-type', () => {
        const diff = helper.diff();
        expect(diff).to.have.string(`- [ ${helper.remoteScope}/utils/is-type@0.0.1 ]`);
        expect(diff).to.have.string(`+ [ ${helper.remoteScope}/utils/is-type@0.0.2 ]`);
      });
      it('should use the new version of is-type', () => {
        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
    });
  });

  describe('import component with dependencies from scope A, modify and export them to scope B, then import to a new local scope', () => {
    let scopeB;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      // export to scope A
      helper.exportAllComponents();
      // import to a new local scope
      helper.initNewLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
      // modify the component
      const isStringModifiedFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
      const componentPath = path.join('components', 'utils', 'is-string');
      helper.createFile(componentPath, 'is-string.js', isStringModifiedFixture);
      helper.tagComponent('utils/is-string');
      // export to scope B
      const { scopeName, scopePath } = helper.getNewBareScope();
      scopeB = scopeName;
      helper.addRemoteScope(scopePath);
      helper.exportComponent(`${helper.remoteScope}/utils/is-string@0.0.2`, scopeB);
      // import to a new local scope
      helper.initNewLocalScope();
      helper.addRemoteScope(scopePath);
      helper.runCmd(`bit import ${scopeB}/utils/is-string`);
    });
    it('should export the component successfully to scope B', () => {
      const output = helper.runCmd(`bit list ${scopeB}`);
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('utils/is-string')).to.be.true;
    });
    it('should import the component successfully from scope B to a new local scope', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string v2');
    });
  });

  describe('import component with dependencies, modify and export, then author import the updated version', () => {
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.exportAllComponents();
      const authorScope = helper.localScope;

      helper.initNewLocalScope(false);
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
      // modify the component
      const isStringModifiedFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
      const componentPath = path.join('components', 'utils', 'is-string');
      helper.createFile(componentPath, 'is-string.js', isStringModifiedFixture);
      helper.tagComponent('utils/is-string');
      helper.exportComponent(`${helper.remoteScope}/utils/is-string@0.0.2`);

      fs.removeSync(helper.localScopePath);
      helper.setLocalScope(authorScope);
      helper.importComponent('utils/is-string');
      localConsumerFiles = glob
        .sync(path.normalize('**/*.js'), { cwd: helper.localScopePath })
        .map(x => path.normalize(x));
    });
    it('should update the author original component successfully', () => {
      const appJsFixture = "const isString = require('./utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string v2');
    });
    it('should not write any file into components directory', () => {
      localConsumerFiles.forEach((fileName) => {
        expect(fileName.startsWith('components')).to.be.false;
      });
    });
  });

  describe('import a component when the local version is modified', () => {
    let localScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      const barFooFixtureV2 = "module.exports = function foo() { return 'got foo v2'; };";
      helper.createFile(path.join('components', 'bar', 'foo'), 'foo.js', barFooFixtureV2);

      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      localScope = helper.cloneLocalScope();
    });
    describe('without --override flag', () => {
      let output;
      before(() => {
        try {
          helper.importComponent('bar/foo');
        } catch (err) {
          output = err.toString();
        }
      });
      it('should display a warning saying it was unable to import', () => {
        expect(output).to.have.string('unable to import');
      });
      it('should not override the local changes', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got foo v2');
      });
    });
    describe('with --override flag', () => {
      let output;
      before(() => {
        output = helper.importComponent('bar/foo --override');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
      });
      it('should override the local changes', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got foo');
      });
    });
    describe('with --merge=manual', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(localScope);
        output = helper.importComponent('bar/foo --merge=manual');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
      });
      it('should not override the local changes', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got foo v2');
      });
    });
    describe('re-import a component after tagging the component', () => {
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.tagAllComponents();
      });
      it('should import successfully', () => {
        const output = helper.importComponent('bar/foo');
        expect(output).to.have.string('successfully imported');
      });
    });
  });

  describe('component with shared directory (originallySharedDir) across files and dependencies', () => {
    /**
     * Directory structure of the author
     * src/bar/foo.js
     * src/utils/is-string.js
     * src/utils/is-type.js
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * Expected structure after importing bar/foo in another project.
     * components/bar/foo/bar/foo.js (Notice how the 'src' directory is gone)
     * components/bar/foo/index.js (generated index file)
     * components/bar/foo/utils/is-string.js (generated link file)
     * components/.dependencies/utils/is-string/scope-name/version-number/src/utils/index.js (generated index file - point to is-string.js)
     * components/.dependencies/utils/is-string/scope-name/version-number/src/utils/is-string.js
     * components/.dependencies/utils/is-string/scope-name/version-number/src/utils/is-type.js (generated link file)
     * components/.dependencies/utils/is-type/scope-name/version-number/src/utils/index.js (generated index file - point to is-type.js)
     * components/.dependencies/utils/is-type/scope-name/version-number/src/utils/is-type.js
     *
     */
    let localConsumerFiles;
    let clonedScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile(path.join('src', 'utils'), 'is-type.js', fixtures.isType);
      helper.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
      helper.createFile(path.join('src', 'utils'), 'is-string.js', fixtures.isString);
      helper.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      const fooBarFixture =
        "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.createFile(path.join('src', 'bar'), 'foo.js', fooBarFixture);
      helper.addComponent('src/bar/foo.js', { i: 'bar/foo' });
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      clonedScope = helper.cloneLocalScope();
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles('*.{js,json}');
    });
    it('should change the original directory structure of the main component and remove the shared directory', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create a package.json file on the component root dir', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'package.json');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    it('should not show any of the components as new or modified or deleted or staged', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
    });
    describe('when cloning the project to somewhere else', () => {
      before(() => {
        helper.mimicGitCloneLocalProject(false);
        helper.addRemoteScope();
        helper.runCmd('bit import --merge');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('re-import with a specific path', () => {
      describe('from consumer root', () => {
        before(() => {
          helper.importComponent('bar/foo -p new-location');
          localConsumerFiles = helper.getConsumerFiles();
        });
        it('should move the component directory to the new location', () => {
          const newLocation = path.join('new-location', 'bar', 'foo.js');
          const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
          expect(localConsumerFiles).to.include(newLocation);
          expect(localConsumerFiles).not.to.include(oldLocation);
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = "const barFoo = require('./new-location'); console.log(barFoo());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
      describe('from an inner directory', () => {
        before(() => {
          helper.getClonedLocalScope(clonedScope);
          helper.importComponent('bar/foo');
          helper.runCmd(
            `bit import ${helper.remoteScope}/bar/foo -p new-location`,
            path.join(helper.localScopePath, 'components')
          );
          localConsumerFiles = helper.getConsumerFiles();
        });
        it('should move the component directory to the new location', () => {
          const newLocation = path.join('components', 'new-location', 'bar', 'foo.js');
          const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
          expect(localConsumerFiles).to.include(newLocation);
          expect(localConsumerFiles).not.to.include(oldLocation);
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = "const barFoo = require('./components/new-location'); console.log(barFoo());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
    });
    describe('import a component and then its dependency directly', () => {
      // this covers several bugs found when there is originallySharedDir, a component is imported
      // and after that its dependency is imported directly.
      let output;
      before(() => {
        helper.getClonedLocalScope(clonedScope);
        helper.importComponent('bar/foo');
        output = helper.importComponent('utils/is-string');
      });
      it('should import the dependency successfully', () => {
        expect(output).to.have.string('successfully imported one component');
      });
      it('bit status should show a clean state', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.a.string(statusWorkspaceIsCleanMsg);
      });
    });
  });
  describe('import component with dependencies with yarn workspaces', () => {
    let dependencies;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      dependencies = path.join(
        helper.localScopePath,
        'components',
        '.dependencies',
        'global',
        'simple',
        helper.remoteScope,
        '0.0.1'
      );
      helper.addNpmPackage('lodash.isboolean', '3.0.0');
      const simpleFixture = 'import a from "lodash.isboolean"; ';
      helper.createFile('global', 'simple.js', simpleFixture);
      helper.addComponent('global/simple.js', { i: 'global/simple' });
      helper.tagComponent('global/simple');
      helper.exportComponent('global/simple');
      helper.addNpmPackage('lodash.isstring', '4.0.0');
      const withDepsFixture = 'import a from "./global/simple.js"; import c from "lodash.isstring"';
      helper.createFile('', 'with-deps.js', withDepsFixture);
      helper.addComponent('with-deps.js', { i: 'comp/with-deps' });
      helper.tagAllComponents();
      helper.exportComponent('comp/with-deps');
      helper.reInitLocalScope();
      helper.addRemoteScope(helper.remoteScopePath);
      helper.bitJson.manageWorkspaces();
      helper.importComponent('comp/with-deps');
      helper.addKeyValueToPackageJson({ customField: 'bit is awsome' });
    });
    it('should install component dependencie as separate packages with yarn workspaces', () => {
      expect(dependencies).to.be.a.directory('should not be empty').and.not.empty;
    });
    it('Should contain yarn lock file', () => {
      expect(path.join(helper.localScopePath, 'yarn.lock')).to.be.a.file('no yarn lock file');
    });
    it('should install  global/simple package dependencies with yarn', () => {
      expect(path.join(helper.localScopePath, 'node_modules')).to.be.a.directory('should not be empty').and.not.empty;
      expect(path.join(helper.localScopePath, 'node_modules', 'lodash.isboolean')).to.be.a.directory(
        'should contain lodash.isboolean'
      ).and.not.empty;
    });
    it('should contain  workspaces array in package.json  and private true', () => {
      const pkgJson = helper.readPackageJson(helper.localScopePath);
      expect(pkgJson.workspaces).to.include('components/.dependencies/**/*', 'components/**/*');
      expect(pkgJson.private).to.be.true;
    });
    it('component dep should be install as npm package', () => {
      const modulePath = path.join(
        helper.localScopePath,
        'node_modules',
        '@bit',
        `${helper.remoteScope}.global.simple`
      );
      expect(modulePath).to.be.a.directory('should contain component dep as npm package dep').and.not.empty;
    });
    it('Should not contain duplicate regex in workspaces dir if we run import again ', () => {
      helper.importComponent('comp/with-deps --override');
      const pkgJson = helper.readPackageJson(helper.localScopePath);
      expect(pkgJson.workspaces).to.include('components/.dependencies/**/*', 'components/**/*');
      expect(pkgJson.workspaces).to.be.ofSize(2);
      expect(path.join(helper.localScopePath, 'yarn.lock')).to.be.a.file('no yarn lock file');
    });
    it('Should not delete custom fields in package.json', () => {
      helper.importComponent('comp/with-deps --override');
      const pkgJson = helper.readPackageJson();
      expect(pkgJson).to.have.property('customField');
      expect(pkgJson.customField).to.equal('bit is awsome');
    });
    it('Should not delete delete workspaces that already existed in package.json', () => {
      helper.addKeyValueToPackageJson({ workspaces: ['comp'] });
      helper.importComponent('comp/with-deps --override');
      const pkgJson = helper.readPackageJson();
      expect(pkgJson.workspaces).to.include('components/.dependencies/**/*', 'components/**/*', 'test/comp/with-deps');
    });
    it('Should save workspaces with custom import path ', () => {
      helper.reInitLocalScope();
      helper.addRemoteScope(helper.remoteScopePath);
      helper.bitJson.manageWorkspaces();
      helper.importComponent('comp/with-deps -p test');
      const pkgJson = helper.readPackageJson();
      expect(pkgJson.workspaces).to.include('components/.dependencies/**/*', 'components/**/*', 'test');
    });
  });
  describe('importing a component when it has a local tag', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
    });
    describe('as author', () => {
      before(() => {
        helper.createComponentBarFoo('v2');
        const tagOutput = helper.tagAllComponents();
        expect(tagOutput).to.have.string('0.0.2');

        // at this stage, the remote component has only 0.0.1. The local component has also 0.0.2
        helper.importComponent('bar/foo');
      });
      it('should not remove the local version', () => {
        const catComponent = helper.catComponent('bar/foo');
        expect(catComponent.versions).to.have.property('0.0.1');
        expect(catComponent.versions).to.have.property('0.0.2');
      });
      it('should not override the local component', () => {
        const catComponent = helper.catComponent('bar/foo');
        expect(catComponent).to.have.property('state');
        expect(catComponent.state).to.have.property('versions');
        expect(catComponent.state.versions).to.have.property('0.0.2');
      });
    });
    describe('as imported', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        helper.createFile('components/bar/foo', 'foo.js', 'v2');
        const tagOutput = helper.tagAllComponents();
        expect(tagOutput).to.have.string('0.0.2');

        // at this stage, the remote component has only 0.0.1. The local component has also 0.0.2
        helper.importComponent('bar/foo');
      });
      it('should not remove the local version', () => {
        const catComponent = helper.catComponent(`${helper.remoteScope}/bar/foo`);
        expect(catComponent.versions).to.have.property('0.0.1');
        expect(catComponent.versions).to.have.property('0.0.2');
      });
      it('should not override the local component', () => {
        const catComponent = helper.catComponent(`${helper.remoteScope}/bar/foo`);
        expect(catComponent).to.have.property('state');
        expect(catComponent.state).to.have.property('versions');
        expect(catComponent.state.versions).to.have.property('0.0.2');
      });
      describe('importing a specific version', () => {
        let output;
        before(() => {
          output = helper.importComponent('bar/foo@0.0.1');
        });
        it('should not throw an error saying the component was not found', () => {
          expect(output).to.have.string('successfully imported');
        });
      });
    });
  });
  describe('importing a component when its dependency is authored', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsType();
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      const exportOutput = helper.exportAllComponents();

      // intermediate step to make sure all are exported
      expect(exportOutput).to.have.string('exported 2 components');

      const removeOutput = helper.removeComponent('utils/is-string', '--delete-files --silent');
      expect(removeOutput).to.have.string('successfully removed');

      output = helper.importComponent('utils/is-string');
    });
    it('should not throw an error when importing', () => {
      expect(output).to.have.string('successfully imported one component');
    });
    it('should generate the links to the authored component successfully', () => {
      const run = () => helper.runCmd(`node ${path.normalize('components/utils/is-string/is-string.js')}`);
      expect(run).not.to.throw();
    });
  });
  describe('adding a scoped package to an imported component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      helper.createFile('components/bar/foo', 'foo.js', 'require("@babel/core");');
      helper.addNpmPackage('@babel/core');
    });
    it('bit show should include the new package', () => {
      const show = helper.showComponentParsed('bar/foo');
      expect(show.packageDependencies).to.have.property('@babel/core');
    });
  });
  describe('import compiler with a non-exist version', () => {
    before(() => {
      helper.reInitLocalScope();
    });
    it('should throw an error that a component does not exist', () => {
      const compiler = 'bit.envs/compilers/babel@1000.0.0';
      const error = new ComponentNotFound(compiler);
      const importCmd = () => helper.importCompiler(compiler);
      helper.expectToThrow(importCmd, error);
    });
  });
  describe('import component with invalid bit.json paths properties', () => {
    describe('when componentsDefaultDirectory is invalid', () => {
      before(() => {
        helper.reInitLocalScope();
        const bitJson = helper.bitJson.readBitJson();
        bitJson.componentsDefaultDirectory = '/components/{name}';
        helper.bitJson.writeBitJson(bitJson);
      });
      it('should throw a descriptive error pointing to the bit.json property', () => {
        const importCmd = () => helper.importComponent('any-comp');
        const error = new InvalidConfigPropPath('componentsDefaultDirectory', '/components/{name}');
        helper.expectToThrow(importCmd, error);
      });
    });
    describe('when dependenciesDirectory is invalid', () => {
      before(() => {
        helper.reInitLocalScope();
        const bitJson = helper.bitJson.readBitJson();
        bitJson.dependenciesDirectory = '/components/.dependencies';
        helper.bitJson.writeBitJson(bitJson);
      });
      it('should throw a descriptive error pointing to the bit.json property', () => {
        const importCmd = () => helper.importComponent('any-comp');
        const error = new InvalidConfigPropPath('dependenciesDirectory', '/components/.dependencies');
        helper.expectToThrow(importCmd, error);
      });
    });
  });
  describe('when one file is a prefix of the other', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo.json');
      helper.addComponent('bar/foo.js bar/foo.json', { m: 'bar/foo.js', i: 'bar/foo' });
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      output = helper.importComponent('bar/foo');
    });
    it('should import with no error', () => {
      expect(output).to.have.string('successfully');
    });
  });
  describe('import with wildcards', () => {
    let scopeBeforeImport;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.createFile('utils', 'is-string.js');
      helper.createFile('utils', 'is-type.js');
      helper.addComponentBarFoo();
      helper.addComponentUtilsIsString();
      helper.addComponentUtilsIsType();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      scopeBeforeImport = helper.cloneLocalScope();
    });
    describe('import the entire scope', () => {
      let output;
      before(() => {
        output = helper.importComponent('*');
      });
      it('should import all components from the remote scope', () => {
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string('utils/is-string');
        expect(output).to.have.string('utils/is-type');
      });
      it('bit ls should show that all components from the remote scope were imported', () => {
        const ls = helper.listLocalScopeParsed();
        expect(ls).to.be.lengthOf(3);
      });
    });
    describe('import only bar/* namespace', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeBeforeImport);
        output = helper.importComponent('bar/*');
      });
      it('should import only bar/foo but not any component from utils namespace', () => {
        expect(output).to.have.string('bar/foo');
        expect(output).to.not.have.string('utils');
      });
      it('bit ls should show that only bar/foo has imported', () => {
        const ls = helper.listLocalScopeParsed();
        expect(ls).to.be.lengthOf(1);
        expect(ls[0].id).to.equal(`${helper.remoteScope}/bar/foo`);
      });
    });
    describe('import only utils/* namespace', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeBeforeImport);
        output = helper.importComponent('utils/*');
      });
      it('should import only utils components but not any component from bar namespace', () => {
        expect(output).to.not.have.string('bar/foo');
        expect(output).to.have.string('utils/is-string');
        expect(output).to.have.string('utils/is-type');
      });
      it('bit ls should show that only bar/foo has imported', () => {
        const ls = helper.listLocalScopeParsed();
        expect(ls).to.be.lengthOf(2);
      });
    });
  });
  describe('import with --dependencies and --dependents flags', () => {
    let scopeBeforeImport;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.createFile('utils', 'bar-dep.js');
      helper.createFile('bar', 'foo2.js', 'require("../utils/bar-dep");');
      helper.addComponent('utils/bar-dep.js');
      helper.addComponent('bar/foo2.js', { i: 'bar/foo2' });
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      scopeBeforeImport = helper.cloneLocalScope();
    });
    describe('import with --dependencies flag', () => {
      before(() => {
        helper.importComponent('bar/* --dependencies');
      });
      it('should import directly (not nested) all dependencies', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap)
          .to.have.property(`${helper.remoteScope}/utils/is-string@0.0.1`)
          .that.has.property('origin')
          .equal('IMPORTED');
        expect(bitMap)
          .to.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`)
          .that.has.property('origin')
          .equal('IMPORTED');
        expect(bitMap)
          .to.have.property(`${helper.remoteScope}/bar-dep@0.0.1`)
          .that.has.property('origin')
          .equal('IMPORTED');
      });
    });
    describe('import with --dependents flag', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeBeforeImport);
        output = helper.importComponent('utils/is-type --dependents');
      });
      it('should import all dependents', () => {
        expect(output).to.have.string('successfully imported 3 components');
        expect(output).to.have.string(`${helper.remoteScope}/utils/is-string`);
        expect(output).to.have.string(`${helper.remoteScope}/bar/foo`);
      });
      it('bit list should show them all', () => {
        const list = helper.listLocalScope();
        expect(list).to.have.string(`${helper.remoteScope}/utils/is-type`);
        expect(list).to.have.string(`${helper.remoteScope}/utils/is-string`);
        expect(list).to.have.string(`${helper.remoteScope}/bar/foo`);
      });
    });
  });
  // is-type has bar/foo@0.0.1 as an indirect dependent and bar/foo@0.0.1 as a direct dependent
  describe('component with different versions of the same dependent', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.tagAllComponents();
      helper.createComponentBarFoo("require('../utils/is-type.js')");
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
    });
    it('bit show of the remote scope should show both versions of the dependent', () => {
      const show = helper.showComponentParsed(`${helper.remoteScope}/utils/is-type --remote --dependents`);
      expect(show.dependentsInfo).to.have.lengthOf(3);
      const barFooV1 = show.dependentsInfo.find(d => d.id.name === 'bar/foo' && d.id.version === '0.0.1');
      const barFooV2 = show.dependentsInfo.find(d => d.id.name === 'bar/foo' && d.id.version === '0.0.2');
      expect(barFooV1).to.not.be.undefined;
      expect(barFooV2).to.not.be.undefined;
      expect(barFooV1)
        .to.have.property('depth')
        .that.equals(2);
      expect(barFooV2)
        .to.have.property('depth')
        .that.equals(1);
    });
    describe('import the component with "--dependents" flag', () => {
      before(() => {
        helper.importComponent('utils/is-type --dependents');
      });
      it('should import the dependent only once and with the highest version', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property(`${helper.remoteScope}/bar/foo@0.0.2`);
        expect(bitMap).to.not.have.property(`${helper.remoteScope}/bar/foo@0.0.1`);
      });
      it('bit show of the local scope show both versions of the dependent', () => {
        const show = helper.showComponentParsed(`${helper.remoteScope}/utils/is-type --dependents`);
        expect(show.dependentsInfo).to.have.lengthOf(3);
        const barFooV1 = show.dependentsInfo.find(d => d.id.name === 'bar/foo' && d.id.version === '0.0.1');
        const barFooV2 = show.dependentsInfo.find(d => d.id.name === 'bar/foo' && d.id.version === '0.0.2');
        expect(barFooV1).to.not.be.undefined;
        expect(barFooV2).to.not.be.undefined;
        expect(barFooV1)
          .to.have.property('depth')
          .that.equals(2);
        expect(barFooV2)
          .to.have.property('depth')
          .that.equals(1);
      });
    });
  });
});
