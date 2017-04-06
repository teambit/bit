// const mockFs = require('mock-fs');
import { writeSource } from '../../../src/importer/component/component';

jest.mock('fs-extra');
const fsMock = require('fs-extra');

beforeEach(() => {
  fsMock.outputFile.mockClear();
});

describe('component writeSource', () => {
  test('should save a source if contents and a file name supplied', (done) => {
    const mockObj = { this: 'contents' };
    writeSource('/tmp', 'file.js', mockObj).then(() => {
      expect(fsMock.outputFile.mock.calls[0][0]).toBe('/tmp/file.js');
      expect(fsMock.outputFile.mock.calls[0][1]).toEqual(mockObj);
      done();
    }).catch(e => done.fail(e));
  });

  test('should not save the source if the file name is not suplied', (done) => {
    const mockObj = { this: 'contents' };
    writeSource('/tmp', undefined, mockObj).then(() => {
      expect(fsMock.outputFile.mock.calls).toEqual([]);
      done();
    }).catch(e => done.fail(e));
  });

  test('should not save the source if the file contents are not suplied', (done) => {
    writeSource('/tmp', 'file.js', undefined).then(() => {
      expect(fsMock.outputFile.mock.calls).toEqual([]);
      done();
    }).catch(e => done.fail(e));
  });

  test('should throw an error if the containing directory is not supplied', (done) => {
    const mockObj = { this: 'contents' };
    writeSource(undefined, 'file.js', mockObj).then(() => done.fail()).catch(e => done(e));
  });
});
