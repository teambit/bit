import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { FailedLoadForTag } from '../../src/consumer/component/exceptions/failed-load-for-tag';
import { NoComponentDir } from '../../src/consumer/component/exceptions/no-component-dir';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('reduce-path functionality (eliminate the original shared-dir among component files and its dependencies)', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('with old-functionality (reduced on import) re-import after the author changed the originally-shared-dir', () => {
    let localConsumerFiles;
    before(() => {
      // Author creates a component in bar/foo.js
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      const authorScope = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      // Imported user gets the component without the "bar" directory as it is an originallySharedDir
      helper.command.importComponent('bar/foo');
      const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };";
      expect(fs.existsSync(path.join(helper.scopes.localPath, 'components', 'bar', 'foo', 'foo.js'))).to.be.true;
      helper.fs.createFile(path.join('components', 'bar', 'foo'), 'foo.js', barFooV2); // update component
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      const importedScope = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.getClonedLocalScope(authorScope);
      helper.command.importComponent('bar/foo');
      // Authored user updates the component with the recent changes done by Imported user
      const authorLocation = path.join(helper.scopes.localPath, 'bar', 'foo.js');
      expect(fs.existsSync(authorLocation)).to.be.true;
      expect(fs.readFileSync(authorLocation).toString()).to.equal(barFooV2);
      helper.fs.createFile('', 'foo2.js');
      helper.command.addComponent('foo2.js', { i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.getClonedLocalScope(importedScope);
      // Imported user update the component with the recent changes done by Authored user
      helper.command.importComponent('bar/foo');
      localConsumerFiles = helper.fs.getConsumerFiles();
    });
    it('should save only the latest copy of the component and delete the old one', () => {
      expect(localConsumerFiles).to.include(path.join('components', 'bar', 'foo', 'bar', 'foo.js'));
      expect(localConsumerFiles).to.include(path.join('components', 'bar', 'foo', 'foo2.js'));
      // this makes sure that the older copy of the component is gone
      expect(localConsumerFiles).not.to.include(path.join('components', 'bar', 'foo', 'foo.js'));
    });
  });
  describe('with new functionality (save added path as rootDir, no reduce on import)', () => {
    describe('when rootDir is not the same as the sharedDir', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
        helper.fs.outputFile('src/bar/foo.js');
        helper.command.addComponent('src', { i: 'comp' });
        helper.command.tagAllComponents();
        helper.command.export();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('comp');
      });
      it('should not strip the shared dir', () => {
        const bitMap = helper.bitMap.read();
        const componentMap = bitMap[`${helper.scopes.remote}/comp@0.0.1`];
        expect(componentMap.rootDir).to.equal('components/comp');
        expect(componentMap.mainFile).to.equal('bar/foo.js');
      });
    });
  });
  // most are skipped because we ended up not supporting this move from the old functionality to the new one
  // we might support it in the future in a different way, so I'm leaving it them as skipped
  describe('moving from old-functionality to the new one', () => {
    describe('when there is trackDir and not relative paths', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('src/foo.js');
        helper.command.addComponent('src', { i: 'foo' });
        helper.scopeHelper.switchFromLegacyToHarmony();
      });
      it('bit status should suggest running migration', () => {
        const status = helper.command.statusJson();
        expect(status.componentsWithTrackDirs).to.have.lengthOf(1);
        expect(status.componentsWithTrackDirs[0]).to.equal('foo');
      });
      describe('tagging the component', () => {
        before(() => {
          output = helper.command.tagAllComponents();
        });
        it('should tag successfully without errors', () => {
          expect(output).to.have.string('1 component(s) tagged');
        });
        it('should replace trackDir by rootDir', () => {
          const bitMap = helper.bitMap.read();
          const componentMap = bitMap.foo;
          expect(componentMap).to.not.have.property('trackDir');
          expect(componentMap).to.have.property('rootDir');
          expect(componentMap.rootDir).to.equal('src');
          const files = helper.command.getComponentFiles('foo@0.0.1');
          expect(files).to.include('foo.js');
        });
      });
    });
    describe('when there is trackDir and relative paths', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('src/foo/foo.js', 'require("../bar/bar");');
        helper.fs.outputFile('src/bar/bar.js');
        helper.command.addComponent('src/foo', { i: 'foo' });
        helper.command.addComponent('src/bar', { i: 'bar' });
        helper.scopeHelper.switchFromLegacyToHarmony();
      });
      it('should throw an error on tag', () => {
        const cmd = () => helper.command.tagAllComponents();
        const error = new FailedLoadForTag(['foo'], [], []);
        helper.general.expectToThrow(cmd, error);
      });
    });
    describe('when an individual file was added, no trackDir and no relative paths', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('foo.js');
        helper.command.addComponent('foo.js');
        helper.scopeHelper.switchFromLegacyToHarmony();
      });
      it('bit status should show the component an invalid', () => {
        const status = helper.command.status();
        expect(status).to.have.string('invalid components');
      });
      it('should throw an error about individual files used', () => {
        const cmd = () => helper.command.tagAllComponents();
        const error = new NoComponentDir('foo');
        helper.general.expectToThrow(cmd, error);
      });
    });
    describe('when there is no trackDir and relative paths are used', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('src/foo.js', 'require("./bar");');
        helper.fs.outputFile('src/bar.js');
        helper.command.addComponent('src/foo.js', { i: 'foo' });
        helper.command.addComponent('src/bar.js', { i: 'bar' });
        helper.scopeHelper.switchFromLegacyToHarmony();
      });
      it('bit status should show them as invalid', () => {
        const status = helper.command.statusJson();
        expect(status.invalidComponents).to.have.lengthOf(2);
      });
    });
    describe('using typescript (3.1.40) with capsule', () => {
      let authorLegacyScope;
      before(() => {
        const tsCompilerVersion = '3.1.40';
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.env.importTypescriptCompiler(tsCompilerVersion);
        const tsconfigES5 = helper.env.getTypeScriptSettingsForES5();
        const compilerName = `${helper.scopes.globalRemote}/compilers/typescript@${tsCompilerVersion}`;
        helper.bitJson.addKeyVal('env', {
          compiler: {
            [compilerName]: tsconfigES5,
          },
        });
        helper.fs.createFile('utils', 'is-type.ts', fixtures.isTypeTS);
        helper.command.addComponent('utils/is-type.ts', { i: 'utils/is-type' });
        helper.fs.createFile('utils', 'is-string.ts', fixtures.isStringTS);
        helper.command.addComponent('utils/is-string.ts', { i: 'utils/is-string' });
        helper.fs.createFile('bar', 'foo.ts', fixtures.barFooTS);
        helper.command.addComponent('bar/foo.ts', { i: 'bar/foo' });
        helper.command.build();
        helper.fs.outputFile('app.js', "const barFoo = require('./dist/bar/foo'); console.log(barFoo.default());");
      });
      it('should compile the files successfully and be able to run the app', () => {
        const output = helper.command.runCmd('node app.js');
        expect(output).to.have.string('got is-type and got is-string and got foo');
      });
      it('as authored legacy, should remove the shared-dir, as such, the capsule and workspace are not the same', () => {
        // as you can see the sharedDir "utils" had been removed when the files are written to the dist dir
        // that's because the sharedDir was removed on the capsule.
        expect(path.join(helper.scopes.localPath, 'dist/is-string.js')).to.be.a.file();
        expect(path.join(helper.scopes.localPath, 'dist/is-type.js')).to.be.a.file();
      });
      let importedScope;
      describe('as imported legacy', () => {
        before(() => {
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          authorLegacyScope = helper.scopeHelper.cloneLocalScope();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('*');
          importedScope = helper.scopeHelper.cloneLocalScope();
        });
        it('the app should work', () => {
          helper.fs.outputFile(
            'app.js',
            `const barFoo = require('@bit/${helper.scopes.remote}.bar.foo'); console.log(barFoo.default());`
          );
          const output = helper.command.runCmd('node app.js');
          expect(output).to.have.string('got is-type and got is-string and got foo');
        });
        it('should write the files without the shared-dir', () => {
          const expectedFile = path.join(helper.scopes.localPath, 'components/utils/is-string/is-string.ts');
          // the sharedDir "utils" had been removed
          expect(expectedFile).to.be.a.file();
        });
        describe('as authored, convert from relative path to module paths ', () => {
          let linkOutput;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(authorLegacyScope);
            linkOutput = helper.command.linkAndRewire();
            helper.command.build();
            helper.fs.outputFile(
              'app.js',
              `const barFoo = require('@bit/${helper.scopes.remote}.bar.foo'); console.log(barFoo.default());`
            );
          });
          it('should change the source code from relative to module paths', () => {
            expect(linkOutput).to.have.string('linked 3 components');
            const barFoo = helper.fs.readFile('bar/foo.ts');
            expect(barFoo).to.not.have.string('../utils/is-string');
            expect(barFoo).to.have.string('@bit/');
            expect(barFoo).to.have.string('utils.is-string');
          });
          it('should still work', () => {
            const output = helper.command.runCmd('node app.js');
            expect(output).to.have.string('got is-type and got is-string and got foo');
          });
          it('should still remove shared-dir on the capsule', () => {
            expect(path.join(helper.scopes.localPath, 'dist/is-string.js')).to.be.a.file();
            expect(path.join(helper.scopes.localPath, 'dist/is-type.js')).to.be.a.file();
          });
          it('the capsule should write the files without the shared dir', () => {
            // although it's an author env, the way how it works for all component is that
            // the shared-dir is remove when writing to the capsule.
            // it was done mainly for typescript component in order to have their links
            // saved in the dists in the model in the same way it's imported later.
            const capsuleDir = helper.general.generateRandomTmpDirName();
            helper.command.isolateComponentWithCapsule('utils/is-string', capsuleDir);
            expect(path.join(capsuleDir, 'is-string.ts')).to.be.a.file();
            expect(path.join(capsuleDir, 'utils/is-string.ts')).not.to.be.a.path();
          });
          let authorWithModulePaths;
          describe('tagging the components', () => {
            before(() => {
              helper.command.tagAllComponents();
              helper.command.exportAllComponents();
              authorWithModulePaths = helper.scopeHelper.cloneLocalScope();
            });
            it('should still work', () => {
              const output = helper.command.runCmd('node app.js');
              expect(output).to.have.string('got is-type and got is-string and got foo');
            });
            describe('importing the component ', () => {
              let importedWithRelative;
              before(() => {
                helper.scopeHelper.getClonedLocalScope(importedScope);
                helper.command.importComponent('* --override');
                importedWithRelative = helper.scopeHelper.cloneLocalScope();
              });
              it('the app should work', () => {
                helper.fs.outputFile(
                  'app.js',
                  `const barFoo = require('@bit/${helper.scopes.remote}.bar.foo'); console.log(barFoo.default());`
                );
                const output = helper.command.runCmd('node app.js');
                expect(output).to.have.string('got is-type and got is-string and got foo');
              });
              describe('as author, move individual component files to dedicated directory with bit move --component', () => {
                before(() => {
                  helper.scopeHelper.getClonedLocalScope(authorWithModulePaths);
                  helper.command.moveComponent('bar/foo', 'component/bar/foo');
                  helper.command.moveComponent('utils/is-string', 'component/utils/is-string');
                  helper.command.moveComponent('utils/is-type', 'component/utils/is-type');
                  helper.command.tagAllComponents();
                  helper.command.exportAllComponents();
                });
                it('should still work', () => {
                  const output = helper.command.runCmd('node app.js');
                  expect(output).to.have.string('got is-type and got is-string and got foo');
                });
                it('the capsule should write the files without the shared dir', () => {
                  // because they were moved to dedicated dirs, their rootDir was replaced to that dir
                  const capsuleDir = helper.general.generateRandomTmpDirName();
                  helper.command.isolateComponentWithCapsule('utils/is-string', capsuleDir);
                  expect(path.join(capsuleDir, 'is-string.ts')).to.be.a.file();
                  expect(path.join(capsuleDir, 'utils/is-string.ts')).not.to.be.a.path();
                });
                describe('as imported', () => {
                  before(() => {
                    helper.scopeHelper.getClonedLocalScope(importedWithRelative);
                    helper.command.importComponent('* --override');
                  });
                  it('the app should work', () => {
                    helper.fs.outputFile(
                      'app.js',
                      `const barFoo = require('@bit/${helper.scopes.remote}.bar.foo'); console.log(barFoo.default());`
                    );
                    const output = helper.command.runCmd('node app.js');
                    expect(output).to.have.string('got is-type and got is-string and got foo');
                  });
                  it('should write the files without the shared-dir', () => {
                    const expectedFile = path.join(helper.scopes.localPath, 'components/utils/is-string/is-string.ts');
                    // the sharedDir "utils" had not been removed
                    expect(expectedFile).to.be.a.file();
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
