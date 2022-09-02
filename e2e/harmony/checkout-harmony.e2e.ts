import chai, { expect } from 'chai';
import fs from 'fs-extra';
import { EOL } from 'os';
import * as path from 'path';

import { MissingBitMapComponent } from '../../src/consumer/bit-map/exceptions';
import { NewerVersionFound } from '../../src/consumer/exceptions';
import Helper, { FileStatusWithoutChalk } from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const barFooV1 = "module.exports = function foo() { return 'got foo'; };";
const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };";
const barFooV3 = "module.exports = function foo() { return 'got foo v3'; };";
const successOutput = 'successfully switched';

describe('bit checkout command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.reInitLocalScopeHarmony();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('for non existing component', () => {
    it('show an error saying the component was not found', () => {
      const useFunc = () => helper.command.runCmd('bit checkout 1.0.0 utils/non-exist');
      const error = new MissingBitMapComponent('utils/non-exist');
      helper.general.expectToThrow(useFunc, error);
    });
  });
  describe('after the component was created', () => {
    before(() => {
      helper.fixtures.createComponentBarFoo(barFooV1);
      helper.fixtures.addComponentBarFooAsDir();
    });
    it('before tagging it should show an error saying the component was not tagged yet', () => {
      const output = helper.general.runWithTryCatch('bit checkout 1.0.0 bar/foo');
      expect(output).to.have.string('component bar/foo is new, no version to checkout');
    });
    describe('after the component was tagged', () => {
      before(() => {
        helper.command.tagAllWithoutBuild('--ver 0.0.5');
      });
      describe('using a non-exist version', () => {
        it('should show an error saying the version does not exist', () => {
          const output = helper.general.runWithTryCatch('bit checkout 1.0.0 bar/foo');
          expect(output).to.have.string("component bar/foo doesn't have version 1.0.0");
        });
      });
      describe('and component was modified', () => {
        before(() => {
          helper.fixtures.createComponentBarFoo(barFooV2);
        });
        it('should show an error saying the component already uses that version', () => {
          const output = helper.general.runWithTryCatch('bit checkout 0.0.5 bar/foo');
          expect(output).to.have.string('component bar/foo is already at version 0.0.5');
        });
        describe('and tagged again', () => {
          let output;
          before(() => {
            helper.command.tagAllWithoutBuild('--ver 0.0.10');
            output = helper.general.runWithTryCatch('bit checkout 0.0.5 bar/foo');
          });
          it('should display a successful message', () => {
            expect(output).to.have.string(successOutput);
            expect(output).to.have.string('0.0.5');
            expect(output).to.have.string('bar/foo');
          });
          it('should revert to v1', () => {
            const fooContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js'));
            expect(fooContent.toString()).to.equal(barFooV1);
          });
          it('should update bitmap with the used version', () => {
            const bitMap = helper.bitMap.read();
            expect(bitMap).to.have.property('bar/foo');
            expect(bitMap['bar/foo'].version).to.equal('0.0.5');
          });
          it('should not show the component as modified', () => {
            const statusOutput = helper.command.runCmd('bit status');
            expect(statusOutput).to.not.have.string('modified components');
          });
          it('bit list should show the currently used version and latest local version', () => {
            const listOutput = helper.command.listLocalScopeParsed('--outdated');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            expect(listOutput[0].currentVersion).to.equal('0.0.5');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            expect(listOutput[0].localVersion).to.equal('0.0.10');
          });
          describe('trying to tag when using an old version', () => {
            before(() => {
              helper.fixtures.createComponentBarFoo('console.log("modified components");');
            });
            it('should throw an error NewerVersionFound', () => {
              const tagFunc = () => helper.command.tagComponent('bar/foo');
              const error = new NewerVersionFound([
                { componentId: 'bar/foo', currentVersion: '0.0.5', latestVersion: '0.0.10' },
              ]);
              helper.general.expectToThrow(tagFunc, error);
            });
            it('should allow tagging when --ignore-newest-version flag is used', () => {
              const tagOutput = helper.command.tagComponent('bar/foo', 'msg', '--ignore-newest-version');
              expect(tagOutput).to.have.string('1 component(s) tagged');
            });
          });
        });
      });
    });
  });
  describe('components with dependencies with multiple versions', () => {
    let outputV2: string;
    let localScope: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      outputV2 = helper.fixtures.populateComponents(3, undefined, 'v2');
      helper.command.tagAllWithoutBuild();
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    it('as an intermediate step, make sure all components have v2', () => {
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal(outputV2);
    });
    describe('switching to a previous version of the main component', () => {
      let output;
      let bitMap;
      before(() => {
        output = helper.command.checkoutVersion('0.0.1', 'comp1');
        bitMap = helper.bitMap.read();
      });
      it('should display a successful message', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('comp1');
      });
      it('should write the files of that version for the main component only and not its dependencies', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('comp1 and comp2v2 and comp3v2');
      });
      it('should update bitmap of the main component with the used version', () => {
        expect(bitMap.comp1.version).to.equal('0.0.1');
      });
      it('should not change the dependencies in bitmap file', () => {
        expect(bitMap.comp2.version).to.equal('0.0.2');
        expect(bitMap.comp3.version).to.equal('0.0.2');
      });
      it('should show the main component as modified because its dependencies are now having different version', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
      it('should not write package.json file', () => {
        expect(path.join(helper.scopes.localPath, 'package.json')).to.not.be.a.path();
      });
      it('should not write package-lock.json file', () => {
        expect(path.join(helper.scopes.localPath, 'package-lock.json')).to.not.be.a.path();
      });
    });
    describe('missing the latest Version object from the filesystem', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.export();
        helper.command.checkout('0.0.1 --all');

        // simulate the missing object by deliberately deleting the object from the filesystem
        const head = helper.command.getHead('comp1');
        const objectPath = helper.general.getHashPathOfObject(head);
        helper.fs.deleteObject(objectPath);
      });
      // previously, it was throwing an error:
      // error: version "0.0.2" of component tpkb99cd-remote/comp1 was not found on the filesystem.
      it('should not throw an error', () => {
        expect(() => helper.command.checkoutHead('--all')).to.not.throw();
      });
    });
  });
  describe('when the current version has new files', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllWithoutBuild();
      helper.fs.outputFile('bar/foo2.js');
      helper.command.tagAllWithoutBuild();

      helper.command.checkoutVersion('0.0.1', 'bar/foo');
    });
    it('should delete the new files', () => {
      // because they don't exist in the checked out version
      expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.not.be.a.path();
    });
  });
  describe('when the component is modified and a file was changed in the checked out version', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.outputFile('bar/index.js', "console.log('v1');");
      helper.fs.outputFile('bar/foo.txt', 'v1');
      helper.command.addComponent('bar');
      helper.command.tagAllWithoutBuild();
      helper.fs.outputFile('bar/foo.txt', 'v2');
      helper.command.tagAllWithoutBuild();
      helper.fs.outputFile('bar/index.js', "console.log('v2');"); // change the main file to have it as modified.
      helper.command.checkoutVersion('0.0.1', 'bar');
    });
    it('should update the file according to the checked out version', () => {
      const content = helper.fs.readFile('bar/foo.txt');
      expect(content).to.equal('v1');
    });
  });
  describe('when a file was deleted locally but not in the base and the new version', () => {
    let scopeAfterFirstVersion: string;
    let scopeBeforeCheckout: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/foo.ts');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      scopeAfterFirstVersion = helper.scopeHelper.cloneLocalScope();
      helper.command.tagIncludeUnmodifiedWithoutBuild(); // 0.0.2
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(scopeAfterFirstVersion);
      helper.command.import();
      helper.fs.deletePath('comp1/foo.ts');
      scopeBeforeCheckout = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit checkout head', () => {
      before(() => {
        helper.command.checkoutHead('comp1 --skip-npm-install');
      });
      it('should leave the file deleted', () => {
        const deletedFile = path.join(helper.scopes.localPath, 'comp1/foo.ts');
        expect(deletedFile).to.not.be.a.path();
      });
    });
    describe('bit checkout reset', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeCheckout);
        helper.command.checkoutReset('comp1 --skip-npm-install');
      });
      it('should re-create the file', () => {
        const deletedFile = path.join(helper.scopes.localPath, 'comp1/foo.ts');
        expect(deletedFile).to.be.a.path();
      });
    });
  });
  describe('when a file was added in the new version (and not exists locally)', () => {
    let afterFirstExport: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      afterFirstExport = helper.scopeHelper.cloneLocalScope();
      helper.fs.outputFile('comp1/foo.ts');
      helper.command.compile();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(afterFirstExport);
      helper.command.import();
      helper.command.checkoutHead('--all');
    });
    it('should write the new files', () => {
      const newFilePath = path.join(helper.scopes.localPath, 'comp1/foo.ts');
      expect(newFilePath).to.be.a.file();
    });
  });
  describe('modified component with conflicts', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.createComponentBarFoo(`${barFooV1}\n`);
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.fixtures.createComponentBarFoo(`${barFooV2}\n`);
      helper.fixtures.tagComponentBarFoo();
      helper.fixtures.createComponentBarFoo(`${barFooV3}\n`);
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('using manual strategy', () => {
      let output;
      before(() => {
        output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--manual');
      });
      it('should indicate that the file has conflicts', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.manual);
      });
      it('should rewrite the file with the conflict with the conflicts segments', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.have.string('<<<<<<<');
        expect(fileContent).to.have.string('>>>>>>>');
        expect(fileContent).to.have.string('=======');
      });
      it('should label the conflicts segments according to the versions', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.have.string('<<<<<<< 0.0.2 modified');
        expect(fileContent).to.have.string('>>>>>>> 0.0.1');
      });
      it('should not strip the last line', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent.endsWith('\n')).to.be.true;
      });
      it('should update bitmap with the specified version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo');
        expect(bitMap['bar/foo'].version).to.equal('0.0.1');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
      it('should not try to compile the files', () => {
        expect(output).not.to.have.string('compilation failed');
        expect(output).not.to.have.string('Merge conflict marker encountered');
      });
      it('should not run the package installation', () => {
        expect(output).not.to.have.string('installing dependencies');
        expect(output).not.to.have.string('pnpm');
        expect(output).not.to.have.string('yarn');
      });
    });
    describe('using theirs strategy', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--theirs');
      });
      it('should indicate that the file has updated', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.updated);
      });
      it('should rewrite the file according to the used version', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(`${barFooV1}${EOL}`);
      });
      it('should update bitmap with the used version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo');
        expect(bitMap['bar/foo'].version).to.equal('0.0.1');
      });
      it('should not show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified components');
      });
    });
    describe('using ours strategy', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--ours');
      });
      it('should indicate that the version was switched', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
      });
      it('should indicate that the file was not changed', () => {
        expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
      });
      it('should leave the file intact', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(`${barFooV3}\n`);
      });
      it('should update bitmap with the used version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo');
        expect(bitMap['bar/foo'].version).to.equal('0.0.1');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('when new files are added', () => {
      let scopeWithAddedFile;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.outputFile('bar/foo2.js');
        scopeWithAddedFile = helper.scopeHelper.cloneLocalScope();
      });
      describe('using manual strategy', () => {
        let output;
        before(() => {
          output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--manual');
        });
        it('should indicate that a new file was added', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.added);
          expect(output).to.have.string('foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
      });
      describe('using theirs strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithAddedFile);
          output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--theirs');
        });
        it('should indicate that the new file was removed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.removed);
          expect(output).to.have.string('foo2.js');
        });
        it('should delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.not.be.a.path();
        });
      });
      describe('using ours strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithAddedFile);
          output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--ours');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
      });
    });
  });
  describe('checkout-head when the local head is not up to date', () => {
    let localHeadScope: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      localHeadScope = helper.scopeHelper.cloneLocalScope();
      helper.fixtures.populateComponents(1, false, 'v3');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(localHeadScope);
      helper.command.checkout('0.0.1 --all');
      helper.command.checkoutHead();
    });
    it('should checkout to the remote head and not to the local head', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp1.version).to.equal('0.0.3');
    });
  });
});
