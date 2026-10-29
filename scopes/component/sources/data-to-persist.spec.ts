import { expect } from 'chai';
import * as path from 'path';

import { DataToPersist } from './data-to-persist';
import type AbstractVinyl from './abstract-vinyl';

// only `path` is read by the collision logic, so a partial fixture is enough
const fakeVinyl = (filePath: string) => ({ path: filePath }) as unknown as AbstractVinyl;

describe('DataToPersist', () => {
  describe('addFile', () => {
    describe('dir/file collision', () => {
      it('should not throw when the existing file starts with the added file in the same dir', () => {
        const dataToPersist = new DataToPersist();
        dataToPersist.addFile(fakeVinyl('foo/bar.js'));
        const addFile = () => dataToPersist.addFile(fakeVinyl(path.normalize('foo/bar.json')));
        expect(addFile).to.not.throw();
      });
      it('should not throw when the added file starts with the existing file in the same dir', () => {
        const dataToPersist = new DataToPersist();
        dataToPersist.addFile(fakeVinyl(path.normalize('foo/bar.json')));
        const addFile = () => dataToPersist.addFile(fakeVinyl(path.normalize('foo/bar.js')));
        expect(addFile).to.not.throw();
      });
      it('should throw when the added file is a directory of the existing file', () => {
        const dataToPersist = new DataToPersist();
        dataToPersist.addFile(fakeVinyl(path.normalize('foo/bar.js')));
        const addFile = () => dataToPersist.addFile(fakeVinyl('foo'));
        expect(addFile).to.throw();
      });
      it('should throw when the existing file is a directory of the added file', () => {
        const dataToPersist = new DataToPersist();
        dataToPersist.addFile(fakeVinyl('foo'));
        const addFile = () => dataToPersist.addFile(fakeVinyl(path.normalize('foo/bar.js')));
        expect(addFile).to.throw();
      });
      it('should throw when one is a directory of other with a few levels', () => {
        let dataToPersist = new DataToPersist();
        dataToPersist.addFile(fakeVinyl(path.normalize('foo1/foo2')));
        const addFile1 = () => dataToPersist.addFile(fakeVinyl(path.normalize('foo1/foo2/foo3/foo4')));
        expect(addFile1).to.throw();

        dataToPersist = new DataToPersist();
        dataToPersist.addFile(fakeVinyl(path.normalize('foo1/foo2/foo3/foo4')));
        const addFile2 = () => dataToPersist.addFile(fakeVinyl(path.normalize('foo1/foo2')));
        expect(addFile2).to.throw();
      });
      it('should not throw when file are different', () => {
        let dataToPersist = new DataToPersist();
        dataToPersist.addFile(fakeVinyl('bar'));
        const addFile1 = () => dataToPersist.addFile(fakeVinyl('foo'));
        expect(addFile1).to.not.throw();

        dataToPersist = new DataToPersist();
        dataToPersist.addFile(fakeVinyl('foo'));
        const addFile2 = () => dataToPersist.addFile(fakeVinyl('bar'));
        expect(addFile2).to.not.throw();
      });
      it('should not throw when file are different with the same dir', () => {
        let dataToPersist = new DataToPersist();
        dataToPersist.addFile(fakeVinyl(path.normalize('bar/foo.js')));
        const addFile1 = () => dataToPersist.addFile(fakeVinyl(path.normalize('bar/baz.js')));
        expect(addFile1).to.not.throw();

        dataToPersist = new DataToPersist();
        dataToPersist.addFile(fakeVinyl(path.normalize('bar/baz.js')));
        const addFile2 = () => dataToPersist.addFile(fakeVinyl(path.normalize('bar/foo.js')));
        expect(addFile2).to.not.throw();
      });
    });
  });
});
