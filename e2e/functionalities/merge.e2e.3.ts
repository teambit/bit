import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import { MergeConflict, MergeConflictOnRemote } from '../../src/scope/exceptions';

describe('merge functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('re-exporting/importing an existing version', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();

      helper.fs.createFile('bar2', 'foo2.js');
      helper.command.addComponent('bar2/foo2.js', { i: 'bar2/foo2' });
      helper.command.tagComponent('bar2/foo2');

      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      helper.command.importComponent('bar2/foo2');
      const scopeWithV1 = helper.scopeHelper.cloneLocalScope();
      helper.command.tagComponent('bar/foo', 'msg', '-f');
      helper.command.tagComponent('bar2/foo2', 'msg', '-f');
      helper.command.exportAllComponents(); // v2 is exported

      helper.scopeHelper.getClonedLocalScope(scopeWithV1);
      helper.command.tagComponent('bar/foo', 'msg', '-f');
      helper.command.tagComponent('bar2/foo2', 'msg', '-f');
    });
    it('should throw MergeConflictOnRemote error when exporting the component', () => {
      const exportFunc = () => helper.command.exportAllComponents(); // v2 is exported again
      const idsAndVersions = [
        { id: `${helper.scopes.remote}/bar/foo`, versions: ['0.0.2'] },
        { id: `${helper.scopes.remote}/bar2/foo2`, versions: ['0.0.2'] },
      ];
      const error = new MergeConflictOnRemote(idsAndVersions, []);
      helper.general.expectToThrow(exportFunc, error);
    });
    it('should throw MergeConflict error when importing the component', () => {
      const importFunc = () => helper.command.importComponent('bar/foo');
      const error = new MergeConflict(`${helper.scopes.remote}/bar/foo`, ['0.0.2']);
      expect(importFunc).to.throw(error.message);
      expect(importFunc).to.not.throw('unhandled rejection found');
    });
  });
  describe('importing a component with --merge flag', () => {
    let beforeImport;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsType();
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      beforeImport = helper.scopeHelper.cloneLocalScope();
      helper.command.importComponent('utils/is-type@0.0.1');
    });
    describe('using invalid value for merge flag', () => {
      let output;
      before(() => {
        output = helper.general.runWithTryCatch('bit import utils/is-type --merge=invalid');
      });
      it('should throw an error', () => {
        expect(output).to.have.string('merge must be one of the following');
      });
    });
    describe('modifying the component so it will get conflict upon importing', () => {
      let localScope;
      before(() => {
        helper.fs.createFile('components/utils/is-type', 'is-type.js', fixtures.isTypeV3);
        localScope = helper.scopeHelper.cloneLocalScope();
      });
      describe('merge with strategy=manual', () => {
        let output;
        let fileContent;
        before(() => {
          output = helper.command.importComponent('utils/is-type --merge=manual');
          fileContent = helper.fs.readFile('components/utils/is-type/is-type.js');
        });
        it('should indicate that there were files with conflicts', () => {
          expect(output).to.have.string('conflicts');
        });
        it('should rewrite the file with the conflict with the conflicts segments', () => {
          expect(fileContent).to.have.string('<<<<<<<');
          expect(fileContent).to.have.string('>>>>>>>');
          expect(fileContent).to.have.string('=======');
        });
        it('should label the conflicts segments according to the versions', () => {
          expect(fileContent).to.have.string('<<<<<<< 0.0.2'); // current-change
          expect(fileContent).to.have.string('>>>>>>> 0.0.1 modified'); // incoming-change
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
        it('should update bitmap with the imported version', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`);
        });
      });
      describe('merge with strategy=theirs', () => {
        let output;
        let fileContent;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          output = helper.command.importComponent('utils/is-type --merge=theirs');
          fileContent = helper.fs.readFile('components/utils/is-type/is-type.js');
        });
        it('should not indicate that there were files with conflicts', () => {
          expect(output).to.not.have.string('conflicts');
        });
        it('should rewrite the file according to the imported version', () => {
          expect(fileContent).to.have.string(fixtures.isTypeV2);
        });
        it('should not show the component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.not.have.string('modified components');
        });
        it('should update bitmap with the imported version', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`);
        });
      });
      describe('merge with strategy=ours', () => {
        let output;
        let fileContent;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          output = helper.command.importComponent('utils/is-type --merge=ours');
          fileContent = helper.fs.readFile('components/utils/is-type/is-type.js');
        });
        it('should not indicate that there were files with conflicts', () => {
          expect(output).to.not.have.string('conflicts');
        });
        it('should leave the modified file intact', () => {
          expect(fileContent).to.have.string(fixtures.isTypeV3);
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).have.string('modified components');
        });
        it('should update bitmap with the imported version', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`);
        });
      });
    });
    describe('modifying the component to be the same as the imported component (so the merge will succeed with no conflicts)', () => {
      before(() => {
        helper.fs.createFile('components/utils/is-type', 'is-type.js', fixtures.isTypeV2);
      });
      describe('merge with strategy=manual', () => {
        // strategies of ours and theirs are leading to the same results
        let output;
        let fileContent;
        before(() => {
          output = helper.command.importComponent('utils/is-type --merge=manual');
          fileContent = helper.fs.readFile('components/utils/is-type/is-type.js');
        });
        it('should not indicate that there were files with conflicts', () => {
          expect(output).to.not.have.string('conflicts');
        });
        it('should rewrite the file according to both the imported version and modified version', () => {
          expect(fileContent).to.have.string(fixtures.isTypeV2);
        });
        it('should not show the component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.not.have.string('modified components');
        });
        it('should update bitmap with the imported version', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`);
        });
      });
    });
    describe('modifying the dependency then import --merge of the dependent', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeImport);
        helper.command.importComponent('utils/is-type');
        helper.command.importComponent('utils/is-string');
        helper.fs.createFile('components/utils/is-type', 'is-type.js', fixtures.isTypeV3);
        // an intermediate step, make sure bit status shows as modified
        expect(helper.command.statusComponentIsModified(`${helper.scopes.remote}/utils/is-type@0.0.2`)).to.be.true;
        helper.command.importComponent('utils/is-string --merge');
      });
      it('should not remove the dependency changes', () => {
        const isTypeContent = helper.fs.readFile('components/utils/is-type/is-type.js');
        expect(isTypeContent).to.equal(fixtures.isTypeV3);
        expect(helper.command.statusComponentIsModified(`${helper.scopes.remote}/utils/is-type@0.0.2`)).to.be.true;
      });
    });
  });
});
