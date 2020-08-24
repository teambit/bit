import { expect } from 'chai';
import * as path from 'path';

import DataToPersist from './data-to-persist';

describe('DataToPersist', function () {
  this.timeout(0);
  describe('addFile', () => {
    describe('dir/file collision', () => {
      it('should not throw when the existing file starts with the added file in the same dir', () => {
        const dataToPersist = new DataToPersist();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dataToPersist.addFile({ path: 'foo/bar.js' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const addFile = () => dataToPersist.addFile({ path: path.normalize('foo/bar.json') });
        expect(addFile).to.not.throw();
      });
      it('should not throw when the added file starts with the existing file in the same dir', () => {
        const dataToPersist = new DataToPersist();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dataToPersist.addFile({ path: path.normalize('foo/bar.json') });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const addFile = () => dataToPersist.addFile({ path: path.normalize('foo/bar.js') });
        expect(addFile).to.not.throw();
      });
      it('should throw when the added file is a directory of the existing file', () => {
        const dataToPersist = new DataToPersist();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dataToPersist.addFile({ path: path.normalize('foo/bar.js') });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const addFile = () => dataToPersist.addFile({ path: 'foo' });
        expect(addFile).to.throw();
      });
      it('should throw when the existing file is a directory of the added file', () => {
        const dataToPersist = new DataToPersist();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dataToPersist.addFile({ path: 'foo' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const addFile = () => dataToPersist.addFile({ path: path.normalize('foo/bar.js') });
        expect(addFile).to.throw();
      });
      it('should throw when one is a directory of other with a few levels', () => {
        let dataToPersist = new DataToPersist();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dataToPersist.addFile({ path: path.normalize('foo1/foo2') });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const addFile1 = () => dataToPersist.addFile({ path: path.normalize('foo1/foo2/foo3/foo4') });
        expect(addFile1).to.throw();

        dataToPersist = new DataToPersist();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dataToPersist.addFile({ path: path.normalize('foo1/foo2/foo3/foo4') });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const addFile2 = () => dataToPersist.addFile({ path: path.normalize('foo1/foo2') });
        expect(addFile2).to.throw();
      });
      it('should not throw when file are different', () => {
        let dataToPersist = new DataToPersist();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dataToPersist.addFile({ path: 'bar' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const addFile1 = () => dataToPersist.addFile({ path: 'foo' });
        expect(addFile1).to.not.throw();

        dataToPersist = new DataToPersist();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dataToPersist.addFile({ path: 'foo' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const addFile2 = () => dataToPersist.addFile({ path: 'bar' });
        expect(addFile2).to.not.throw();
      });
      it('should not throw when file are different with the same dir', () => {
        let dataToPersist = new DataToPersist();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dataToPersist.addFile({ path: path.normalize('bar/foo.js') });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const addFile1 = () => dataToPersist.addFile({ path: path.normalize('bar/baz.js') });
        expect(addFile1).to.not.throw();

        dataToPersist = new DataToPersist();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dataToPersist.addFile({ path: path.normalize('bar/baz.js') });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const addFile2 = () => dataToPersist.addFile({ path: path.normalize('bar/foo.js') });
        expect(addFile2).to.not.throw();
      });
    });
  });
});
