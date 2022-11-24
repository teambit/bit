import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
const assertArrays = require('chai-arrays');

chai.use(assertArrays);
chai.use(require('chai-string'));

describe('bit import', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('stand alone component (without dependencies)', () => {
    let importOutput;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      // export a new simple component
      helper.fs.createFile('global', 'simple.js');
      helper.command.addComponent('global', { i: 'global/simple' });
      helper.command.tagWithoutBuild('global/simple');
      helper.command.exportIds('global/simple');

      helper.scopeHelper.reInitLocalScopeWithDefault();
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
    it('should add the component into bit.map file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('global/simple');
    });
    describe('with multiple files located in different directories', () => {
      before(() => {
        helper.fs.createFile('src', 'imprel.js');
        helper.fs.createFile('src', 'imprel.spec.js');
        helper.fs.createFile('src/utils', 'myUtil.js');
        helper.command.addComponent('src', {
          m: 'src/imprel.js',
          i: 'imprel/imprel',
        });
        helper.command.tagWithoutBuild('imprel/imprel');
        helper.command.exportIds('imprel/imprel');
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        const output = helper.command.importComponent('imprel/imprel');
        expect(output.includes('successfully imported one component')).to.be.true;
        expect(output.includes('imprel/imprel')).to.be.true;
      });
      it('should write the internal files according to their relative paths', () => {
        const imprelRoot = path.join(helper.scopes.localPath, helper.scopes.remote, 'imprel', 'imprel');
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
      before(() => {
        componentDir = path.join(helper.scopes.localPath, helper.scopes.remote, 'global/simple');
        componentFileLocation = path.join(componentDir, 'simple.js');
      });
      describe('when the destination is an existing empty directory', () => {
        before(() => {
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
        let output: string;
        let existingFile: string;
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
        // @TODO: FIX ON HARMONY!
        it.skip('should import successfully if the --override flag is used', () => {
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
        // @TODO: FIX ON HARMONY!
        it.skip('should throw an error also when the --override flag is used', () => {
          output = helper.general.runWithTryCatch(`bit import ${helper.scopes.remote}/global/simple --override`);
          expect(output).to.have.string('unable to import');
        });
      });
    });

    describe('with a specific path, using -p flag', () => {
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
          // @TODO: FIX ON HARMONY!
          it.skip('should import successfully if the --override flag is used', () => {
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
    describe('import component with custom dsl as destination dir for import', () => {
      describe('when the DSL is valid', () => {
        let output;
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.bitJsonc.setComponentsDir('{scope}/-{name}-');
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
          const componentId = `global/simple`;
          expect(bitMap).to.have.property(componentId);
          expect(bitMap[componentId].rootDir).to.equal(`${helper.scopes.remote}/-global/simple-`);
        });
      });
      describe('when the DSL has invalid parameters', () => {
        let output;
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.bitJsonc.setComponentsDir('{non-exist-param}/{name}');
          helper.scopeHelper.addRemoteScope();
          output = helper.general.runWithTryCatch(`bit import ${helper.scopes.remote}/global/simple`);
        });
        it('should throw an error saying it has an invalid parameter', () => {
          expect(output).to.have.string(
            'the "non-exist-param" part of the component structure "{non-exist-param}/{name}" is invalid'
          );
        });
      });
    });
  });
  // @TODO: FIX ON HARMONY!
  describe.skip('with an existing component in bit.map (as author)', () => {
    let localConsumerFiles;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllComponents();
      helper.command.exportIds('bar/foo');
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
  describe('import a component when the local version is modified', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      const barFooFixtureV2 = "module.exports = function foo() { return 'got foo v2'; };";
      helper.fs.createFile(path.join(helper.scopes.remote, 'bar', 'foo'), 'foo.js', barFooFixtureV2);

      const appJsFixture = `const barFoo = require('./${helper.scopes.remote}/bar/foo'); console.log(barFoo());`;
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('without --override flag', () => {
      let output;
      before(() => {
        try {
          helper.command.importComponent('bar/foo');
        } catch (err: any) {
          output = err.toString();
        }
      });
      it('should display a warning saying it was unable to import', () => {
        expect(output).to.have.string('unable to import');
      });
    });
    describe('with --override flag', () => {
      let output;
      before(() => {
        output = helper.command.importComponent('bar/foo --override');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
      });
    });
    describe('with --merge=manual', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.importComponent('bar/foo --merge=manual');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
      });
    });
    describe('re-import a component after tagging the component', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.tagAllWithoutBuild();
      });
      it('should import successfully', () => {
        const output = helper.command.importComponent('bar/foo');
        expect(output).to.have.string('successfully imported');
      });
    });
  });
  describe('importing a component when it has a local tag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    describe('as imported', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo', '--path components/bar/foo');
        helper.fs.createFile('components/bar/foo', 'foo.js', 'v2');
        const tagOutput = helper.command.tagAllWithoutBuild();
        expect(tagOutput).to.have.string('0.0.2');

        // at this stage, the remote component has only 0.0.1. The local component has also 0.0.2
        helper.command.importComponent('bar/foo');
      });
      it('should not remove the local version', () => {
        const catComponent = helper.command.catComponent(`${helper.scopes.remote}/bar/foo`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.1');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.2');
      });
      it('should not override the local component', () => {
        const catComponent = helper.command.catComponent(`${helper.scopes.remote}/bar/foo`);
        expect(catComponent).to.have.property('state');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.state).to.have.property('versions');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.state.versions).to.have.property('0.0.2');
      });
      describe('importing a specific version', () => {
        let output;
        before(() => {
          output = helper.command.importComponent('bar/foo@0.0.1');
        });
        it('should not throw an error saying the component was not found', () => {
          expect(output).to.have.string('successfully imported');
        });
      });
    });
  });
  describe('import with wildcards', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    describe('import the entire scope', () => {
      let output;
      before(() => {
        output = helper.command.importComponent('*');
      });
      it('should import all components from the remote scope', () => {
        expect(output).to.have.string('comp1');
        expect(output).to.have.string('comp2');
        expect(output).to.have.string('comp3');
      });
      it('bit ls should show that all components from the remote scope were imported', () => {
        const ls = helper.command.listLocalScopeParsed();
        expect(ls).to.be.lengthOf(3);
      });
    });
  });
});
