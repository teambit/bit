import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { MergeConflict, MergeConflictOnRemote } from '../../src/scope/exceptions';
import * as fixtures from '../fixtures/fixtures';

describe('merge functionality', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('re-exporting/importing an existing version', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();

      helper.createFile('bar2', 'foo2.js');
      helper.addComponent('bar2/foo2.js', { i: 'bar2/foo2' });
      helper.tagComponent('bar2/foo2');

      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      helper.importComponent('bar2/foo2');
      const scopeWithV1 = helper.cloneLocalScope();
      helper.tagComponent('bar/foo', 'msg', '-f');
      helper.tagComponent('bar2/foo2', 'msg', '-f');
      helper.exportAllComponents(); // v2 is exported

      helper.getClonedLocalScope(scopeWithV1);
      helper.tagComponent('bar/foo', 'msg', '-f');
      helper.tagComponent('bar2/foo2', 'msg', '-f');
    });
    it('should throw MergeConflictOnRemote error when exporting the component', () => {
      const exportFunc = () => helper.exportAllComponents(); // v2 is exported again
      const idsAndVersions = [
        { id: `${helper.remoteScope}/bar/foo`, versions: ['0.0.2'] },
        { id: `${helper.remoteScope}/bar2/foo2`, versions: ['0.0.2'] }
      ];
      const error = new MergeConflictOnRemote(idsAndVersions);
      helper.expectToThrow(exportFunc, error);
    });
    it('should throw MergeConflict error when importing the component', () => {
      const importFunc = () => helper.importComponent('bar/foo');
      const error = new MergeConflict(`${helper.remoteScope}/bar/foo`, ['0.0.2']);
      helper.expectToThrow(importFunc, error);
    });
  });
  describe('import an older version of a component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();

      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();

      helper.tagAllComponents();
      helper.exportAllComponents();
      const clonedScope = helper.cloneRemoteScope();

      helper.createFile('utils', 'is-type.js', fixtures.isTypeV2); // modify is-type
      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type'); // v2

      helper.getClonedRemoteScope(clonedScope);
      helper.importComponent('utils/is-string'); // v1
    });
    it('the second import should not override the previously imported component', () => {
      const catScope = helper.catScope();
      const isTypeObject = catScope.find(c => c.name === 'utils/is-type');
      expect(Object.keys(isTypeObject.versions).length).to.equal(2);
      expect(isTypeObject.versions).to.have.property('0.0.2');
    });
  });
  describe('importing a component with --merge flag', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.tagAllComponents();
      helper.createFile('utils', 'is-type.js', fixtures.isTypeV2);
      helper.addComponentUtilsIsType();
      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type@0.0.1');
    });
    describe('using invalid value for merge flag', () => {
      let output;
      before(() => {
        output = helper.runWithTryCatch('bit import utils/is-type --merge=invalid');
      });
      it('should throw an error', () => {
        expect(output).to.have.string('merge must be one of the following');
      });
    });
    describe('modifying the component so it will get conflict upon importing', () => {
      let localScope;
      before(() => {
        helper.createFile('components/utils/is-type', 'is-type.js', fixtures.isTypeV3);
        localScope = helper.cloneLocalScope();
      });
      describe('merge with strategy=manual', () => {
        let output;
        let fileContent;
        before(() => {
          output = helper.importComponent('utils/is-type --merge=manual');
          fileContent = helper.readFile('components/utils/is-type/is-type.js');
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
          const statusOutput = helper.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
        it('should update bitmap with the imported version', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
        });
      });
      describe('merge with strategy=theirs', () => {
        let output;
        let fileContent;
        before(() => {
          helper.getClonedLocalScope(localScope);
          output = helper.importComponent('utils/is-type --merge=theirs');
          fileContent = helper.readFile('components/utils/is-type/is-type.js');
        });
        it('should not indicate that there were files with conflicts', () => {
          expect(output).to.not.have.string('conflicts');
        });
        it('should rewrite the file according to the imported version', () => {
          expect(fileContent).to.have.string(fixtures.isTypeV2);
        });
        it('should not show the component as modified', () => {
          const statusOutput = helper.runCmd('bit status');
          expect(statusOutput).to.not.have.string('modified components');
        });
        it('should update bitmap with the imported version', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
        });
      });
      describe('merge with strategy=ours', () => {
        let output;
        let fileContent;
        before(() => {
          helper.getClonedLocalScope(localScope);
          output = helper.importComponent('utils/is-type --merge=ours');
          fileContent = helper.readFile('components/utils/is-type/is-type.js');
        });
        it('should not indicate that there were files with conflicts', () => {
          expect(output).to.not.have.string('conflicts');
        });
        it('should leave the modified file intact', () => {
          expect(fileContent).to.have.string(fixtures.isTypeV3);
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.runCmd('bit status');
          expect(statusOutput).have.string('modified components');
        });
        it('should update bitmap with the imported version', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
        });
      });
    });
    describe('modifying the component to be the same as the imported component (so the merge will succeed with no conflicts)', () => {
      before(() => {
        helper.createFile('components/utils/is-type', 'is-type.js', fixtures.isTypeV2);
      });
      describe('merge with strategy=manual', () => {
        // strategies of ours and theirs are leading to the same results
        let output;
        let fileContent;
        before(() => {
          output = helper.importComponent('utils/is-type --merge=manual');
          fileContent = helper.readFile('components/utils/is-type/is-type.js');
        });
        it('should not indicate that there were files with conflicts', () => {
          expect(output).to.not.have.string('conflicts');
        });
        it('should rewrite the file according to both the imported version and modified version', () => {
          expect(fileContent).to.have.string(fixtures.isTypeV2);
        });
        it('should not show the component as modified', () => {
          const statusOutput = helper.runCmd('bit status');
          expect(statusOutput).to.not.have.string('modified components');
        });
        it('should update bitmap with the imported version', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
        });
      });
    });
    // describe('bit import with no ids', () => {});
  });
});
