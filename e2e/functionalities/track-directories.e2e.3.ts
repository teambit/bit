import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

// track directories functionality = add/rename files to rootDir.
describe('track directories functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('add directory with tests', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.createFile('utils/bar', 'foo.js');
      helper.fs.createFile('utils/bar', 'foo.spec.js');
      helper.command.addComponent('utils/bar', { t: 'utils/bar/foo.spec.js', i: 'utils/bar' });
      helper.fs.createFile('utils/bar', 'foo2.js');
      helper.command.runCmd('bit status');
    });
    it('should track the directories without changing the test files', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['utils/bar']).to.have.property('trackDir');
      expect(bitMap['utils/bar'].files).to.deep.include({
        relativePath: 'utils/bar/foo.spec.js',
        test: true,
        name: 'foo.spec.js',
      });
      expect(bitMap['utils/bar'].files).to.deep.include({
        relativePath: 'utils/bar/foo2.js',
        test: false,
        name: 'foo2.js',
      });
    });
  });
  describe('import a component with dependencies', () => {
    let barFooId;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      barFooId = `${helper.scopes.remote}/bar/foo@0.0.1`;
    });
    it('should not add trackDir field', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(barFooId);
      expect(bitMap[barFooId]).to.not.have.property('trackDir');
    });
    describe('adding a new file to the rootDir', () => {
      let statusOutput;
      let bitMap;
      let files;
      before(() => {
        helper.fs.createFile('components/bar/foo', 'foo2.js');
        statusOutput = helper.command.runCmd('bit status');
        bitMap = helper.bitMap.read();
        files = bitMap[barFooId].files;
      });
      it('bit status should show the component as modified', () => {
        expect(statusOutput).to.have.string('modified components');
        expect(statusOutput).to.have.string('bar/foo');
      });
      it('should track the file in bitMap', () => {
        expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
        expect(files).to.deep.include({ relativePath: 'foo2.js', test: false, name: 'foo2.js' });
      });
      it('should not track the link files', () => {
        files.forEach((file) => {
          expect(file.name).to.not.equal('is-string.js');
        });
      });
      it('should not track gitignore files', () => {
        files.forEach((file) => {
          expect(file.name).to.not.equal('package.json');
          expect(file.name).to.not.equal('package-lock.json');
        });
      });
      describe('tagging the component', () => {
        before(() => {
          helper.command.tagAllWithoutBuild();
          statusOutput = helper.command.runCmd('bit status');
        });
        it('bit status should show the component as staged and not as modified', () => {
          expect(statusOutput).to.have.string('staged components');
        });
        it('should save both files to the model', () => {
          const barFoo = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(barFoo.files[0].name).to.equal('foo.js');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(barFoo.files[1].name).to.equal('foo2.js');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(barFoo.files).to.have.lengthOf(2);
        });
      });
    });
  });
});
